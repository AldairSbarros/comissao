"""Testes do papel dirigente: GET permitido, POST/DELETE bloqueado, PDF dizimistas retorna 200."""
import pytest
from fastapi.testclient import TestClient
from datetime import date
import security, schemas, crud, models

def test_dirigente_pode_ler_meses(client: TestClient, db_session, setup_data: dict):
    """Dirigente pode GET meses da sua congregação."""
    denominacao = setup_data["denominacoes"]["denominacao1"]
    area = setup_data["areas"]["area1_denominacao1"]
    congregacao = setup_data["congregacoes"]["congregacao1_area1"]

    # Cria usuário dirigente
    dirigente = crud.create_user(db_session, schemas.UsuarioCreate(
        email="dirigente@teste.com",
        password="senha123",
        funcao="dirigente",
        denominacao_id=denominacao.id,
        area_id=area.id,
        congregacao_id=congregacao.id,
    ))

    # Cria mês para a congregação
    mes = crud.create_mes(db_session, schemas.MesCreate(
        nome="Janeiro/2026",
        congregacao_id=congregacao.id,
        saldo_inicial=100.0,
    ))

    # Gera token do dirigente
    access_token_expires = __import__("datetime").timedelta(minutes=security.ACCESS_TOKEN_EXPIRE_MINUTES)
    token = security.create_access_token(
        data={
            "sub": dirigente.email,
            "funcao": dirigente.funcao,
            "denominacao_id": dirigente.denominacao_id,
            "area_id": dirigente.area_id,
            "congregacao_id": dirigente.congregacao_id,
        },
        expires_delta=access_token_expires,
    )

    r = client.get(f"/congregacoes/{congregacao.id}/meses/", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    assert len(r.json()) >= 1


def test_dirigente_pode_baixar_pdf_dizimistas(client: TestClient, db_session, setup_data: dict):
    """Dirigente pode baixar PDF de dizimistas (lista sem valores)."""
    denominacao = setup_data["denominacoes"]["denominacao1"]
    area = setup_data["areas"]["area1_denominacao1"]
    congregacao = setup_data["congregacoes"]["congregacao1_area1"]

    dirigente = crud.create_user(db_session, schemas.UsuarioCreate(
        email="dirigente2@teste.com",
        password="senha123",
        funcao="dirigente",
        denominacao_id=denominacao.id,
        area_id=area.id,
        congregacao_id=congregacao.id,
    ))

    mes = crud.create_mes(db_session, schemas.MesCreate(
        nome="Fevereiro/2026",
        congregacao_id=congregacao.id,
        saldo_inicial=200.0,
    ))

    # Criar semana via modelo direto
    semana = models.Semana(
        numero=1,
        mes_id=mes.id,
        data_inicio="2026-02-02",
        data_fim="2026-02-08",
        renda_semanal=0.0,
        comissao=0.0,
        saldo_inicial_semana=200.0,
        saldo_final_semana=200.0,
    )
    db_session.add(semana)
    db_session.flush()

    # Criar dizimista via modelo direto
    diz = models.DizimistaOfertante(
        nome="Maria Silva",
        congregacao_id=congregacao.id,
    )
    db_session.add(diz)
    db_session.flush()

    # Criar renda vinculada ao dizimista
    renda = models.Renda(
        tipo="Dízimo",
        valor=300.0,
        data_registro=date(2026, 2, 5),
        metodo_pagamento="Pix",
        congregacao_id=congregacao.id,
        semana_id=semana.id,
        dizimista_ofertante_id=diz.id,
        numero_recibo="R100",
    )
    db_session.add(renda)
    db_session.commit()

    # Gerar token
    access_token_expires = __import__("datetime").timedelta(minutes=security.ACCESS_TOKEN_EXPIRE_MINUTES)
    token = security.create_access_token(
        data={
            "sub": dirigente.email,
            "funcao": dirigente.funcao,
            "denominacao_id": dirigente.denominacao_id,
            "area_id": dirigente.area_id,
            "congregacao_id": dirigente.congregacao_id,
        },
        expires_delta=access_token_expires,
    )

    r = client.get(f"/meses/{mes.id}/dizimistas/pdf", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/pdf"


def test_dirigente_nao_pode_criar_despesa(client: TestClient, db_session, setup_data: dict):
    """Dirigente NÃO pode POST despesas — deve receber 403."""
    denominacao = setup_data["denominacoes"]["denominacao1"]
    area = setup_data["areas"]["area1_denominacao1"]
    congregacao = setup_data["congregacoes"]["congregacao1_area1"]

    dirigente = crud.create_user(db_session, schemas.UsuarioCreate(
        email="dirigente3@teste.com",
        password="senha123",
        funcao="dirigente",
        denominacao_id=denominacao.id,
        area_id=area.id,
        congregacao_id=congregacao.id,
    ))

    mes = crud.create_mes(db_session, schemas.MesCreate(
        nome="Março/2026",
        congregacao_id=congregacao.id,
        saldo_inicial=150.0,
    ))

    access_token_expires = __import__("datetime").timedelta(minutes=security.ACCESS_TOKEN_EXPIRE_MINUTES)
    token = security.create_access_token(
        data={
            "sub": dirigente.email,
            "funcao": dirigente.funcao,
            "denominacao_id": dirigente.denominacao_id,
            "area_id": dirigente.area_id,
            "congregacao_id": dirigente.congregacao_id,
        },
        expires_delta=access_token_expires,
    )

    payload = {"descricao": "Conta de Luz", "valor": 50.0}
    r = client.post(
        f"/meses/{mes.id}/semanas/1/despesas/",
        json=payload,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 403


def test_dirigente_nao_pode_deletar_renda(client: TestClient, db_session, setup_data: dict):
    """Dirigente NÃO pode DELETE rendas — deve receber 403."""
    denominacao = setup_data["denominacoes"]["denominacao1"]
    area = setup_data["areas"]["area1_denominacao1"]
    congregacao = setup_data["congregacoes"]["congregacao1_area1"]

    dirigente = crud.create_user(db_session, schemas.UsuarioCreate(
        email="dirigente4@teste.com",
        password="senha123",
        funcao="dirigente",
        denominacao_id=denominacao.id,
        area_id=area.id,
        congregacao_id=congregacao.id,
    ))

    mes = crud.create_mes(db_session, schemas.MesCreate(
        nome="Abril/2026",
        congregacao_id=congregacao.id,
        saldo_inicial=150.0,
    ))

    # Criar semana via modelo
    semana = models.Semana(
        numero=1,
        mes_id=mes.id,
        data_inicio="2026-04-06",
        data_fim="2026-04-12",
        renda_semanal=0.0,
        comissao=0.0,
        saldo_inicial_semana=150.0,
        saldo_final_semana=150.0,
    )
    db_session.add(semana)
    db_session.flush()

    renda = models.Renda(
        tipo="Oferta",
        valor=100.0,
        data_registro=date(2026, 4, 8),
        metodo_pagamento="Espécie",
        congregacao_id=congregacao.id,
        semana_id=semana.id,
    )
    db_session.add(renda)
    db_session.commit()

    access_token_expires = __import__("datetime").timedelta(minutes=security.ACCESS_TOKEN_EXPIRE_MINUTES)
    token = security.create_access_token(
        data={
            "sub": dirigente.email,
            "funcao": dirigente.funcao,
            "denominacao_id": dirigente.denominacao_id,
            "area_id": dirigente.area_id,
            "congregacao_id": dirigente.congregacao_id,
        },
        expires_delta=access_token_expires,
    )

    r = client.delete(f"/rendas/{renda.id}", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 403