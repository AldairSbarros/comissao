"""
Importador da planilha legada "Relatório Financeiro" para dentro do sistema.

Formato da planilha (reverse-engenheirado — ver instruções do projeto, não
reinventar sem conferir contra o arquivo real de novo):

- Cada aba representa uma congregação+mês. Nome no padrão `C{congregacao}-{mes}-{ano}`
  (ex.: `C9-01-26`), com variações fora do padrão (`C9-04-3-26`, `C09-08-26`).
  O número da congregação na aba é o `numero_co` da Congregacao, não o `id` do banco.
- Bloco de dízimos: linha 6 até a linha onde a coluna F contém "Qtde Dizimistas".
  G=data, H=nº recibo, I=nome do contribuinte, L=valor.
- Bloco de ofertas: começa na linha com F == "Data" (procurada a partir do fim
  do bloco de dízimos). F=data, G=recibo (pode faltar), H=valor, I=observação.
  Termina na primeira linha cuja fórmula em H comece com "=SUM" — por isso a
  planilha é aberta duas vezes (data_only=True para valores, False para achar
  essa linha pelas fórmulas).

Simplificação deliberada: cada mês importado vira UMA ÚNICA Semana contendo
todos os lançamentos do mês (dízimos + ofertas) de todas as abas daquele mês.
Isso NÃO é o fluxo semanal normal da digitação manual (que tem até 5 semanas
por mês) — é só para dar entrada no histórico de uma vez. O usuário pode
reabrir o mês depois e reorganizar por semana pela tela normal, se quiser.
"""
import io
import re
import unicodedata
from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from jose import JWTError, jwt
from sqlalchemy.orm import Session

import crud
import models
import schemas
import security
from database import get_db

router = APIRouter(tags=["Importador"])

SHEET_RE = re.compile(r"C0?(\d+)-(\d+)")

# A planilha não registra método de pagamento (Pix/Espécie/etc.) por lançamento;
# o campo é obrigatório no modelo Renda, então usamos um valor fixo para dados
# importados. Quem revisar o histórico pode editar renda a renda depois.
METODO_PAGAMENTO_IMPORTADO = "Não informado (importado da planilha)"


# --- Auth duplicada de main.py: evitar import circular (main importa este router). ---
# Mesma lógica exata de get_current_user / verificar_acesso_congregacao em main.py.
from fastapi.security import OAuth2PasswordBearer

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
    """Checagem positiva de autorização: mesmo padrão de main.verificar_acesso_congregacao."""
    if current_user.is_superuser:
        return
    if current_user.funcao == "administrador":
        return
    if current_user.funcao == "supervisor_denominacao" and current_user.denominacao_id == congregacao.denominacao_id:
        return
    if current_user.funcao == "supervisor_area" and current_user.area_id == congregacao.area_id:
        return
    if current_user.funcao == "tesoureiro" and current_user.congregacao_id == congregacao.id:
        return
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Acesso negado. Você não tem permissão para acessar os dados financeiros desta congregação.",
    )


def _normalizar_nome(nome: str) -> str:
    """minúsculas, sem acento, espaços colapsados — só para comparação, nunca para exibir."""
    nome = unicodedata.normalize("NFKD", nome.strip().lower())
    nome = "".join(ch for ch in nome if not unicodedata.combining(ch))
    return re.sub(r"\s+", " ", nome)


def _to_date(valor, fallback: date) -> date:
    if isinstance(valor, datetime):
        return valor.date()
    if isinstance(valor, date):
        return valor
    return fallback


def _to_recibo_str(valor):
    if valor is None or valor == "":
        return None
    if isinstance(valor, float):
        return str(int(valor)) if valor.is_integer() else str(valor)
    return str(valor).strip() or None


def _extrair_lancamentos_aba(ws_valores, ws_formulas, ano: int, mes_num: int) -> list[dict]:
    """Extrai os lançamentos (dízimos + ofertas) de uma aba, no formato conhecido."""
    lancamentos = []
    data_fallback = date(ano, mes_num, 1)
    limite_seguranca = (ws_valores.max_row or 6) + 10

    # --- Bloco de dízimos: linha 6 até achar "Qtde Dizimistas" na coluna F ---
    row = 6
    while row <= limite_seguranca:
        f_val = ws_valores.cell(row=row, column=6).value
        if isinstance(f_val, str) and "Qtde Dizimistas" in f_val:
            break
        valor_val = ws_valores.cell(row=row, column=12).value  # L
        if isinstance(valor_val, (int, float)):
            nome_val = ws_valores.cell(row=row, column=9).value  # I
            lancamentos.append({
                "tipo": "Dízimo",
                "valor": float(valor_val),
                "data_registro": _to_date(ws_valores.cell(row=row, column=7).value, data_fallback),  # G
                "numero_recibo": _to_recibo_str(ws_valores.cell(row=row, column=8).value),  # H
                "nome": str(nome_val).strip() if nome_val else "Sem nome",
            })
        row += 1
    fim_dizimo = row

    # --- Bloco de ofertas: procura a linha com F == "Data" a partir do fim do bloco de dízimos ---
    row = fim_dizimo
    limite_header = fim_dizimo + 50
    achou_header = False
    while row <= limite_header:
        f_val = ws_valores.cell(row=row, column=6).value
        if isinstance(f_val, str) and f_val.strip() == "Data":
            achou_header = True
            break
        row += 1
    if not achou_header:
        return lancamentos  # aba sem bloco de ofertas reconhecível

    row += 1  # primeira linha de dados
    limite_ofertas = row + 500
    while row <= limite_ofertas:
        h_formula = ws_formulas.cell(row=row, column=8).value
        if isinstance(h_formula, str) and h_formula.startswith("=SUM"):
            break
        valor_val = ws_valores.cell(row=row, column=8).value  # H
        if isinstance(valor_val, (int, float)):
            obs_val = ws_valores.cell(row=row, column=9).value  # I (texto original, não normalizar)
            lancamentos.append({
                "tipo": "Oferta",
                "valor": float(valor_val),
                "data_registro": _to_date(ws_valores.cell(row=row, column=6).value, data_fallback),  # F
                "numero_recibo": _to_recibo_str(ws_valores.cell(row=row, column=7).value),  # G
                "observacao": str(obs_val) if obs_val is not None else None,
            })
        row += 1

    return lancamentos


@router.post("/congregacoes/{congregacao_id}/importar-planilha")
async def importar_planilha_endpoint(
    congregacao_id: int,
    ano: int,
    file: UploadFile,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    db_congregacao = crud.get_congregacao_by_id(db, congregacao_id)
    if not db_congregacao:
        raise HTTPException(status_code=404, detail="Congregação não encontrada.")
    verificar_acesso_congregacao(current_user, db_congregacao)

    if not db_congregacao.numero_co or not str(db_congregacao.numero_co).strip().isdigit():
        raise HTTPException(
            status_code=400,
            detail="Esta congregação não tem 'numero_co' numérico cadastrado — não é possível casar com as abas da planilha.",
        )
    numero_congregacao = int(db_congregacao.numero_co)

    try:
        import openpyxl
    except ImportError:
        raise HTTPException(status_code=501, detail="Importação indisponível: biblioteca openpyxl não instalada no servidor.")
    conteudo = await file.read()
    try:
        wb_valores = openpyxl.load_workbook(io.BytesIO(conteudo), data_only=True)
        wb_formulas = openpyxl.load_workbook(io.BytesIO(conteudo), data_only=False)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Arquivo inválido ou corrompido: {exc}") from exc

    # Seleciona as abas desta congregação e agrupa por mês (1-12)
    abas_por_mes: dict[int, list[str]] = {}
    for nome_aba in wb_valores.sheetnames:
        m = SHEET_RE.search(nome_aba)
        if not m:
            continue
        cong_aba, mes_aba = int(m.group(1)), int(m.group(2))
        if cong_aba != numero_congregacao or not (1 <= mes_aba <= 12):
            continue
        abas_por_mes.setdefault(mes_aba, []).append(nome_aba)

    if not abas_por_mes:
        raise HTTPException(
            status_code=400,
            detail=f"Nenhuma aba encontrada na planilha para a congregação {numero_congregacao}.",
        )

    # Carrega de uma vez os dizimistas já cadastrados, indexados pelo nome normalizado
    dizimistas_existentes = crud.get_dizimistas_ofertantes_by_congregacao(db, congregacao_id, limit=10_000)
    dizimistas_por_nome = {_normalizar_nome(d.nome): d for d in dizimistas_existentes}

    resultados = []
    meses_afetados = set()

    for mes_num in sorted(abas_por_mes.keys()):
        lancamentos = []
        for nome_aba in abas_por_mes[mes_num]:
            lancamentos.extend(_extrair_lancamentos_aba(wb_valores[nome_aba], wb_formulas[nome_aba], ano, mes_num))

        nome_mes = f"{ano:04d}-{mes_num:02d}"
        db_mes = (
            db.query(models.Mes)
            .filter(models.Mes.congregacao_id == congregacao_id, models.Mes.nome == nome_mes)
            .first()
        )
        if not db_mes:
            db_mes = crud.create_mes(db, schemas.MesCreate(nome=nome_mes, congregacao_id=congregacao_id))

        db_semana = models.Semana(numero=len(db_mes.semanas) + 1, mes_id=db_mes.id)
        db.add(db_semana)
        db.flush()  # precisa do id da semana antes de criar as Rendas

        total_arquivo = 0.0
        total_importado = 0.0
        total_ja_existente = 0.0
        importados = 0
        ja_existentes = 0
        contribuintes_novos = 0

        for lanc in lancamentos:
            total_arquivo += lanc["valor"]

            # Anti-duplicata: mesma congregação + mesmo recibo + mesmo valor.
            # Sem recibo, nunca é tratado como duplicata (importa sempre).
            if lanc["numero_recibo"] is not None:
                ja_existe = (
                    db.query(models.Renda)
                    .filter(
                        models.Renda.congregacao_id == congregacao_id,
                        models.Renda.numero_recibo == lanc["numero_recibo"],
                        models.Renda.valor == lanc["valor"],
                    )
                    .first()
                )
                if ja_existe:
                    ja_existentes += 1
                    total_ja_existente += lanc["valor"]
                    continue

            dizimista_id = None
            if lanc["tipo"] == "Dízimo":
                chave = _normalizar_nome(lanc["nome"])
                db_dizimista = dizimistas_por_nome.get(chave)
                if not db_dizimista:
                    db_dizimista = crud.create_dizimista_ofertante(
                        db, schemas.DizimistaOfertanteCreate(nome=lanc["nome"]), congregacao_id
                    )
                    dizimistas_por_nome[chave] = db_dizimista
                    contribuintes_novos += 1
                dizimista_id = db_dizimista.id

            db_renda = models.Renda(
                tipo=lanc["tipo"],
                valor=lanc["valor"],
                data_registro=lanc["data_registro"],
                numero_recibo=lanc["numero_recibo"],
                observacao=lanc.get("observacao"),
                metodo_pagamento=METODO_PAGAMENTO_IMPORTADO,
                congregacao_id=congregacao_id,
                semana_id=db_semana.id,
                dizimista_ofertante_id=dizimista_id,
            )
            db.add(db_renda)
            total_importado += lanc["valor"]
            importados += 1

        db.commit()
        meses_afetados.add(db_mes.id)

        resultados.append({
            "mes": nome_mes,
            "lancamentos_importados": importados,
            "ja_existentes": ja_existentes,
            "total_arquivo": round(total_arquivo, 2),
            "total_importado": round(total_importado, 2),
            # Dinheiro do arquivo não contabilizado nem como importado nem como
            # já existente (ex.: linha que não bateu em nenhum dos dois casos).
            # Se isso não for zero, há lançamentos perdidos — precisa investigar.
            "diferenca": round(total_arquivo - total_importado - total_ja_existente, 2),
            "contribuintes_novos": contribuintes_novos,
        })

    for mes_id in meses_afetados:
        crud.recalcular_saldos_mes(db, mes_id)

    return resultados
