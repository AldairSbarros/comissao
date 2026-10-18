from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
import pytest
import crud, schemas, models


def test_list_denominacoes(client: TestClient, setup_data: dict):
    token_admin = setup_data["tokens"]["admin"]
    response = client.get(
        "/denominacoes/",
        headers={
            "Authorization": f"Bearer {token_admin}"
        }
    )
    assert response.status_code == 200
    denominacoes = response.json()
    assert len(denominacoes) == 2
    assert denominacoes[0]["nome"] == "Denominacao Alpha"
    assert denominacoes[1]["nome"] == "Denominacao Beta"

def test_list_areas_by_denominacao_authorized(client: TestClient, setup_data: dict):
    denominacao_alpha_id = setup_data["denominacoes"]["denominacao1"].id
    token_denominacao1 = setup_data["tokens"]["denominacao1"]

    response = client.get(
        f"/denominacoes/{denominacao_alpha_id}/areas/",
        headers={
            "Authorization": f"Bearer {token_denominacao1}"
        }
    )
    assert response.status_code == 200
    areas = response.json()
    assert len(areas) == 2
    assert areas[0]["nome"] == "Area Central Alpha"
    assert areas[1]["nome"] == "Area Norte Alpha"

def test_list_areas_by_denominacao_unauthorized(client: TestClient, setup_data: dict):
    denominacao_alpha_id = setup_data["denominacoes"]["denominacao1"].id
    token_denominacao2 = setup_data["tokens"]["denominacao2"]

    response = client.get(
        f"/denominacoes/{denominacao_alpha_id}/areas/",
        headers={
            "Authorization": f"Bearer {token_denominacao2}"
        }
    )
    assert response.status_code == 403
    assert response.json()["detail"] == "Acesso negado. Você não pertence a esta denominação."

def test_list_congregacoes_by_area_authorized(client: TestClient, setup_data: dict):
    area_central_alpha_id = setup_data["areas"]["area1_denominacao1"].id
    token_area1_denominacao1 = setup_data["tokens"]["area1_denominacao1"]

    response = client.get(
        f"/areas_eclesiasticas/{area_central_alpha_id}/congregacoes/",
        headers={
            "Authorization": f"Bearer {token_area1_denominacao1}"
        }
    )
    assert response.status_code == 200
    congregacoes = response.json()
    assert len(congregacoes) == 2
    assert congregacoes[0]["nome"] == "Congregacao Sede Alpha"
    assert congregacoes[1]["nome"] == "Congregacao Vila Alpha"

def test_list_congregacoes_by_area_unauthorized(client: TestClient, setup_data: dict):
    area_central_alpha_id = setup_data["areas"]["area1_denominacao1"].id
    token_denominacao2 = setup_data["tokens"]["denominacao2"]

    response = client.get(
        f"/areas_eclesiasticas/{area_central_alpha_id}/congregacoes/",
        headers={
            "Authorization": f"Bearer {token_denominacao2}"
        }
    )
    assert response.status_code == 403
    assert response.json()["detail"] == "Acesso negado. Você não pertence à denominação desta área."

def test_list_congregacoes_by_denominacao_authorized(client: TestClient, setup_data: dict):
    denominacao_alpha_id = setup_data["denominacoes"]["denominacao1"].id
    token_denominacao1 = setup_data["tokens"]["denominacao1"]

    response = client.get(
        f"/denominacoes/{denominacao_alpha_id}/congregacoes/",
        headers={
            "Authorization": f"Bearer {token_denominacao1}"
        }
    )
    assert response.status_code == 200
    congregacoes = response.json()
    # Deve incluir 3 congregações de área e 1 congregação sem área
    assert len(congregacoes) == 4 
    assert any(c["nome"] == "Congregacao Sede Alpha" for c in congregacoes)
    assert any(c["nome"] == "Congregacao Vila Alpha" for c in congregacoes)
    assert any(c["nome"] == "Congregacao Montanha Alpha" for c in congregacoes)
    assert any(c["nome"] == "Congregacao Independente Alpha" for c in congregacoes)

def test_list_congregacoes_by_denominacao_unauthorized(client: TestClient, setup_data: dict):
    denominacao_alpha_id = setup_data["denominacoes"]["denominacao1"].id
    token_denominacao2 = setup_data["tokens"]["denominacao2"]

    response = client.get(
        f"/denominacoes/{denominacao_alpha_id}/congregacoes/",
        headers={
            "Authorization": f"Bearer {token_denominacao2}"
        }
    )
    assert response.status_code == 403
    assert response.json()["detail"] == "Acesso negado. Você não pertence a esta denominação."


def test_dirigente_get_meses_ok(client: TestClient, setup_data: dict, db_session: Session):
    """Dirigente pode GET meses da própria congregação."""
    # Criar usuário dirigente
    congregacao = setup_data["congregacoes"]["congregacao1_area1"]
    password = "testpassword"
    user_dirigente = crud.create_user(db_session, schemas.UsuarioCreate(
        email="dirigente@example.com", password=password, funcao="dirigente",
        denominacao_id=setup_data["denominacoes"]["denominacao1"].id,
        area_id=setup_data["areas"]["area1_denominacao1"].id,
        congregacao_id=congregacao.id
    ))
    # Gerar token
    from datetime import timedelta
    import security
    access_token_expires = timedelta(minutes=security.ACCESS_TOKEN_EXPIRE_MINUTES)
    token_dirigente = security.create_access_token(
        data={"sub": user_dirigente.email, "funcao": user_dirigente.funcao,
              "denominacao_id": user_dirigente.denominacao_id,
              "area_id": user_dirigente.area_id,
              "congregacao_id": user_dirigente.congregacao_id},
        expires_delta=access_token_expires
    )

    # O endpoint correto é /congregacoes/{id}/meses/
    response = client.get(
        f"/congregacoes/{congregacao.id}/meses/",
        headers={"Authorization": f"Bearer {token_dirigente}"}
    )
    assert response.status_code == 200


def test_dirigente_post_despesa_forbidden(client: TestClient, setup_data: dict, db_session: Session):
    """Dirigente NÃO pode POST despesas (403)."""
    congregacao = setup_data["congregacoes"]["congregacao1_area1"]
    password = "testpassword"
    user_dirigente = crud.create_user(db_session, schemas.UsuarioCreate(
        email="dirigente2@example.com", password=password, funcao="dirigente",
        denominacao_id=setup_data["denominacoes"]["denominacao1"].id,
        area_id=setup_data["areas"]["area1_denominacao1"].id,
        congregacao_id=congregacao.id
    ))
    from datetime import timedelta
    import security
    access_token_expires = timedelta(minutes=security.ACCESS_TOKEN_EXPIRE_MINUTES)
    token_dirigente = security.create_access_token(
        data={"sub": user_dirigente.email, "funcao": user_dirigente.funcao,
              "denominacao_id": user_dirigente.denominacao_id,
              "area_id": user_dirigente.area_id,
              "congregacao_id": user_dirigente.congregacao_id},
        expires_delta=access_token_expires
    )
    # Criar mês e semana para associar despesa
    mes = models.Mes(congregacao_id=congregacao.id, nome="Fevereiro/2026", saldo_inicial=0.0)
    db_session.add(mes)
    db_session.flush()
    semana = models.Semana(numero=1, mes_id=mes.id, saldo_inicial_semana=0.0)
    db_session.add(semana)
    db_session.flush()
    semana_id = semana.id
    db_session.commit()

    # O endpoint correto é /meses/{mes_id}/semanas/{semana_numero}/despesas/
    response = client.post(
        f"/meses/{mes.id}/semanas/{semana.numero}/despesas/",
        json={"descricao": "Teste", "valor": 100.0},
        headers={"Authorization": f"Bearer {token_dirigente}"}
    )
    assert response.status_code == 403


def test_dirigente_delete_dizimista_forbidden(client: TestClient, setup_data: dict, db_session: Session):
    """Dirigente NÃO pode DELETE dizimistas (403)."""
    congregacao = setup_data["congregacoes"]["congregacao1_area1"]
    password = "testpassword"
    user_dirigente = crud.create_user(db_session, schemas.UsuarioCreate(
        email="dirigente3@example.com", password=password, funcao="dirigente",
        denominacao_id=setup_data["denominacoes"]["denominacao1"].id,
        area_id=setup_data["areas"]["area1_denominacao1"].id,
        congregacao_id=congregacao.id
    ))
    from datetime import timedelta
    import security
    access_token_expires = timedelta(minutes=security.ACCESS_TOKEN_EXPIRE_MINUTES)
    token_dirigente = security.create_access_token(
        data={"sub": user_dirigente.email, "funcao": user_dirigente.funcao,
              "denominacao_id": user_dirigente.denominacao_id,
              "area_id": user_dirigente.area_id,
              "congregacao_id": user_dirigente.congregacao_id},
        expires_delta=access_token_expires
    )
    # Criar dizimista
    dizimista = models.DizimistaOfertante(nome="Teste", congregacao_id=congregacao.id)
    db_session.add(dizimista)
    db_session.flush()
    dizimista_id = dizimista.id
    db_session.commit()

    response = client.delete(
        f"/dizimistas/{dizimista_id}",
        headers={"Authorization": f"Bearer {token_dirigente}"}
    )
    assert response.status_code == 403
