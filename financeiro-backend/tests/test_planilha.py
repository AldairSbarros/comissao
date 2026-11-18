"""Testes da exportacao de planilhas XLSX (Etapa A)."""
import io
from datetime import timedelta

import pytest
openpyxl = pytest.importorskip("openpyxl")
from fastapi.testclient import TestClient

import crud
import models
import schemas
import security


def _criar_mes_semana(client: TestClient, token: str, congregacao_id: int):
    mes = client.post(
        "/meses/",
        headers={"Authorization": f"Bearer {token}"},
        json={"nome": "2026/01", "congregacao_id": congregacao_id, "saldo_inicial": 0.0},
    )
    assert mes.status_code == 201
    semana = client.post(
        f"/meses/{mes.json()['id']}/semanas/",
        headers={"Authorization": f"Bearer {token}"},
        json={"numero": 1, "data_inicio": "2026-01-04", "data_fim": "2026-01-10"},
    )
    assert semana.status_code == 201
    return mes.json(), semana.json()


def _criar_dizimista(client: TestClient, token: str, congregacao_id: int, nome: str) -> dict:
    resp = client.post(
        f"/congregacoes/{congregacao_id}/dizimistas/",
        headers={"Authorization": f"Bearer {token}"},
        json={"nome": nome},
    )
    assert resp.status_code == 201
    return resp.json()


def _lancar_renda(client: TestClient, token: str, semana_id: int, **campos) -> dict:
    base = {
        "tipo": "Dízimo",
        "valor": 100.0,
        "data_registro": "2026-01-05",
        "metodo_pagamento": "Espécie",
    }
    base.update(campos)
    resp = client.post(
        f"/semanas/{semana_id}/rendas/",
        headers={"Authorization": f"Bearer {token}"},
        json=base,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def _token_para(db_session, email: str, funcao: str, congregacao_id: int) -> str:
    user = crud.create_user(db_session, schemas.UsuarioCreate(
        email=email, password="x", funcao=funcao, congregacao_id=congregacao_id,
    ))
    return security.create_access_token(
        data={"sub": user.email},
        expires_delta=timedelta(minutes=30),
    )


def test_planilha_semanal_conteudo_e_totais(client: TestClient, setup_data: dict):
    token = setup_data["tokens"]["congregacao1_area1"]
    congregacao_id = setup_data["congregacoes"]["congregacao1_area1"].id
    mes, semana = _criar_mes_semana(client, token, congregacao_id)
    diz = _criar_dizimista(client, token, congregacao_id, "Maria Silva")

    _lancar_renda(client, token, semana["id"], valor=100.0, numero_recibo="101",
                  dizimista_ofertante_id=diz["id"])
    _lancar_renda(client, token, semana["id"], valor=200.0, numero_recibo="102",
                  tipo="Oferta", data_registro="2026-01-06")
    desp = client.post(
        f"/meses/{mes['id']}/semanas/1/despesas/",
        headers={"Authorization": f"Bearer {token}"},
        json={"descricao": "Limpeza", "valor": 50.0},
    )
    assert desp.status_code == 201

    resp = client.get(f"/semanas/{semana['id']}/planilha", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert "spreadsheetml" in resp.headers["content-type"]

    wb = openpyxl.load_workbook(io.BytesIO(resp.content))
    assert wb.sheetnames == ["Semana 1"]
    ws = wb.active
    # Localiza as linhas pelos rotulos da coluna A/D.
    linhas = {ws.cell(row=r, column=1).value: r for r in range(1, ws.max_row + 1)}
    assert "Maria Silva" in linhas  # nome do dizimista aparece na tabela
    totais = {}
    for r in range(1, ws.max_row + 1):
        rotulo = ws.cell(row=r, column=4).value
        if rotulo in ("TOTAL:", "Comissão (33%):", "Despesas:"):
            totais[rotulo] = ws.cell(row=r, column=5).value
    assert totais == {"TOTAL:": 300.0, "Comissão (33%):": 99.0, "Despesas:": 50.0}


def test_planilha_mensal_resumo_e_abas(client: TestClient, setup_data: dict):
    token = setup_data["tokens"]["congregacao1_area1"]
    congregacao_id = setup_data["congregacoes"]["congregacao1_area1"].id
    mes, semana1 = _criar_mes_semana(client, token, congregacao_id)
    semana2 = client.post(
        f"/meses/{mes['id']}/semanas/",
        headers={"Authorization": f"Bearer {token}"},
        json={"numero": 2, "data_inicio": "2026-01-11", "data_fim": "2026-01-17"},
    )
    assert semana2.status_code == 201
    _lancar_renda(client, token, semana1["id"], valor=100.0)
    _lancar_renda(client, token, semana2.json()["id"], valor=200.0, data_registro="2026-01-12")

    resp = client.get(f"/meses/{mes['id']}/planilha", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    wb = openpyxl.load_workbook(io.BytesIO(resp.content))
    assert wb.sheetnames == ["Resumo", "Semana 1", "Semana 2"]

    ws = wb["Resumo"]
    valores = {}
    for r in range(1, ws.max_row + 1):
        rotulo = ws.cell(row=r, column=1).value
        if rotulo in ("Semana 1", "Semana 2", "TOTAL MÊS"):
            valores[rotulo] = (ws.cell(row=r, column=2).value, ws.cell(row=r, column=3).value)
    assert valores["Semana 1"] == (100.0, 33.0)
    assert valores["Semana 2"] == (200.0, 66.0)
    assert valores["TOTAL MÊS"] == (300.0, 99.0)


def test_planilha_semana_inexistente_404(client: TestClient, setup_data: dict):
    token = setup_data["tokens"]["congregacao1_area1"]
    resp = client.get("/semanas/99999/planilha", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 404


def test_planilha_outra_denominacao_403(client: TestClient, setup_data: dict):
    token_tes = setup_data["tokens"]["congregacao1_area1"]
    congregacao_id = setup_data["congregacoes"]["congregacao1_area1"].id
    _, semana = _criar_mes_semana(client, token_tes, congregacao_id)
    token_outro = setup_data["tokens"]["denominacao2"]
    resp = client.get(f"/semanas/{semana['id']}/planilha", headers={"Authorization": f"Bearer {token_outro}"})
    assert resp.status_code == 403


def test_planilha_dirigente_pode_ler(client: TestClient, setup_data: dict, db_session):
    token_tes = setup_data["tokens"]["congregacao1_area1"]
    congregacao_id = setup_data["congregacoes"]["congregacao1_area1"].id
    _, semana = _criar_mes_semana(client, token_tes, congregacao_id)
    token_dir = _token_para(db_session, "dirigente@example.com", "dirigente", congregacao_id)
    resp = client.get(f"/semanas/{semana['id']}/planilha", headers={"Authorization": f"Bearer {token_dir}"})
    assert resp.status_code == 200
