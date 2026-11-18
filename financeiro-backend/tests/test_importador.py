"""
Testes do importador da planilha legada.

1. test_importar_planilha_sintetica: monta um .xlsx em memória imitando o
   formato real (dízimos + ofertas) e confere que os Renda/DizimistaOfertante
   saem certos, e que reimportar o mesmo arquivo não duplica nada com recibo.
2. test_importar_planilha_real_congregacao_9: roda o importador contra o
   arquivo real "Relat Financ 2026.xlsx" (congregação 9, jan-set/2026) num
   banco SQLite isolado (nunca o banco de produção) e confere que o total
   bate com o número já auditado: R$ 85.839,20.
"""
import io
import os
from datetime import date

import pytest
openpyxl = pytest.importorskip("openpyxl")
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import crud
import models
import schemas
import security
from database import Base, get_db
from main import app


def _montar_planilha_sintetica() -> bytes:
    """Monta um .xlsx com uma aba 'C7-01-26' imitando o layout real:
    dízimos a partir da linha 6 (G=data,H=recibo,I=nome,L=valor), terminando
    em "Qtde Dizimistas"; ofertas a partir da linha com F=="Data"
    (F=data,G=recibo,H=valor,I=obs), terminando numa fórmula =SUM em H.
    """
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "C7-01-26"

    ws["F5"] = "Ordem"
    ws["G5"] = "DATA"
    ws["H5"] = "Nº RECIBO"
    ws["I5"] = "CONTRIBUINTE"
    ws["L5"] = "VALOR"

    dizimos = [
        (1, "2026-01-04", 1001, "Maria Souza", 100.0),
        (2, "2026-01-04", 1002, "João da Silva", 50.0),
        (3, "2026-01-11", 1003, "ana   costa", 25.5),  # nome com espaço duplo, p/ testar normalização
    ]
    row = 6
    for ordem, data_str, recibo, nome, valor in dizimos:
        ws.cell(row=row, column=6, value=f"{ordem}.")
        ws.cell(row=row, column=7, value=date.fromisoformat(data_str))
        ws.cell(row=row, column=8, value=recibo)
        ws.cell(row=row, column=9, value=nome)
        ws.cell(row=row, column=12, value=valor)
        row += 1
    ws.cell(row=row, column=6, value="Qtde Dizimistas")
    ws.cell(row=row, column=12, value=sum(d[4] for d in dizimos))
    row += 2

    ws.cell(row=row, column=6, value="OFERTAS")
    row += 2
    header_row = row
    ws.cell(row=header_row, column=6, value="Data")
    ws.cell(row=header_row, column=7, value="Recibo")
    ws.cell(row=header_row, column=8, value="Valor")
    ws.cell(row=header_row, column=9, value="OBS")

    ofertas = [
        ("2026-01-04", 2001, 41.25, "C. Celebração"),
    ]
    row = header_row + 1
    for data_str, recibo, valor, obs in ofertas:
        ws.cell(row=row, column=6, value=date.fromisoformat(data_str))
        ws.cell(row=row, column=7, value=recibo)
        ws.cell(row=row, column=8, value=valor)
        ws.cell(row=row, column=9, value=obs)
        row += 1
    ws.cell(row=row, column=8, value=f"=SUM(H{header_row + 1}:H{row - 1})")

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def test_importar_planilha_sintetica(client: TestClient, setup_data: dict):
    token = setup_data["tokens"]["admin"]
    congregacao = setup_data["congregacoes"]["congregacao1_area1"]

    conteudo = _montar_planilha_sintetica()

    # Ajusta numero_co usando a mesma sessão que o client usa (override de get_db)
    db_gen = app.dependency_overrides[get_db]()
    db = next(db_gen)
    db_congregacao = db.query(models.Congregacao).filter(models.Congregacao.id == congregacao.id).first()
    db_congregacao.numero_co = "7"
    db.commit()
    db.close()

    resp = client.post(
        f"/congregacoes/{congregacao.id}/importar-planilha?ano=2026",
        headers={"Authorization": f"Bearer {token}"},
        files={"file": ("relatorio.xlsx", conteudo, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
    )
    assert resp.status_code == 200, resp.text
    resultados = resp.json()
    assert len(resultados) == 1
    mes = resultados[0]
    assert mes["mes"] == "2026-01"
    assert mes["lancamentos_importados"] == 4  # 3 dizimos + 1 oferta
    assert mes["ja_existentes"] == 0
    assert mes["total_arquivo"] == pytest.approx(216.75)
    assert mes["total_importado"] == pytest.approx(216.75)
    assert mes["diferenca"] == pytest.approx(0.0)
    assert mes["contribuintes_novos"] == 3

    # Confere os registros no banco
    db_gen = app.dependency_overrides[get_db]()
    db = next(db_gen)
    rendas = db.query(models.Renda).filter(models.Renda.congregacao_id == congregacao.id).all()
    assert len(rendas) == 4
    dizimos_db = [r for r in rendas if r.tipo == "Dízimo"]
    ofertas_db = [r for r in rendas if r.tipo == "Oferta"]
    assert len(dizimos_db) == 3
    assert len(ofertas_db) == 1
    assert ofertas_db[0].observacao == "C. Celebração"
    assert ofertas_db[0].numero_recibo == "2001"

    nomes = {d.dizimista_ofertante.nome for d in dizimos_db}
    assert nomes == {"Maria Souza", "João da Silva", "ana   costa"}  # nome original preservado

    dizimistas = db.query(models.DizimistaOfertante).filter(models.DizimistaOfertante.congregacao_id == congregacao.id).all()
    assert len(dizimistas) == 3
    db.close()

    # --- Idempotência: reimportar o MESMO arquivo não deve duplicar nada (todos têm recibo) ---
    resp2 = client.post(
        f"/congregacoes/{congregacao.id}/importar-planilha?ano=2026",
        headers={"Authorization": f"Bearer {token}"},
        files={"file": ("relatorio.xlsx", conteudo, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
    )
    assert resp2.status_code == 200, resp2.text
    mes2 = resp2.json()[0]
    assert mes2["lancamentos_importados"] == 0
    assert mes2["ja_existentes"] == 4
    assert mes2["diferenca"] == pytest.approx(0.0)
    assert mes2["contribuintes_novos"] == 0

    db_gen = app.dependency_overrides[get_db]()
    db = next(db_gen)
    total_rendas = db.query(models.Renda).filter(models.Renda.congregacao_id == congregacao.id).count()
    assert total_rendas == 4  # não duplicou
    total_dizimistas = db.query(models.DizimistaOfertante).filter(models.DizimistaOfertante.congregacao_id == congregacao.id).count()
    assert total_dizimistas == 3  # não duplicou
    db.close()


# --- Verificação contra o arquivo real, em banco SQLite isolado de teste ---

# O arquivo real fica fora do worktree, na pasta "comissao" (mãe de .worktrees/).
_REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))
_PLANILHA_REAL = os.path.join(_REPO_ROOT, "Relat Financ 2026.xlsx")


@pytest.mark.skipif(not os.path.exists(_PLANILHA_REAL), reason="planilha real não encontrada neste ambiente")
def test_importar_planilha_real_congregacao_9():
    # Banco SQLite isolado, só para este teste — nunca o banco de produção.
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)

    def override_get_db():
        db = TestSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    db = TestSessionLocal()
    try:
        denominacao = crud.create_denominacao(db, schemas.DenominacaoCreate(nome="Denominacao Teste Real"))
        congregacao = crud.create_congregacao(
            db, schemas.CongregacaoCreate(nome="Congregacao 9 Teste", numero_co="9", denominacao_id=denominacao.id)
        )
        admin = crud.create_user(db, schemas.UsuarioCreate(
            email="admin-real@example.com", password="x", funcao="administrador", denominacao_id=denominacao.id,
        ))
        from datetime import timedelta
        token = security.create_access_token(
            data={"sub": admin.email, "funcao": admin.funcao, "denominacao_id": admin.denominacao_id,
                  "area_id": None, "congregacao_id": None},
            expires_delta=timedelta(minutes=30),
        )
        congregacao_id = congregacao.id
    finally:
        db.close()

    with TestClient(app) as client:
        with open(_PLANILHA_REAL, "rb") as f:
            conteudo = f.read()
        resp = client.post(
            f"/congregacoes/{congregacao_id}/importar-planilha?ano=2026",
            headers={"Authorization": f"Bearer {token}"},
            files={"file": ("Relat Financ 2026.xlsx", conteudo,
                             "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        )
    app.dependency_overrides.pop(get_db, None)

    assert resp.status_code == 200, resp.text
    resultados = resp.json()
    # jan a set/2026 = 9 meses
    assert [r["mes"] for r in resultados] == [f"2026-{m:02d}" for m in range(1, 10)]

    total_importado = sum(r["total_importado"] for r in resultados)
    total_arquivo = sum(r["total_arquivo"] for r in resultados)
    diferencas = [r["diferenca"] for r in resultados]

    assert diferencas == [0.0] * 9, f"diferenças inesperadas: {resultados}"
    assert total_arquivo == pytest.approx(85839.20, abs=0.01)
    assert total_importado == pytest.approx(85839.20, abs=0.01)
