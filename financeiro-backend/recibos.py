"""Upload de fotos/PDF de recibos + conferencia assistida + lancamento.

Fluxo (recibos sao manuscritos: nada e lancado sem confirmacao humana):
1. Tesoureiro envia PDF escaneado e/ou fotos dos recibos da semana
   (POST /semanas/{id}/recibos/upload). Cada pagina vira uma imagem PNG.
2. Se o OCR estiver configurado, cada imagem e lida em segundo plano e a
   sugestao (data, recibo, nome, valor) fica salva no registro.
3. Na tela de conferencia o tesoureiro ve foto + campos (pre-preenchidos
   quando ha OCR), ajusta e confirma (POST /recibos/{id}/confirmar), o que
   cria a Renda vinculada a imagem e recalcula os saldos do mes.
"""
import datetime
import difflib
import io
import json
import os
import re
import unicodedata
import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse, Response
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

import crud
import models
import ocr
import schemas
import security
from database import SessionLocal, get_db

router = APIRouter(tags=["Recibos"])

# Raiz do armazenamento (relativa ao diretorio do backend, como database.py).
# Testes podem sobrescrever via monkeypatch.
BASE_DIR = os.path.join("data", "recibos")
MAX_PAGINAS_POR_UPLOAD = 60
DPI_RENDER_PDF = 150
EXTENSOES_IMAGEM = {".png", ".jpg", ".jpeg", ".webp"}


# --- Auth duplicada de main.py: evitar import circular (main importa este router). ---
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")


def get_current_user(db: Session = Depends(get_db), token: str = Depends(oauth2_scheme)) -> models.Usuario:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Não foi possível validar as credenciais",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, security.SECRET_KEY, algorithms=[security.ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    user = crud.get_user_by_email(db, email=email)
    if user is None:
        raise credentials_exception
    return user


def verificar_acesso_congregacao(current_user: models.Usuario, congregacao: models.Congregacao) -> None:
    """Mesmo padrao de main.verificar_acesso_congregacao (dirigente pode ler)."""
    if current_user.is_superuser:
        return
    if current_user.funcao == "administrador":
        return
    if current_user.funcao == "supervisor_denominacao" and current_user.denominacao_id == congregacao.denominacao_id:
        return
    if current_user.funcao == "supervisor_area" and current_user.area_id == congregacao.area_id:
        return
    if current_user.funcao in ("dirigente", "tesoureiro") and current_user.congregacao_id == congregacao.id:
        return
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Acesso negado. Você não tem permissão para acessar os dados financeiros desta congregação.",
    )


def _bloquear_dirigente(current_user: models.Usuario) -> None:
    if current_user.funcao == "dirigente":
        raise HTTPException(status_code=403, detail="Acesso negado. Dirigentes podem apenas visualizar dados financeiros.")


_TERMOS_CULTO = (
    "culto",
    "oferta",
    "missao",
    "missoes",
    "campanha",
    "cec",
    "celebracao",
    "doutrina",
    "oracao",
)


def _normalizar_nome(nome: str) -> str:
    """Minusculas, sem acento, espacos colapsados — so p/ comparacao."""
    nome = unicodedata.normalize("NFKD", nome.strip().lower())
    nome = "".join(ch for ch in nome if not unicodedata.combining(ch))
    return re.sub(r"\s+", " ", nome)


def _parece_descricao_culto(nome: str | None) -> bool:
    if not nome or not nome.strip():
        return False
    tokens = _normalizar_nome(nome).split()
    return any(tok in _TERMOS_CULTO for tok in tokens)


def _tokens_em_ordem(busca: list[str], candidato: list[str]) -> bool:
    """True se todos os tokens de busca aparecem em ordem no candidato."""
    it = iter(candidato)
    return all(tok in it for tok in busca)


def _buscar_dizimista_aproximado(
    nome: str | None,
    existentes: list[models.DizimistaOfertante],
) -> models.DizimistaOfertante | None:
    """Encontra um dizimista cadastrado mesmo com abreviacoes ou pequenos erros de OCR."""
    if not nome or not nome.strip() or _parece_descricao_culto(nome):
        return None
    chave = _normalizar_nome(nome)
    if not chave:
        return None

    # 1. Igualdade exata normalizada.
    for diz in existentes:
        if _normalizar_nome(diz.nome) == chave:
            return diz

    # 2. Todos os tokens na mesma ordem (ex.: "Debora Barros" -> "Débora Lima Barros").
    tokens_busca = chave.split()
    if any(len(t) >= 4 for t in tokens_busca):
        correspondentes: list[tuple[float, models.DizimistaOfertante]] = []
        for diz in existentes:
            cand_norm = _normalizar_nome(diz.nome)
            tokens_cand = cand_norm.split()
            if _tokens_em_ordem(tokens_busca, tokens_cand):
                score = difflib.SequenceMatcher(None, chave, cand_norm).ratio()
                correspondentes.append((score, diz))
        # Se for apenas 1 palavra (ex.: "Maria"), so vincula se for unica na congregacao.
        if len(tokens_busca) >= 2 and correspondentes:
            correspondentes.sort(key=lambda item: item[0], reverse=True)
            return correspondentes[0][1]
        if len(tokens_busca) == 1 and len(correspondentes) == 1:
            return correspondentes[0][1]

    # 3. Similaridade aproximada (ex.: "Nicoly Nery" -> "Nicolly Neri").
    melhor_ratio = 0.0
    melhor_diz: models.DizimistaOfertante | None = None
    for diz in existentes:
        cand_norm = _normalizar_nome(diz.nome)
        ratio = difflib.SequenceMatcher(None, chave, cand_norm).ratio()
        if ratio >= 0.84 and ratio > melhor_ratio:
            melhor_ratio = ratio
            melhor_diz = diz
    return melhor_diz


def _enriquecer_sugestao_com_dizimista(
    sugestao: dict,
    existentes: list[models.DizimistaOfertante],
) -> dict:
    """Adiciona dizimista_id/dizimista_nome_cadastro quando houver match e ajusta Oferta de culto."""
    enriquecida = dict(sugestao)
    nome = enriquecida.get("nome")
    if _parece_descricao_culto(nome):
        if not enriquecida.get("tipo"):
            enriquecida["tipo"] = "Oferta"
        return enriquecida
    diz = _buscar_dizimista_aproximado(nome, existentes)
    if diz is not None:
        enriquecida["dizimista_id"] = diz.id
        enriquecida["dizimista_nome_cadastro"] = diz.nome
    return enriquecida


def _recortar_e_girar_imagem(
    imagem_bytes: bytes,
    box_2d: list | None = None,
    rotacao_graus: int | None = None,
) -> bytes:
    """Recorta um recibo na folha (box_2d [ymin, xmin, ymax, xmax] 0..1000) e gira em 90/180/270."""
    precisa_rotacao = rotacao_graus in (90, 180, 270)
    precisa_crop = False
    coords: tuple[float, float, float, float] | None = None
    if isinstance(box_2d, (list, tuple)) and len(box_2d) == 4:
        try:
            ymin, xmin, ymax, xmax = (float(c) for c in box_2d)
            if 0 <= ymin < ymax <= 1000 and 0 <= xmin < xmax <= 1000:
                area = ((ymax - ymin) / 1000.0) * ((xmax - xmin) / 1000.0)
                if area <= 0.95:
                    precisa_crop = True
                    coords = (ymin, xmin, ymax, xmax)
        except (TypeError, ValueError):
            pass

    if not precisa_crop and not precisa_rotacao:
        return imagem_bytes

    try:
        import fitz
    except ImportError:
        return imagem_bytes

    det = _mime_por_magic(imagem_bytes)
    filetype = det[0].lstrip(".") if det else None
    try:
        doc = fitz.open(stream=imagem_bytes, filetype=filetype)
    except Exception:
        return imagem_bytes

    pdf = None
    try:
        pdf = fitz.open("pdf", doc.convert_to_pdf())
        pagina = pdf[0]
        rect = pagina.rect
        if precisa_crop and coords is not None:
            ymin, xmin, ymax, xmax = coords
            pagina.set_cropbox(
                fitz.Rect(
                    rect.x0 + (xmin / 1000.0) * rect.width,
                    rect.y0 + (ymin / 1000.0) * rect.height,
                    rect.x0 + (xmax / 1000.0) * rect.width,
                    rect.y0 + (ymax / 1000.0) * rect.height,
                )
            )
        if precisa_rotacao and rotacao_graus is not None:
            pagina.set_rotation(int(rotacao_graus))
        return pagina.get_pixmap(dpi=DPI_RENDER_PDF).tobytes("png")
    except Exception:
        return imagem_bytes
    finally:
        if pdf is not None:
            pdf.close()
        doc.close()


def _caminho_absoluto(rel: str) -> str:
    """Resolve o caminho relativo e garante que ele esta dentro de BASE_DIR."""
    base = os.path.abspath(BASE_DIR)
    alvo = os.path.abspath(os.path.join(base, rel))
    if alvo != base and not alvo.startswith(base + os.sep):
        raise HTTPException(status_code=400, detail="Caminho de arquivo inválido.")
    return alvo


def _mime_por_magic(conteudo: bytes) -> tuple[str, str] | None:
    """Detecta (extensao, mime) pelos primeiros bytes. None se desconhecido."""
    if conteudo.startswith(b"\x89PNG\r\n\x1a\n"):
        return (".png", "image/png")
    if conteudo.startswith(b"\xff\xd8\xff"):
        return (".jpg", "image/jpeg")
    if conteudo.startswith(b"RIFF") and conteudo[8:12] == b"WEBP":
        return (".webp", "image/webp")
    return None


def _salvar_arquivo(dados: bytes, ext: str, congregacao_id: int, semana_id: int) -> str:
    """Salva os bytes e devolve o caminho relativo para gravar no banco."""
    rel = os.path.join(str(congregacao_id), str(semana_id), f"{uuid.uuid4().hex}{ext}")
    destino = _caminho_absoluto(rel)
    os.makedirs(os.path.dirname(destino), exist_ok=True)
    with open(destino, "wb") as f:
        f.write(dados)
    return rel


def _paginas_png(conteudo: bytes, nome: str) -> list[tuple[bytes, str, int | None]]:
    """Converte um arquivo enviado em [(bytes, extensao, pagina_origem|None)].

    Com PyMuPDF: PDF -> uma imagem PNG por pagina; imagem -> normalizada p/ PNG.
    Sem PyMuPDF: imagens sao aceitas como estao (validadas pelo conteudo);
    PDF e recusado com mensagem clara.
    Levanta ValueError quando o arquivo nao e reconhecido.
    """
    eh_pdf = nome.lower().endswith(".pdf")
    try:
        import fitz  # PyMuPDF: divide PDF em paginas e normaliza imagens p/ PNG
    except ImportError:
        fitz = None
    if fitz is None:
        if eh_pdf:
            raise ValueError("Envio de PDF indisponível: biblioteca PyMuPDF não instalada no servidor.")
        det = _mime_por_magic(conteudo)
        if not det:
            raise ValueError(f"Arquivo inválido ou corrompido: {nome}")
        return [(conteudo, det[0], None)]
    try:
        doc = fitz.open(stream=conteudo, filetype="pdf" if eh_pdf else None)
    except Exception as exc:
        raise ValueError(f"Arquivo inválido ou corrompido: {nome}") from exc
    paginas = []
    try:
        # PDF abre com N paginas; imagem avulsa abre como documento de 1 pagina.
        for i, pagina in enumerate(doc):
            pix = pagina.get_pixmap(dpi=DPI_RENDER_PDF)
            paginas.append((pix.tobytes("png"), ".png", i + 1 if doc.is_pdf else None))
    finally:
        doc.close()
    if not paginas:
        raise ValueError(f"Arquivo vazio ou sem páginas: {nome}")
    return paginas


def _normalizar_num_recibo(num: str | None) -> str:
    if not num:
        return ""
    limpo = re.sub(r"\s+", "", str(num).strip())
    if not limpo:
        return ""
    sem_zeros = limpo.lstrip("0")
    return sem_zeros or "0"


def _parear_recibo_na_semana(db: Session, rec: models.ReciboPendente) -> models.ReciboPendente:
    """Cruza o recibo recem-lido com outro pendente da mesma semana pelo numero_recibo."""
    if not rec.sugestao_ocr:
        return rec
    try:
        sug_atual = json.loads(rec.sugestao_ocr)
    except (TypeError, ValueError):
        return rec

    num_norm = _normalizar_num_recibo(sug_atual.get("numero_recibo"))
    if not num_norm:
        return rec

    outros = (
        db.query(models.ReciboPendente)
        .filter(
            models.ReciboPendente.semana_id == rec.semana_id,
            models.ReciboPendente.id != rec.id,
            models.ReciboPendente.status == "pendente",
            models.ReciboPendente.arquivo_par.is_(None),
        )
        .order_by(models.ReciboPendente.id)
        .all()
    )
    for outro in outros:
        if not outro.sugestao_ocr:
            continue
        try:
            sug_outro = json.loads(outro.sugestao_ocr)
        except (TypeError, ValueError):
            continue
        if _normalizar_num_recibo(sug_outro.get("numero_recibo")) != num_norm:
            continue

        principal = outro
        secundario = rec
        sug_pri = sug_outro
        sug_sec = sug_atual
        v1 = sug_pri.get("valor")
        v2 = sug_sec.get("valor")
        if v1 is not None and v2 is not None:
            status_conf = "conferido_ok" if abs(float(v1) - float(v2)) < 0.01 else "divergente"
        else:
            status_conf = "pareado_sem_valor"

        sug_pri["status_conferencia"] = status_conf
        sug_pri["valor_par"] = v2
        sug_pri["via_par"] = sug_sec.get("via")
        if not sug_pri.get("nome") and sug_sec.get("nome"):
            sug_pri["nome"] = sug_sec["nome"]
        if not sug_pri.get("dizimista_id") and sug_sec.get("dizimista_id"):
            sug_pri["dizimista_id"] = sug_sec["dizimista_id"]
            sug_pri["dizimista_nome_cadastro"] = sug_sec.get("dizimista_nome_cadastro")
        if not sug_pri.get("data") and sug_sec.get("data"):
            sug_pri["data"] = sug_sec["data"]
        if not sug_pri.get("tipo") and sug_sec.get("tipo"):
            sug_pri["tipo"] = sug_sec["tipo"]

        principal.arquivo_par = secundario.arquivo
        principal.sugestao_par = secundario.sugestao_ocr
        principal.sugestao_ocr = json.dumps(sug_pri, ensure_ascii=False)
        db.delete(secundario)
        db.flush()
        return principal

    return rec


def _aplicar_ocr_no_recibo(db: Session, rec: models.ReciboPendente) -> list[models.ReciboPendente]:
    """Executa OCR no recibo (1 ou varios na mesma folha), recorta/gira, vincula e pareia."""
    caminho_antigo = _caminho_absoluto(rec.arquivo)
    with open(caminho_antigo, "rb") as f:
        imagem = f.read()

    det = _mime_por_magic(imagem)
    mime = det[1] if det else "image/png"
    existentes = crud.get_dizimistas_ofertantes_by_congregacao(db, rec.congregacao_id, limit=10_000)
    nomes_conhecidos = [d.nome for d in existentes]

    if hasattr(ocr, "extrair_recibos"):
        resultados = ocr.extrair_recibos(imagem, mime=mime, nomes_conhecidos=nomes_conhecidos)
    else:
        resultados = [ocr.extrair_recibo(imagem, mime=mime)]

    if not resultados:
        raise ValueError("Nenhum recibo identificado na imagem.")

    arquivo_substituido = False
    processados: list[models.ReciboPendente] = []
    for idx, sug in enumerate(resultados):
        nova_img = _recortar_e_girar_imagem(imagem, sug.get("box_2d"), sug.get("rotacao_graus"))
        sug_enriquecida = _enriquecer_sugestao_com_dizimista(sug, existentes)
        sug_json = json.dumps(sug_enriquecida, ensure_ascii=False)

        if idx == 0:
            if len(resultados) > 1 or nova_img != imagem:
                rel_novo = _salvar_arquivo(nova_img, ".png", rec.congregacao_id, rec.semana_id)
                rec.arquivo = rel_novo
                arquivo_substituido = True
            rec.sugestao_ocr = sug_json
            rec.ocr_erro = None
            processados.append(rec)
        else:
            rel_novo = _salvar_arquivo(nova_img, ".png", rec.congregacao_id, rec.semana_id)
            novo_rec = models.ReciboPendente(
                congregacao_id=rec.congregacao_id,
                semana_id=rec.semana_id,
                arquivo=rel_novo,
                pagina_origem=rec.pagina_origem,
                status="pendente",
                sugestao_ocr=sug_json,
            )
            db.add(novo_rec)
            processados.append(novo_rec)

    if arquivo_substituido and _caminho_absoluto(rec.arquivo) != caminho_antigo:
        try:
            if os.path.exists(caminho_antigo):
                os.remove(caminho_antigo)
        except OSError:
            pass

    db.flush()
    finais: list[models.ReciboPendente] = []
    for item in processados:
        if item in db.deleted:
            continue
        finais.append(_parear_recibo_na_semana(db, item))
    return finais


def _processar_ocr_em_lote(recibo_ids: list[int]) -> None:
    """Roda o OCR de cada recibo e salva a sugestao (tarefa de fundo)."""
    db = SessionLocal()
    try:
        for recibo_id in recibo_ids:
            rec = db.query(models.ReciboPendente).filter(models.ReciboPendente.id == recibo_id).first()
            if not rec or rec.status != "pendente":
                continue
            try:
                _aplicar_ocr_no_recibo(db, rec)
            except Exception as exc:  # OCR nunca pode quebrar o upload.
                rec.ocr_erro = str(exc)[:300]
            db.commit()
    finally:
        db.close()


def _resolver_dizimista(db: Session, congregacao_id: int, payload: schemas.ReciboPendenteConfirmar) -> int | None:
    """Id informado vence; senao, cria/vincula pelo nome; senao, anonimo."""
    if payload.dizimista_ofertante_id is not None:
        diz = crud.get_dizimista_ofertante_by_id(db, payload.dizimista_ofertante_id)
        if not diz or diz.congregacao_id != congregacao_id:
            raise HTTPException(status_code=400, detail="Dizimista inválido para esta congregação.")
        return diz.id
    nome = (payload.dizimista_nome or "").strip()
    if nome:
        chave = _normalizar_nome(nome)
        existentes = crud.get_dizimistas_ofertantes_by_congregacao(db, congregacao_id, limit=10_000)
        for diz in existentes:
            if _normalizar_nome(diz.nome) == chave:
                return diz.id
        novo = crud.create_dizimista_ofertante(db, schemas.DizimistaOfertanteCreate(nome=nome), congregacao_id)
        return novo.id
    return None


@router.post("/semanas/{semana_id}/recibos/upload", response_model=list[schemas.ReciboPendente], status_code=status.HTTP_201_CREATED)
async def upload_recibos_endpoint(
    semana_id: int,
    background_tasks: BackgroundTasks,
    files: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    db_semana = db.query(models.Semana).filter(models.Semana.id == semana_id).first()
    if not db_semana:
        raise HTTPException(status_code=404, detail="Semana não encontrada.")
    verificar_acesso_congregacao(current_user, db_semana.mes.congregacao)
    _bloquear_dirigente(current_user)
    if db_semana.mes.fechado:
        raise HTTPException(status_code=400, detail="Não é possível enviar recibos para um mês fechado.")
    if not files:
        raise HTTPException(status_code=400, detail="Nenhum arquivo enviado.")

    arquivos = [(a.filename or "sem-nome", await a.read()) for a in files]
    criados = processar_arquivos_upload(db, db_semana, arquivos)

    if ocr.ocr_disponivel():
        background_tasks.add_task(_processar_ocr_em_lote, [r.id for r in criados])
    return criados


def processar_arquivos_upload(
    db: Session, db_semana: models.Semana, arquivos: list[tuple[str, bytes]]
) -> list[models.ReciboPendente]:
    """Nucleo sincrono do upload: valida, converte e persiste os recibos."""
    congregacao_id = db_semana.mes.congregacao_id
    semana_id = db_semana.id
    criados: list[models.ReciboPendente] = []
    total_paginas = 0
    for nome, conteudo in arquivos:
        ext = os.path.splitext(nome)[1].lower()
        if ext != ".pdf" and ext not in EXTENSOES_IMAGEM:
            raise HTTPException(status_code=400, detail=f"Tipo não suportado: {nome} (envie PDF, PNG ou JPG).")
        try:
            paginas = _paginas_png(conteudo, nome)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        total_paginas += len(paginas)
        if total_paginas > MAX_PAGINAS_POR_UPLOAD:
            raise HTTPException(status_code=400, detail=f"Limite de {MAX_PAGINAS_POR_UPLOAD} páginas por envio.")
        for dados, ext_saida, pagina in paginas:
            rel = _salvar_arquivo(dados, ext_saida, congregacao_id, semana_id)
            rec = models.ReciboPendente(
                congregacao_id=congregacao_id,
                semana_id=semana_id,
                arquivo=rel,
                pagina_origem=pagina,
                status="pendente",
            )
            db.add(rec)
            criados.append(rec)
    db.commit()
    for rec in criados:
        db.refresh(rec)
    return criados


@router.get("/semanas/{semana_id}/recibos/", response_model=list[schemas.ReciboPendente])
def listar_recibos_endpoint(
    semana_id: int,
    status_filtro: str | None = None,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    db_semana = db.query(models.Semana).filter(models.Semana.id == semana_id).first()
    if not db_semana:
        raise HTTPException(status_code=404, detail="Semana não encontrada.")
    verificar_acesso_congregacao(current_user, db_semana.mes.congregacao)
    query = db.query(models.ReciboPendente).filter(models.ReciboPendente.semana_id == semana_id)
    if status_filtro:
        if status_filtro not in ("pendente", "confirmado"):
            raise HTTPException(status_code=400, detail="status_filtro deve ser 'pendente' ou 'confirmado'.")
        query = query.filter(models.ReciboPendente.status == status_filtro)
    return query.order_by(models.ReciboPendente.id).all()


def _serve_imagem_arquivo(rel: str | None) -> FileResponse:
    if not rel:
        raise HTTPException(status_code=404, detail="Imagem do recibo não encontrada.")
    caminho = _caminho_absoluto(rel)
    if not os.path.exists(caminho):
        raise HTTPException(status_code=404, detail="Imagem do recibo não encontrada.")
    with open(caminho, "rb") as f:
        det = _mime_por_magic(f.read(12))
    return FileResponse(caminho, media_type=det[1] if det else "application/octet-stream")


@router.get("/recibos/{recibo_id}/imagem")
def imagem_recibo_endpoint(
    recibo_id: int,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    rec = db.query(models.ReciboPendente).filter(models.ReciboPendente.id == recibo_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Recibo não encontrado.")
    verificar_acesso_congregacao(current_user, rec.congregacao)
    return _serve_imagem_arquivo(rec.arquivo)


@router.get("/recibos/{recibo_id}/imagem-par")
def imagem_recibo_par_endpoint(
    recibo_id: int,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    rec = db.query(models.ReciboPendente).filter(models.ReciboPendente.id == recibo_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Recibo não encontrado.")
    verificar_acesso_congregacao(current_user, rec.congregacao)
    if not rec.arquivo_par:
        raise HTTPException(status_code=404, detail="Este recibo não possui imagem pareada.")
    return _serve_imagem_arquivo(rec.arquivo_par)


@router.post("/recibos/{recibo_id}/ocr/reprocessar", response_model=schemas.ReciboPendente)
def reprocessar_ocr_endpoint(
    recibo_id: int,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    rec = db.query(models.ReciboPendente).filter(models.ReciboPendente.id == recibo_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Recibo não encontrado.")
    verificar_acesso_congregacao(current_user, rec.congregacao)
    _bloquear_dirigente(current_user)
    if rec.status != "pendente":
        raise HTTPException(status_code=400, detail="Só é possível rodar o OCR em recibos pendentes.")
    if not ocr.ocr_disponivel():
        raise HTTPException(status_code=400, detail="OCR indisponível: configure a chave do provedor (MODEL_API_KEY ou GEMINI_API_KEY).")
    alvo = rec
    try:
        finais = _aplicar_ocr_no_recibo(db, rec)
        if finais:
            alvo = finais[0]
    except ValueError as exc:
        rec.ocr_erro = str(exc)[:300]
    db.commit()
    db.refresh(alvo)
    return alvo


@router.post("/semanas/{semana_id}/recibos/confirmar-conferidos")
def confirmar_conferidos_endpoint(
    semana_id: int,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    """Confirma em lote todos os recibos com 1a e 2a via conferidas sem divergencia."""
    db_semana = db.query(models.Semana).filter(models.Semana.id == semana_id).first()
    if not db_semana:
        raise HTTPException(status_code=404, detail="Semana não encontrada.")
    verificar_acesso_congregacao(current_user, db_semana.mes.congregacao)
    _bloquear_dirigente(current_user)
    if db_semana.mes.fechado:
        raise HTTPException(status_code=400, detail="Não é possível lançar rendas em um mês fechado.")

    pendentes = (
        db.query(models.ReciboPendente)
        .filter(
            models.ReciboPendente.semana_id == semana_id,
            models.ReciboPendente.status == "pendente",
        )
        .order_by(models.ReciboPendente.id)
        .all()
    )

    confirmados: list[int] = []
    ignorados: list[int] = []

    for rec in pendentes:
        try:
            sug = json.loads(rec.sugestao_ocr) if rec.sugestao_ocr else {}
        except (TypeError, ValueError):
            ignorados.append(rec.id)
            continue

        if sug.get("status_conferencia") != "conferido_ok":
            ignorados.append(rec.id)
            continue

        valor_raw = sug.get("valor")
        try:
            valor = float(valor_raw)
        except (TypeError, ValueError):
            ignorados.append(rec.id)
            continue
        if valor <= 0:
            ignorados.append(rec.id)
            continue

        data_str = sug.get("data") or db_semana.data_inicio
        try:
            data_reg = datetime.date.fromisoformat(str(data_str).strip())
        except (TypeError, ValueError):
            ignorados.append(rec.id)
            continue

        if db_semana.data_inicio and db_semana.data_fim:
            try:
                ini = datetime.datetime.strptime(db_semana.data_inicio, "%Y-%m-%d").date()
                fim = datetime.datetime.strptime(db_semana.data_fim, "%Y-%m-%d").date()
                if not (ini <= data_reg <= fim):
                    ignorados.append(rec.id)
                    continue
            except ValueError:
                pass

        numero_recibo = (sug.get("numero_recibo") or "").strip() or None
        if numero_recibo:
            ja_existe = (
                db.query(models.Renda)
                .filter(
                    models.Renda.congregacao_id == rec.congregacao_id,
                    models.Renda.numero_recibo == numero_recibo,
                    models.Renda.valor == valor,
                )
                .first()
            )
            if ja_existe:
                ignorados.append(rec.id)
                continue

        tipo = sug.get("tipo") if sug.get("tipo") in ("Dízimo", "Oferta") else "Dízimo"
        nome_lido = (sug.get("nome") or "").strip() or None
        eh_culto = _parece_descricao_culto(nome_lido)
        payload_conf = schemas.ReciboPendenteConfirmar(
            tipo=tipo,
            valor=valor,
            data_registro=data_reg,
            numero_recibo=numero_recibo,
            observacao=nome_lido if eh_culto else None,
            metodo_pagamento="Espécie",
            dizimista_ofertante_id=None if eh_culto else sug.get("dizimista_id"),
            dizimista_nome=None if (eh_culto or sug.get("dizimista_id")) else nome_lido,
        )
        try:
            dizimista_id = _resolver_dizimista(db, rec.congregacao_id, payload_conf)
        except HTTPException:
            dizimista_id = None

        nova_renda = models.Renda(
            tipo=payload_conf.tipo,
            valor=payload_conf.valor,
            data_registro=payload_conf.data_registro,
            numero_recibo=payload_conf.numero_recibo,
            observacao=payload_conf.observacao,
            recibo_imagem=rec.arquivo,
            metodo_pagamento=payload_conf.metodo_pagamento,
            congregacao_id=rec.congregacao_id,
            semana_id=rec.semana_id,
            dizimista_ofertante_id=dizimista_id,
        )
        db.add(nova_renda)
        db.flush()
        rec.status = "confirmado"
        rec.renda_id = nova_renda.id
        confirmados.append(rec.id)

    if confirmados:
        db.commit()
        crud.recalcular_saldos_mes(db, db_semana.mes_id)

    return {"confirmados": confirmados, "ignorados": ignorados}


@router.post("/recibos/{recibo_id}/confirmar", response_model=schemas.Renda, status_code=status.HTTP_201_CREATED)
def confirmar_recibo_endpoint(
    recibo_id: int,
    payload: schemas.ReciboPendenteConfirmar,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    rec = db.query(models.ReciboPendente).filter(models.ReciboPendente.id == recibo_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Recibo não encontrado.")
    verificar_acesso_congregacao(current_user, rec.congregacao)
    _bloquear_dirigente(current_user)
    if rec.status != "pendente":
        raise HTTPException(status_code=400, detail="Este recibo já foi confirmado.")
    db_semana = rec.semana
    if db_semana.mes.fechado:
        raise HTTPException(status_code=400, detail="Não é possível lançar rendas em um mês fechado.")

    # Mesma validacao de data do endpoint de renda manual.
    if db_semana.data_inicio and db_semana.data_fim:
        try:
            ini = datetime.datetime.strptime(db_semana.data_inicio, "%Y-%m-%d").date()
            fim = datetime.datetime.strptime(db_semana.data_fim, "%Y-%m-%d").date()
            if not (ini <= payload.data_registro <= fim):
                raise HTTPException(
                    status_code=400,
                    detail=f"A data da renda ({payload.data_registro}) deve estar dentro do período da semana ({db_semana.data_inicio} a {db_semana.data_fim}).",
                )
        except ValueError as exc:
            # Formato de data da semana invalido no banco: ignora como no endpoint manual.
            if isinstance(exc, HTTPException):
                raise
            pass

    # Anti-duplicata: mesma congregacao + mesmo recibo + mesmo valor.
    if payload.numero_recibo:
        ja_existe = (
            db.query(models.Renda)
            .filter(
                models.Renda.congregacao_id == rec.congregacao_id,
                models.Renda.numero_recibo == payload.numero_recibo,
                models.Renda.valor == payload.valor,
            )
            .first()
        )
        if ja_existe:
            raise HTTPException(status_code=409, detail=f"Já existe um lançamento de R$ {payload.valor:.2f} com o recibo {payload.numero_recibo}.")

    dizimista_id = _resolver_dizimista(db, rec.congregacao_id, payload)
    nova_renda = models.Renda(
        tipo=payload.tipo,
        valor=payload.valor,
        data_registro=payload.data_registro,
        numero_recibo=payload.numero_recibo,
        observacao=payload.observacao,
        recibo_imagem=rec.arquivo,
        metodo_pagamento=payload.metodo_pagamento,
        congregacao_id=rec.congregacao_id,
        semana_id=rec.semana_id,
        dizimista_ofertante_id=dizimista_id,
    )
    db.add(nova_renda)
    db.flush()
    rec.status = "confirmado"
    rec.renda_id = nova_renda.id
    db.commit()
    crud.recalcular_saldos_mes(db, db_semana.mes_id)
    db.refresh(nova_renda)
    return nova_renda


@router.delete("/recibos/{recibo_id}", status_code=status.HTTP_204_NO_CONTENT)
def excluir_recibo_endpoint(
    recibo_id: int,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    rec = db.query(models.ReciboPendente).filter(models.ReciboPendente.id == recibo_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Recibo não encontrado.")
    verificar_acesso_congregacao(current_user, rec.congregacao)
    _bloquear_dirigente(current_user)
    if rec.status != "pendente":
        raise HTTPException(status_code=400, detail="Recibo já confirmado: exclua a renda vinculada em vez disso.")
    caminho = _caminho_absoluto(rec.arquivo)
    caminho_par = _caminho_absoluto(rec.arquivo_par) if rec.arquivo_par else None
    db.delete(rec)
    db.commit()
    for arq in (caminho, caminho_par):
        if arq:
            try:
                if os.path.exists(arq):
                    os.remove(arq)
            except OSError:
                pass
    return Response(status_code=status.HTTP_204_NO_CONTENT)
