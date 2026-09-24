from fastapi.testclient import TestClient


def test_admin_cria_tesoureiro_authorized(client: TestClient, setup_data: dict):
    token_admin = setup_data["tokens"]["admin"]
    denominacao_id = setup_data["denominacoes"]["denominacao1"].id
    congregacao_id = setup_data["congregacoes"]["congregacao2_area1"].id

    response = client.post(
        f"/denominacoes/{denominacao_id}/usuarios/",
        headers={"Authorization": f"Bearer {token_admin}"},
        json={
            "email": "tesoureiro.novo@example.com",
            "password": "newpassword",
            "funcao": "tesoureiro",
            "congregacao_id": congregacao_id,
        },
    )

    assert response.status_code == 201
    body = response.json()
    assert body["email"] == "tesoureiro.novo@example.com"
    assert body["funcao"] == "tesoureiro"
    assert body["denominacao_id"] == denominacao_id
    assert body["congregacao_id"] == congregacao_id


def test_admin_cria_tesoureiro_sem_congregacao_400(client: TestClient, setup_data: dict):
    token_admin = setup_data["tokens"]["admin"]
    denominacao_id = setup_data["denominacoes"]["denominacao1"].id

    response = client.post(
        f"/denominacoes/{denominacao_id}/usuarios/",
        headers={"Authorization": f"Bearer {token_admin}"},
        json={
            "email": "tesoureiro.semcong@example.com",
            "password": "newpassword",
            "funcao": "tesoureiro",
        },
    )

    assert response.status_code == 400
    assert "congregação" in response.json()["detail"].lower()


def test_admin_cria_tesoureiro_congregacao_de_outra_denominacao_400(client: TestClient, setup_data: dict):
    token_admin = setup_data["tokens"]["admin"]
    denominacao_id = setup_data["denominacoes"]["denominacao1"].id
    congregacao_id_denominacao2 = setup_data["congregacoes"]["congregacao5_area3"].id

    response = client.post(
        f"/denominacoes/{denominacao_id}/usuarios/",
        headers={"Authorization": f"Bearer {token_admin}"},
        json={
            "email": "tesoureiro.cruzada@example.com",
            "password": "newpassword",
            "funcao": "tesoureiro",
            "congregacao_id": congregacao_id_denominacao2,
        },
    )

    assert response.status_code == 400


def test_admin_cria_supervisor_area_authorized(client: TestClient, setup_data: dict):
    token_admin = setup_data["tokens"]["admin"]
    denominacao_id = setup_data["denominacoes"]["denominacao1"].id
    area_id = setup_data["areas"]["area2_denominacao1"].id

    response = client.post(
        f"/denominacoes/{denominacao_id}/usuarios/",
        headers={"Authorization": f"Bearer {token_admin}"},
        json={
            "email": "sup.area.novo@example.com",
            "password": "newpassword",
            "funcao": "supervisor_area",
            "area_id": area_id,
        },
    )

    assert response.status_code == 201
    body = response.json()
    assert body["funcao"] == "supervisor_area"
    assert body["area_id"] == area_id


def test_supervisor_denominacao_cria_tesoureiro_authorized(client: TestClient, setup_data: dict):
    token_denominacao1 = setup_data["tokens"]["denominacao1"]
    denominacao_id = setup_data["denominacoes"]["denominacao1"].id
    congregacao_id = setup_data["congregacoes"]["congregacao3_area2"].id

    response = client.post(
        f"/denominacoes/{denominacao_id}/usuarios/",
        headers={"Authorization": f"Bearer {token_denominacao1}"},
        json={
            "email": "tesoureiro.supdenom@example.com",
            "password": "newpassword",
            "funcao": "tesoureiro",
            "congregacao_id": congregacao_id,
        },
    )

    assert response.status_code == 201


def test_supervisor_denominacao_cria_em_outra_denominacao_403(client: TestClient, setup_data: dict):
    token_denominacao1 = setup_data["tokens"]["denominacao1"]
    denominacao_id_denominacao2 = setup_data["denominacoes"]["denominacao2"].id
    congregacao_id_denominacao2 = setup_data["congregacoes"]["congregacao5_area3"].id

    response = client.post(
        f"/denominacoes/{denominacao_id_denominacao2}/usuarios/",
        headers={"Authorization": f"Bearer {token_denominacao1}"},
        json={
            "email": "tesoureiro.outradenom@example.com",
            "password": "newpassword",
            "funcao": "tesoureiro",
            "congregacao_id": congregacao_id_denominacao2,
        },
    )

    assert response.status_code == 403


def test_supervisor_denominacao_nao_cria_administrador_403(client: TestClient, setup_data: dict):
    token_denominacao1 = setup_data["tokens"]["denominacao1"]
    denominacao_id = setup_data["denominacoes"]["denominacao1"].id

    response = client.post(
        f"/denominacoes/{denominacao_id}/usuarios/",
        headers={"Authorization": f"Bearer {token_denominacao1}"},
        json={
            "email": "admin.novo@example.com",
            "password": "newpassword",
            "funcao": "administrador",
        },
    )

    assert response.status_code == 403


def test_supervisor_area_cria_tesoureiro_area_propria_authorized(client: TestClient, setup_data: dict):
    token_area1 = setup_data["tokens"]["area1_denominacao1"]
    denominacao_id = setup_data["denominacoes"]["denominacao1"].id
    congregacao_id_area1 = setup_data["congregacoes"]["congregacao2_area1"].id

    response = client.post(
        f"/denominacoes/{denominacao_id}/usuarios/",
        headers={"Authorization": f"Bearer {token_area1}"},
        json={
            "email": "tesoureiro.suparea@example.com",
            "password": "newpassword",
            "funcao": "tesoureiro",
            "congregacao_id": congregacao_id_area1,
        },
    )

    assert response.status_code == 201


def test_supervisor_area_cria_tesoureiro_outra_area_403(client: TestClient, setup_data: dict):
    token_area1 = setup_data["tokens"]["area1_denominacao1"]
    denominacao_id = setup_data["denominacoes"]["denominacao1"].id
    congregacao_id_area2 = setup_data["congregacoes"]["congregacao3_area2"].id

    response = client.post(
        f"/denominacoes/{denominacao_id}/usuarios/",
        headers={"Authorization": f"Bearer {token_area1}"},
        json={
            "email": "tesoureiro.outraarea@example.com",
            "password": "newpassword",
            "funcao": "tesoureiro",
            "congregacao_id": congregacao_id_area2,
        },
    )

    assert response.status_code == 403


def test_supervisor_area_nao_cria_supervisor_area_403(client: TestClient, setup_data: dict):
    token_area1 = setup_data["tokens"]["area1_denominacao1"]
    denominacao_id = setup_data["denominacoes"]["denominacao1"].id
    area_id = setup_data["areas"]["area2_denominacao1"].id

    response = client.post(
        f"/denominacoes/{denominacao_id}/usuarios/",
        headers={"Authorization": f"Bearer {token_area1}"},
        json={
            "email": "suparea.novo@example.com",
            "password": "newpassword",
            "funcao": "supervisor_area",
            "area_id": area_id,
        },
    )

    assert response.status_code == 403


def test_tesoureiro_nao_cria_usuario_403(client: TestClient, setup_data: dict):
    token_tesoureiro = setup_data["tokens"]["congregacao1_area1"]
    denominacao_id = setup_data["denominacoes"]["denominacao1"].id

    response = client.post(
        f"/denominacoes/{denominacao_id}/usuarios/",
        headers={"Authorization": f"Bearer {token_tesoureiro}"},
        json={
            "email": "tesoureiro.x2@example.com",
            "password": "newpassword",
            "funcao": "tesoureiro",
            "congregacao_id": setup_data["congregacoes"]["congregacao2_area1"].id,
        },
    )

    assert response.status_code == 403


def test_criar_usuario_email_duplicado_400(client: TestClient, setup_data: dict):
    token_admin = setup_data["tokens"]["admin"]
    denominacao_id = setup_data["denominacoes"]["denominacao1"].id
    email_existente = setup_data["users"]["denominacao1"].email

    response = client.post(
        f"/denominacoes/{denominacao_id}/usuarios/",
        headers={"Authorization": f"Bearer {token_admin}"},
        json={
            "email": email_existente,
            "password": "newpassword",
            "funcao": "tesoureiro",
            "congregacao_id": setup_data["congregacoes"]["congregacao2_area1"].id,
        },
    )

    assert response.status_code == 400


def test_listar_usuarios_denominacao_admin_authorized(client: TestClient, setup_data: dict):
    token_admin = setup_data["tokens"]["admin"]
    denominacao_id = setup_data["denominacoes"]["denominacao1"].id

    response = client.get(
        f"/denominacoes/{denominacao_id}/usuarios/",
        headers={"Authorization": f"Bearer {token_admin}"},
    )

    assert response.status_code == 200
    emails = [u["email"] for u in response.json()]
    assert setup_data["users"]["admin"].email in emails
    assert setup_data["users"]["denominacao1"].email in emails
    # Usuário da outra denominação não aparece
    assert setup_data["users"]["denominacao2"].email not in emails


def test_listar_usuarios_denominacao_tesoureiro_mesma_denominacao_authorized(client: TestClient, setup_data: dict):
    token_tesoureiro = setup_data["tokens"]["congregacao1_area1"]
    denominacao_id = setup_data["denominacoes"]["denominacao1"].id

    response = client.get(
        f"/denominacoes/{denominacao_id}/usuarios/",
        headers={"Authorization": f"Bearer {token_tesoureiro}"},
    )

    assert response.status_code == 200


def test_listar_usuarios_denominacao_outra_denominacao_403(client: TestClient, setup_data: dict):
    token_denominacao1 = setup_data["tokens"]["denominacao1"]
    denominacao_id_denominacao2 = setup_data["denominacoes"]["denominacao2"].id

    response = client.get(
        f"/denominacoes/{denominacao_id_denominacao2}/usuarios/",
        headers={"Authorization": f"Bearer {token_denominacao1}"},
    )

    assert response.status_code == 403