"""Exportacao de planilhas XLSX das contribuicoes (semanal e mensal).

Substitui a planilha feita a mao: o sistema gera o arquivo com data, numero do
recibo, nome, tipo e valor por contribuicao, soma tudo e calcula os 33%.
"""
import io
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session, joinedload

import crud
import models
import security
from database import get_db

router = APIRouter(tags=["Planilhas"])

TAXA_COMISSAO = 0.33
FORMATO_MOEDA = '#,##0.00'

_OXL = None


def _oxl():
    """Carrega openpyxl sob demanda (erro 501 limpo quando ausente)."""
    global _OXL
    if _OXL is None:
        try:
            import openpyxl
            from openpyxl.styles import Alignment, Font, PatternFill
        except ImportError:
            raise HTTPException(
                status_code=501,
                detail="Planilha indisponível: biblioteca openpyxl não instalada no servidor.",
            )
        _OXL = {
            "openpyxl": openpyxl,
            "Alignment": Alignment,
            "Font": Font,
            "CABECALHO_FILL": PatternFill(start_color="1F4E79", end_color="1F4E79", fill_type="solid"),
            "CABECALHO_FONT": Font(bold=True, color="FFFFFF", size=11),
            "TITULO_FONT": Font(bold=True, size=13),
            "TOTAL_FONT": Font(bold=True, size=11),
            "TOTAL_FILL": PatternFill(start_color="DDEBF7", end_color="DDEBF7", fill_type="solid"),
        }
    return _OXL


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
    """Leitura: mesmo padrao de main.verificar_acesso_congregacao (dirigente pode)."""
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


def _escrever_cabecalho(o, ws, titulo: str, linhas_info: list[tuple[str, str]]) -> int:
    """Escreve titulo + linhas de info. Devolve a proxima linha livre."""
    ws["A1"] = titulo
    ws["A1"].font = o["TITULO_FONT"]
    linha = 2
    for rotulo, valor in linhas_info:
        ws.cell(row=linha, column=1, value=rotulo).font = o["Font"](bold=True)
        ws.cell(row=linha, column=2, value=valor)
        linha += 1
    return linha + 1


def _escrever_tabela_contribuicoes(o, ws, linha_inicial: int, rendas: list[models.Renda]) -> tuple[int, float]:
    """Escreve Data | Recibo | Nome | Tipo | Valor. Devolve (prox_linha, total)."""
    cabecalhos = ["Data", "Nº Recibo", "Nome", "Tipo", "Valor (R$)"]
    larguras = [12, 12, 40, 22, 14]
    for col, (texto, larg) in enumerate(zip(cabecalhos, larguras), start=1):
        cel = ws.cell(row=linha_inicial, column=col, value=texto)
        cel.font = o["CABECALHO_FONT"]
        cel.fill = o["CABECALHO_FILL"]
        cel.alignment = o["Alignment"](horizontal="center")
        ws.column_dimensions[o["openpyxl"].utils.get_column_letter(col)].width = larg

    linha = linha_inicial + 1
    total = 0.0
    for renda in sorted(rendas, key=lambda r: (r.data_registro, r.id)):
        nome = renda.dizimista_ofertante.nome if renda.dizimista_ofertante else "Anônimo"
        ws.cell(row=linha, column=1, value=renda.data_registro).number_format = "DD/MM/YYYY"
        ws.cell(row=linha, column=2, value=renda.numero_recibo or "-")
        ws.cell(row=linha, column=3, value=nome)
        ws.cell(row=linha, column=4, value=renda.tipo)
        ws.cell(row=linha, column=5, value=renda.valor).number_format = FORMATO_MOEDA
        total += renda.valor
        linha += 1
    if not rendas:
        ws.cell(row=linha, column=1, value="Sem lançamentos").font = o["Font"](italic=True)
        linha += 1
    return linha, round(total, 2)


def _escrever_totais(o, ws, linha: int, rotulos_valores: list[tuple[str, float]]) -> int:
    for rotulo, valor in rotulos_valores:
        ws.cell(row=linha, column=4, value=rotulo).font = o["TOTAL_FONT"]
        cel = ws.cell(row=linha, column=5, value=round(valor, 2))
        cel.number_format = FORMATO_MOEDA
        cel.font = o["TOTAL_FONT"]
        for col in (4, 5):
            ws.cell(row=linha, column=col).fill = o["TOTAL_FILL"]
        linha += 1
    return linha


def _resumo_semana(semana: models.Semana) -> tuple[float, float, float]:
    total = round(sum(r.valor for r in semana.rendas), 2)
    return total, round(total * TAXA_COMISSAO, 2), round(sum(d.valor for d in semana.despesas), 2)


def _montar_aba_semana(o, wb, semana: models.Semana, mes: models.Mes, congregacao: models.Congregacao):
    ws = wb.create_sheet(f"Semana {semana.numero}")
    periodo = f"{semana.data_inicio or '?'} a {semana.data_fim or '?'}"
    linha = _escrever_cabecalho(o, ws, f"Contribuições — Semana {semana.numero} ({periodo})", [
        ("Congregação:", congregacao.nome),
        ("Mês:", mes.nome),
        ("Gerado em:", datetime.now().strftime("%d/%m/%Y %H:%M")),
    ])
    linha, _ = _escrever_tabela_contribuicoes(o, ws, linha, list(semana.rendas))
    total, comissao, despesas = _resumo_semana(semana)
    _escrever_totais(o, ws, linha + 1, [
        ("TOTAL:", total),
        ("Comissão (33%):", comissao),
        ("Despesas:", despesas),
        ("Saldo final semana:", round(semana.saldo_inicial_semana + comissao - despesas, 2)),
    ])
    return ws


def _resposta_xlsx(wb, nome_arquivo: str) -> Response:
    buf = io.BytesIO()
    wb.save(buf)
    return Response(
        content=buf.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{nome_arquivo}"'},
    )


@router.get("/semanas/{semana_id}/planilha")
def planilha_semanal_endpoint(
    semana_id: int,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    db_semana = (
        db.query(models.Semana)
        .options(joinedload(models.Semana.rendas).joinedload(models.Renda.dizimista_ofertante))
        .options(joinedload(models.Semana.despesas))
        .filter(models.Semana.id == semana_id)
        .first()
    )
    if not db_semana:
        raise HTTPException(status_code=404, detail="Semana não encontrada.")
    verificar_acesso_congregacao(current_user, db_semana.mes.congregacao)

    o = _oxl()
    wb = o["openpyxl"].Workbook()
    wb.remove(wb.active)
    _montar_aba_semana(o, wb, db_semana, db_semana.mes, db_semana.mes.congregacao)
    nome = f"semana_{db_semana.numero}_{db_semana.mes.nome}".replace("/", "-").replace(" ", "_")
    return _resposta_xlsx(wb, f"planilha_{nome}.xlsx")


@router.get("/meses/{mes_id}/planilha")
def planilha_mensal_endpoint(
    mes_id: int,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    db_mes = (
        db.query(models.Mes)
        .options(joinedload(models.Mes.semanas).joinedload(models.Semana.rendas).joinedload(models.Renda.dizimista_ofertante))
        .options(joinedload(models.Mes.semanas).joinedload(models.Semana.despesas))
        .filter(models.Mes.id == mes_id)
        .first()
    )
    if not db_mes:
        raise HTTPException(status_code=404, detail="Mês não encontrado.")
    verificar_acesso_congregacao(current_user, db_mes.congregacao)

    o = _oxl()
    wb = o["openpyxl"].Workbook()
    wb.remove(wb.active)
    semanas = sorted(db_mes.semanas, key=lambda s: s.numero)

    # Aba de resumo do mês.
    ws = wb.create_sheet("Resumo")
    linha = _escrever_cabecalho(o, ws, f"Resumo — {db_mes.nome}", [
        ("Congregação:", db_mes.congregacao.nome),
        ("Gerado em:", datetime.now().strftime("%d/%m/%Y %H:%M")),
    ])
    for col, (texto, larg) in enumerate(zip(["Semana", "Entradas (R$)", "Comissão 33% (R$)", "Despesas (R$)"], [12, 16, 20, 16]), start=1):
        cel = ws.cell(row=linha, column=col, value=texto)
        cel.font = o["CABECALHO_FONT"]
        cel.fill = o["CABECALHO_FILL"]
        ws.column_dimensions[o["openpyxl"].utils.get_column_letter(col)].width = larg
    linha += 1
    tot_e = tot_c = tot_d = 0.0
    for semana in semanas:
        total, comissao, despesas = _resumo_semana(semana)
        ws.cell(row=linha, column=1, value=f"Semana {semana.numero}")
        ws.cell(row=linha, column=2, value=total).number_format = FORMATO_MOEDA
        ws.cell(row=linha, column=3, value=comissao).number_format = FORMATO_MOEDA
        ws.cell(row=linha, column=4, value=despesas).number_format = FORMATO_MOEDA
        tot_e += total
        tot_c += comissao
        tot_d += despesas
        linha += 1
    ws.cell(row=linha + 1, column=1, value="TOTAL MÊS").font = o["TOTAL_FONT"]
    ws.cell(row=linha + 1, column=2, value=round(tot_e, 2)).number_format = FORMATO_MOEDA
    ws.cell(row=linha + 1, column=3, value=round(tot_c, 2)).number_format = FORMATO_MOEDA
    ws.cell(row=linha + 1, column=4, value=round(tot_d, 2)).number_format = FORMATO_MOEDA
    ws.cell(row=linha + 2, column=1, value="Saldo final (caixa 33%)").font = o["TOTAL_FONT"]
    ws.cell(row=linha + 2, column=2, value=round(db_mes.saldo_inicial + tot_c - tot_d, 2)).number_format = FORMATO_MOEDA

    for semana in semanas:
        _montar_aba_semana(o, wb, semana, db_mes, db_mes.congregacao)

    nome = db_mes.nome.replace("/", "-").replace(" ", "_")
    return _resposta_xlsx(wb, f"planilha_mes_{nome}.xlsx")
