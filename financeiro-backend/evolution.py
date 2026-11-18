"""Integracao com Evolution API (WhatsApp): agradecimento com foto do recibo.

Fluxo: apos confirmar a contribuicao, o tesoureiro envia ao contribuinte uma
mensagem de agradecimento. Quando a renda veio da conferencia de recibos, a
foto do recibo vai junto como comprovante do registro.

Config (variaveis de ambiente):
- EVOLUTION_API_URL: ex.: https://evo.sua-igreja.com
- EVOLUTION_API_KEY: apikey global da Evolution
- EVOLUTION_INSTANCE: nome da instancia conectada
"""
import base64
import calendar
import datetime
import json
import logging
import os
import re

import httpx
from fastapi import APIRouter, Body, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload

import crud
import models
import ocr
import recibos
import schemas
import security
from database import get_db

router = APIRouter(tags=["Evolution (WhatsApp)"])
logger = logging.getLogger(__name__)

TIMEOUT_SEGUNDOS = 30

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


class AgradecerPayload(BaseModel):
    mensagem: str | None = None  # substitui o texto padrao quando informada


def configurado() -> bool:
    return bool(os.environ.get("EVOLUTION_API_URL") and os.environ.get("EVOLUTION_API_KEY")
                and os.environ.get("EVOLUTION_INSTANCE"))


def normalizar_numero(telefone: str) -> str | None:
    """Normaliza para o formato da Evolution (55 + DDD + numero). None se invalido."""
    digitos = re.sub(r"\D", "", telefone or "")
    if digitos.startswith("55") and len(digitos) in (12, 13):
        digitos = digitos[2:]
    if len(digitos) not in (10, 11):
        return None
    return "55" + digitos


def mensagem_padrao(nome: str, congregacao: str, valor: float, numero_recibo: str | None, data) -> str:
    valor_fmt = f"R$ {valor:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    recibo = f"recibo nº {numero_recibo}" if numero_recibo else "contribuição registrada"
    data_fmt = data.strftime("%d/%m/%Y") if data else ""
    return (
        f"Olá, {nome}! A {congregacao} agradece a sua contribuição de {valor_fmt} "
        f"({recibo}, {data_fmt}). Segue a foto do seu recibo como comprovante do registro. Deus abençoe!"
    )


def enviar_mensagem(numero: str, texto: str, imagem_bytes: bytes | None = None) -> None:
    """Envia texto (ou imagem com legenda) via Evolution. Levanta ValueError se falhar."""
    base = os.environ.get("EVOLUTION_API_URL", "").rstrip("/")
    chave = os.environ.get("EVOLUTION_API_KEY", "")
    instancia = os.environ.get("EVOLUTION_INSTANCE", "")
    headers = {"apikey": chave, "Content-Type": "application/json"}
    try:
        if imagem_bytes:
            resp = httpx.post(
                f"{base}/message/sendMedia/{instancia}",
                headers=headers,
                json={
                    "number": numero,
                    "mediatype": "image",
                    "media": base64.b64encode(imagem_bytes).decode("ascii"),
                    "caption": texto,
                    "fileName": "recibo.png",
                },
                timeout=TIMEOUT_SEGUNDOS,
            )
        else:
            resp = httpx.post(
                f"{base}/message/sendText/{instancia}",
                headers=headers,
                json={"number": numero, "text": texto},
                timeout=TIMEOUT_SEGUNDOS,
            )
    except httpx.HTTPError as exc:
        raise ValueError(f"Falha de rede na Evolution API: {exc}") from exc
    if resp.status_code not in (200, 201):
        raise ValueError(f"Evolution recusou o envio (HTTP {resp.status_code}): {resp.text[:300]}")


def _carregar_imagem_recibo(renda: models.Renda) -> bytes | None:
    """Devolve os bytes da foto do recibo, ou None quando a renda nao tem foto."""
    if not renda.recibo_imagem:
        return None
    import recibos as modulo_recibos  # import local: evita ciclo na importacao
    caminho = modulo_recibos._caminho_absoluto(renda.recibo_imagem)
    if not os.path.exists(caminho):
        raise HTTPException(status_code=500, detail="Foto do recibo não encontrada no servidor.")
    with open(caminho, "rb") as f:
        return f.read()


def _preparar_envio(db: Session, renda_id: int, current_user: models.Usuario) -> tuple[models.Renda, str, str]:
    """Validacoes comuns: devolve (renda, numero, nome)."""
    db_renda = (
        db.query(models.Renda)
        .options(joinedload(models.Renda.dizimista_ofertante), joinedload(models.Renda.congregacao))
        .filter(models.Renda.id == renda_id)
        .first()
    )
    if not db_renda:
        raise HTTPException(status_code=404, detail="Renda não encontrada.")
    verificar_acesso_congregacao(current_user, db_renda.congregacao)
    _bloquear_dirigente(current_user)
    if not configurado():
        raise HTTPException(status_code=400, detail="Evolution API não configurada (EVOLUTION_API_URL/KEY/INSTANCE).")
    if not db_renda.dizimista_ofertante or not (db_renda.dizimista_ofertante.telefone or "").strip():
        raise HTTPException(status_code=400, detail="Contribuinte sem telefone cadastrado.")
    numero = normalizar_numero(db_renda.dizimista_ofertante.telefone)
    if not numero:
        raise HTTPException(status_code=400, detail=f"Telefone inválido: {db_renda.dizimista_ofertante.telefone}.")
    return db_renda, numero, db_renda.dizimista_ofertante.nome


@router.post("/rendas/{renda_id}/agradecer")
def agradecer_renda_endpoint(
    renda_id: int,
    payload: AgradecerPayload | None = None,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    db_renda, numero, nome = _preparar_envio(db, renda_id, current_user)
    texto = (payload.mensagem or "").strip() if payload else ""
    if not texto:
        texto = mensagem_padrao(nome, db_renda.congregacao.nome, db_renda.valor,
                                db_renda.numero_recibo, db_renda.data_registro)
    imagem = _carregar_imagem_recibo(db_renda)
    try:
        enviar_mensagem(numero, texto, imagem)
    except ValueError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    db_renda.mensagem_enviada_em = datetime.datetime.now(datetime.timezone.utc)
    db.commit()
    return {"renda_id": renda_id, "numero": numero, "com_imagem": imagem is not None,
            "mensagem_enviada_em": db_renda.mensagem_enviada_em.isoformat()}


@router.post("/semanas/{semana_id}/agradecer-todos")
def agradecer_semana_endpoint(
    semana_id: int,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    db_semana = (
        db.query(models.Semana)
        .options(joinedload(models.Semana.rendas).joinedload(models.Renda.dizimista_ofertante))
        .filter(models.Semana.id == semana_id)
        .first()
    )
    if not db_semana:
        raise HTTPException(status_code=404, detail="Semana não encontrada.")
    verificar_acesso_congregacao(current_user, db_semana.mes.congregacao)
    _bloquear_dirigente(current_user)
    if not configurado():
        raise HTTPException(status_code=400, detail="Evolution API não configurada (EVOLUTION_API_URL/KEY/INSTANCE).")

    resultado = {"enviadas": [], "ja_enviadas": [], "sem_telefone": [], "falhas": []}
    for renda in db_semana.rendas:
        if renda.mensagem_enviada_em is not None:
            resultado["ja_enviadas"].append(renda.id)
            continue
        telefone = (renda.dizimista_ofertante.telefone if renda.dizimista_ofertante else "") or ""
        numero = normalizar_numero(telefone.strip())
        if not numero:
            resultado["sem_telefone"].append(renda.id)
            continue
        try:
            texto = mensagem_padrao(renda.dizimista_ofertante.nome, db_semana.mes.congregacao.nome,
                                    renda.valor, renda.numero_recibo, renda.data_registro)
            enviar_mensagem(numero, texto, _carregar_imagem_recibo(renda))
        except (ValueError, HTTPException) as exc:
            resultado["falhas"].append({"renda_id": renda.id, "erro": str(exc)[:200]})
            continue
        renda.mensagem_enviada_em = datetime.datetime.now(datetime.timezone.utc)
        db.commit()
        resultado["enviadas"].append(renda.id)
    return resultado


def _chaves_telefone(telefone: str | None) -> set[str]:
    """Gera chaves equivalentes com e sem DDI 55 e com e sem o 9o digito."""
    if not telefone:
        return set()
    limpo = re.sub(r"@.*$", "", str(telefone))
    digitos = re.sub(r"\D", "", limpo)
    if len(digitos) < 10:
        return set()

    if digitos.startswith("55") and len(digitos) in (12, 13):
        local = digitos[2:]
    elif len(digitos) in (10, 11):
        local = digitos
    else:
        return {digitos}

    chaves = {local, "55" + local}
    if len(local) == 10:
        com_nove = local[:2] + "9" + local[2:]
        chaves.update({com_nove, "55" + com_nove})
    elif len(local) == 11 and local[2] == "9":
        sem_nove = local[:2] + local[3:]
        chaves.update({sem_nove, "55" + sem_nove})
    return chaves


def _encontrar_usuario_por_telefone(db: Session, telefone_remetente: str) -> models.Usuario | None:
    """Filtro 1: retorna usuario ativo cujo telefone casa com o remetente."""
    chaves_rem = _chaves_telefone(telefone_remetente)
    if not chaves_rem:
        return None
    usuarios = (
        db.query(models.Usuario)
        .filter(
            models.Usuario.is_active.is_(True),
            models.Usuario.telefone.isnot(None),
        )
        .order_by(models.Usuario.id)
        .all()
    )
    # Prioriza tesoureiros quando houver mais de um usuario com o mesmo numero.
    ordenados = sorted(usuarios, key=lambda u: 0 if u.funcao == "tesoureiro" else 1)
    for usuario in ordenados:
        if chaves_rem & _chaves_telefone(usuario.telefone):
            return usuario
    return None


def _obter_ou_criar_semana_para_recibo(
    db: Session, congregacao_id: int, data_str: str | None = None
) -> models.Semana:
    """Encontra a semana aberta da congregacao (ou cria mes/semana inicial se preciso)."""
    meses_abertos = (
        db.query(models.Mes)
        .options(joinedload(models.Mes.semanas))
        .filter(
            models.Mes.congregacao_id == congregacao_id,
            models.Mes.fechado.is_(False),
        )
        .order_by(models.Mes.id.desc())
        .all()
    )

    dt_alvo: datetime.date | None = None
    if data_str:
        try:
            dt_alvo = datetime.date.fromisoformat(str(data_str).strip())
        except ValueError:
            dt_alvo = None

    if dt_alvo:
        for mes in meses_abertos:
            for sem in sorted(mes.semanas, key=lambda s: s.numero):
                if sem.data_inicio and sem.data_fim:
                    try:
                        ini = datetime.date.fromisoformat(sem.data_inicio)
                        fim = datetime.date.fromisoformat(sem.data_fim)
                        if ini <= dt_alvo <= fim:
                            return sem
                    except ValueError:
                        continue

    for mes in meses_abertos:
        if mes.semanas:
            return sorted(mes.semanas, key=lambda s: s.numero)[-1]

    ref = dt_alvo or datetime.date.today()
    mes_destino = meses_abertos[0] if meses_abertos else crud.create_mes(
        db,
        schemas.MesCreate(
            nome=ref.strftime("%Y/%m"),
            congregacao_id=congregacao_id,
            saldo_inicial=0.0,
        ),
    )
    ultimo_dia = calendar.monthrange(ref.year, ref.month)[1]
    return crud.create_semana(
        db,
        schemas.SemanaCreate(
            numero=1,
            data_inicio=ref.replace(day=1).isoformat(),
            data_fim=ref.replace(day=ultimo_dia).isoformat(),
            despesas=[],
        ),
        mes_id=mes_destino.id,
    )


def _resolver_congregacao_webhook(db: Session, usuario: models.Usuario) -> int | None:
    if usuario.congregacao_id:
        return usuario.congregacao_id
    query = db.query(models.Congregacao)
    if usuario.funcao == "supervisor_area" and usuario.area_id:
        query = query.filter(models.Congregacao.area_id == usuario.area_id)
    elif usuario.denominacao_id:
        query = query.filter(models.Congregacao.denominacao_id == usuario.denominacao_id)
    else:
        return None
    cong = query.order_by(models.Congregacao.id).first()
    return cong.id if cong else None


def _extrair_base64_imagem(payload: dict, data: dict) -> str | None:
    msg = data.get("message") if isinstance(data.get("message"), dict) else {}
    img_msg = msg.get("imageMessage") if isinstance(msg.get("imageMessage"), dict) else {}
    candidatos = (
        msg.get("base64"),
        img_msg.get("base64"),
        data.get("base64"),
        payload.get("base64"),
    )
    for item in candidatos:
        if isinstance(item, str) and item.strip():
            return item.strip()
    return None


def _parece_recibo_ocr(rec: models.ReciboPendente) -> bool:
    if not rec.sugestao_ocr:
        return False
    try:
        sug = json.loads(rec.sugestao_ocr)
    except (TypeError, ValueError):
        return False
    return any(sug.get(campo) is not None and str(sug.get(campo)).strip() != "" for campo in ("valor", "numero_recibo", "nome"))


def _encaminhar_webhook_ignorado(payload: dict) -> None:
    """Repassa para outro sistema (ex.: bot AletheIA) quando a mensagem nao for recibo."""
    url = os.environ.get("EVOLUTION_FORWARD_WEBHOOK_URL", "").strip()
    if not url:
        return
    try:
        httpx.post(url, json=payload, timeout=15)
    except Exception:
        pass


def _ignorar_e_encaminhar(payload: dict, motivo: str) -> dict:
    _encaminhar_webhook_ignorado(payload)
    return {"status": "ignorado", "motivo": motivo}


@router.post("/webhooks/evolution")
def webhook_evolution_endpoint(
    payload: dict = Body(...),
    db: Session = Depends(get_db),
):
    """Recebe eventos da Evolution API e filtra apenas fotos de recibo de tesoureiros cadastrados."""
    data = payload.get("data") if isinstance(payload.get("data"), dict) else payload
    key = data.get("key") if isinstance(data.get("key"), dict) else {}
    if key.get("fromMe"):
        return {"status": "ignorado", "motivo": "mensagem_propria"}

    remote_jid = key.get("remoteJid") or data.get("remoteJid") or payload.get("sender") or ""
    if str(remote_jid).endswith("@g.us"):
        return _ignorar_e_encaminhar(payload, "grupo")

    # Filtro 1: apenas numeros cadastrados no sistema.
    usuario = _encontrar_usuario_por_telefone(db, str(remote_jid))
    if not usuario:
        return _ignorar_e_encaminhar(payload, "remetente_nao_autorizado")
    if usuario.funcao == "dirigente":
        return _ignorar_e_encaminhar(payload, "funcao_somente_leitura")

    # Filtro 2: apenas mensagens contendo imagem em base64.
    b64 = _extrair_base64_imagem(payload, data)
    if not b64:
        return _ignorar_e_encaminhar(payload, "sem_imagem")
    b64_limpo = re.sub(r"^data:[^;]+;base64,", "", b64)
    b64_limpo = re.sub(r"\s+", "", b64_limpo)
    try:
        imagem_bytes = base64.b64decode(b64_limpo, validate=True)
    except Exception:
        return _ignorar_e_encaminhar(payload, "imagem_invalida")

    congregacao_id = _resolver_congregacao_webhook(db, usuario)
    if not congregacao_id:
        return _ignorar_e_encaminhar(payload, "sem_congregacao")

    det = recibos._mime_por_magic(imagem_bytes)
    ext = det[0] if det else ".png"
    semana = _obter_ou_criar_semana_para_recibo(db, congregacao_id)
    criados = recibos.processar_arquivos_upload(db, semana, [(f"whatsapp{ext}", imagem_bytes)])

    # Filtro 3: quando OCR esta ativo, descarta fotos aleatorias que nao sejam recibo.
    if ocr.ocr_disponivel():
        finais: list[models.ReciboPendente] = []
        for rec in criados:
            try:
                finais.extend(recibos._aplicar_ocr_no_recibo(db, rec))
            except Exception as exc:
                rec.ocr_erro = str(exc)[:300]
                finais.append(rec)

        recibos_validos = [r for r in finais if _parece_recibo_ocr(r)]
        if not recibos_validos:
            caminhos = [recibos._caminho_absoluto(r.arquivo) for r in finais if r.arquivo]
            for r in finais:
                if r not in db.deleted:
                    db.delete(r)
            db.commit()
            for caminho in caminhos:
                try:
                    if os.path.exists(caminho):
                        os.remove(caminho)
                except OSError:
                    pass
            return _ignorar_e_encaminhar(payload, "nao_eh_recibo")

        db.commit()
        return {
            "status": "processado",
            "congregacao_id": congregacao_id,
            "recibo_ids": [r.id for r in recibos_validos],
        }

    return {
        "status": "processado",
        "congregacao_id": congregacao_id,
        "recibo_ids": [r.id for r in criados],
    }
