"""Testes do agradecimento via Evolution API (Etapa D), com HTTP mocado."""
import base64

import pytest
from fastapi.testclient import TestClient

import evolution
import recibos

PNG_BYTES = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
)


class _RespostaFake:
    def __init__(self, status_code=200, texto="ok"):
        self.status_code = status_code
        self.text = texto


@pytest.fixture(autouse=True)
def sem_chave_ocr(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)


@pytest.fixture()
def pasta_recibos(tmp_path, monkeypatch):
    monkeypatch.setattr(recibos, "BASE_DIR", str(tmp_path / "recibos"))
    return tmp_path


@pytest.fixture()
def evo_configurado(monkeypatch):
    monkeypatch.setenv("EVOLUTION_API_URL", "https://evo.teste")
    monkeypatch.setenv("EVOLUTION_API_KEY", "chave-fake")
    monkeypatch.setenv("EVOLUTION_INSTANCE", "instancia-fake")


@pytest.fixture()
def http_mocado(monkeypatch):
    chamadas = []

    def fake_post(url, headers=None, json=None, timeout=None):
        chamadas.append({"url": url, "headers": headers, "json": json})
        return _RespostaFake(200)

    monkeypatch.setattr(evolution.httpx, "post", fake_post)
    return chamadas


def _criar_mes_semana(client: TestClient, token: str, congregacao_id: int):
    mes = client.post("/meses/", headers={"Authorization": f"Bearer {token}"},
                      json={"nome": "2026/03", "congregacao_id": congregacao_id, "saldo_inicial": 0.0})
    assert mes.status_code == 201
    semana = client.post(f"/meses/{mes.json()['id']}/semanas/", headers={"Authorization": f"Bearer {token}"},
                         json={"numero": 1, "data_inicio": "2026-03-01", "data_fim": "2026-03-07"})
    assert semana.status_code == 201
    return mes.json(), semana.json()


def _criar_dizimista(client, token, congregacao_id, nome, telefone=None):
    payload = {"nome": nome}
    if telefone is not None:
        payload["telefone"] = telefone
    resp = client.post(f"/congregacoes/{congregacao_id}/dizimistas/",
                       headers={"Authorization": f"Bearer {token}"}, json=payload)
    assert resp.status_code == 201, resp.text
    return resp.json()


def test_normalizar_numero():
    assert evolution.normalizar_numero("(92) 99999-1111") == "5592999991111"
    assert evolution.normalizar_numero("5592988882222") == "5592988882222"
    assert evolution.normalizar_numero("9233334444") == "559233334444"
    assert evolution.normalizar_numero("123") is None
    assert evolution.normalizar_numero("") is None


def test_agradecer_com_imagem_do_recibo(client: TestClient, setup_data: dict, pasta_recibos,
                                        evo_configurado, http_mocado):
    token = setup_data["tokens"]["congregacao1_area1"]
    congregacao_id = setup_data["congregacoes"]["congregacao1_area1"].id
    _, semana = _criar_mes_semana(client, token, congregacao_id)
    diz = _criar_dizimista(client, token, congregacao_id, "Ana Souza", "(92) 99999-1111")

    up = client.post(f"/semanas/{semana['id']}/recibos/upload", headers={"Authorization": f"Bearer {token}"},
                     files=[("files", ("r.png", PNG_BYTES, "image/png"))])
    recibo_id = up.json()[0]["id"]
    conf = client.post(f"/recibos/{recibo_id}/confirmar", headers={"Authorization": f"Bearer {token}"}, json={
        "tipo": "Dízimo", "valor": 200.0, "data_registro": "2026-03-02",
        "numero_recibo": "900", "metodo_pagamento": "Espécie", "dizimista_ofertante_id": diz["id"]})
    renda_id = conf.json()["id"]

    resp = client.post(f"/rendas/{renda_id}/agradecer", headers={"Authorization": f"Bearer {token}"}, json={})
    assert resp.status_code == 200, resp.text
    corpo = resp.json()
    assert corpo["com_imagem"] is True
    assert corpo["numero"] == "5592999991111"

    assert len(http_mocado) == 1
    chamada = http_mocado[0]
    assert "sendMedia" in chamada["url"]
    assert chamada["json"]["caption"] and "Ana Souza" in chamada["json"]["caption"]
    assert "200,00" in chamada["json"]["caption"]
    assert chamada["headers"]["apikey"] == "chave-fake"

    # Marca a renda como avisada.
    renda = client.get(f"/rendas/{renda_id}", headers={"Authorization": f"Bearer {token}"}).json()
    assert renda["mensagem_enviada_em"] is not None


def test_agradecer_renda_manual_sem_imagem(client: TestClient, setup_data: dict, evo_configurado, http_mocado):
    token = setup_data["tokens"]["congregacao1_area1"]
    congregacao_id = setup_data["congregacoes"]["congregacao1_area1"].id
    _, semana = _criar_mes_semana(client, token, congregacao_id)
    diz = _criar_dizimista(client, token, congregacao_id, "Paulo", "92988882222")
    renda = client.post(f"/semanas/{semana['id']}/rendas/", headers={"Authorization": f"Bearer {token}"}, json={
        "tipo": "Oferta", "valor": 50.0, "data_registro": "2026-03-02",
        "metodo_pagamento": "Pix", "dizimista_ofertante_id": diz["id"]})

    resp = client.post(f"/rendas/{renda.json()['id']}/agradecer",
                       headers={"Authorization": f"Bearer {token}"}, json={})
    assert resp.status_code == 200
    assert resp.json()["com_imagem"] is False
    assert "sendText" in http_mocado[0]["url"]


def test_agradecer_sem_telefone_400(client: TestClient, setup_data: dict, evo_configurado, http_mocado):
    token = setup_data["tokens"]["congregacao1_area1"]
    congregacao_id = setup_data["congregacoes"]["congregacao1_area1"].id
    _, semana = _criar_mes_semana(client, token, congregacao_id)
    diz = _criar_dizimista(client, token, congregacao_id, "Sem Fone")
    renda = client.post(f"/semanas/{semana['id']}/rendas/", headers={"Authorization": f"Bearer {token}"}, json={
        "tipo": "Dízimo", "valor": 10.0, "data_registro": "2026-03-02",
        "metodo_pagamento": "Espécie", "dizimista_ofertante_id": diz["id"]})
    resp = client.post(f"/rendas/{renda.json()['id']}/agradecer",
                       headers={"Authorization": f"Bearer {token}"}, json={})
    assert resp.status_code == 400
    assert http_mocado == []


def test_agradecer_telefone_invalido_400(client: TestClient, setup_data: dict, evo_configurado, http_mocado):
    token = setup_data["tokens"]["congregacao1_area1"]
    congregacao_id = setup_data["congregacoes"]["congregacao1_area1"].id
    _, semana = _criar_mes_semana(client, token, congregacao_id)
    diz = _criar_dizimista(client, token, congregacao_id, "Fone Ruim", "123")
    renda = client.post(f"/semanas/{semana['id']}/rendas/", headers={"Authorization": f"Bearer {token}"}, json={
        "tipo": "Dízimo", "valor": 10.0, "data_registro": "2026-03-02",
        "metodo_pagamento": "Espécie", "dizimista_ofertante_id": diz["id"]})
    resp = client.post(f"/rendas/{renda.json()['id']}/agradecer",
                       headers={"Authorization": f"Bearer {token}"}, json={})
    assert resp.status_code == 400


def test_agradecer_sem_config_400(client: TestClient, setup_data: dict, monkeypatch, http_mocado):
    monkeypatch.delenv("EVOLUTION_API_URL", raising=False)
    monkeypatch.delenv("EVOLUTION_API_KEY", raising=False)
    monkeypatch.delenv("EVOLUTION_INSTANCE", raising=False)
    token = setup_data["tokens"]["congregacao1_area1"]
    congregacao_id = setup_data["congregacoes"]["congregacao1_area1"].id
    _, semana = _criar_mes_semana(client, token, congregacao_id)
    diz = _criar_dizimista(client, token, congregacao_id, "Ana", "92999991111")
    renda = client.post(f"/semanas/{semana['id']}/rendas/", headers={"Authorization": f"Bearer {token}"}, json={
        "tipo": "Dízimo", "valor": 10.0, "data_registro": "2026-03-02",
        "metodo_pagamento": "Espécie", "dizimista_ofertante_id": diz["id"]})
    resp = client.post(f"/rendas/{renda.json()['id']}/agradecer",
                       headers={"Authorization": f"Bearer {token}"}, json={})
    assert resp.status_code == 400
    assert http_mocado == []


def test_agradecer_falha_api_502(client: TestClient, setup_data: dict, evo_configurado, monkeypatch):
    def fake_post(url, headers=None, json=None, timeout=None):
        return _RespostaFake(500, "instance not found")

    monkeypatch.setattr(evolution.httpx, "post", fake_post)
    token = setup_data["tokens"]["congregacao1_area1"]
    congregacao_id = setup_data["congregacoes"]["congregacao1_area1"].id
    _, semana = _criar_mes_semana(client, token, congregacao_id)
    diz = _criar_dizimista(client, token, congregacao_id, "Ana", "92999991111")
    renda = client.post(f"/semanas/{semana['id']}/rendas/", headers={"Authorization": f"Bearer {token}"}, json={
        "tipo": "Dízimo", "valor": 10.0, "data_registro": "2026-03-02",
        "metodo_pagamento": "Espécie", "dizimista_ofertante_id": diz["id"]})
    resp = client.post(f"/rendas/{renda.json()['id']}/agradecer",
                       headers={"Authorization": f"Bearer {token}"}, json={})
    assert resp.status_code == 502


def test_agradecer_dirigente_403(client: TestClient, setup_data: dict, db_session, evo_configurado, http_mocado):
    from datetime import timedelta
    import schemas as _schemas
    import crud as _crud
    import security as _sec
    token = setup_data["tokens"]["congregacao1_area1"]
    congregacao_id = setup_data["congregacoes"]["congregacao1_area1"].id
    _, semana = _criar_mes_semana(client, token, congregacao_id)
    diz = _criar_dizimista(client, token, congregacao_id, "Ana", "92999991111")
    renda = client.post(f"/semanas/{semana['id']}/rendas/", headers={"Authorization": f"Bearer {token}"}, json={
        "tipo": "Dízimo", "valor": 10.0, "data_registro": "2026-03-02",
        "metodo_pagamento": "Espécie", "dizimista_ofertante_id": diz["id"]})
    dirig = _crud.create_user(db_session, _schemas.UsuarioCreate(
        email="dir-evo@teste.com", password="x", funcao="dirigente", congregacao_id=congregacao_id))
    token_dir = _sec.create_access_token(data={"sub": dirig.email}, expires_delta=timedelta(minutes=30))
    resp = client.post(f"/rendas/{renda.json()['id']}/agradecer",
                       headers={"Authorization": f"Bearer {token_dir}"}, json={})
    assert resp.status_code == 403
    assert http_mocado == []


def test_agradecer_todos_pula_sem_telefone_e_repetidos(client: TestClient, setup_data: dict,
                                                       evo_configurado, http_mocado):
    token = setup_data["tokens"]["congregacao1_area1"]
    congregacao_id = setup_data["congregacoes"]["congregacao1_area1"].id
    _, semana = _criar_mes_semana(client, token, congregacao_id)
    com_fone = _criar_dizimista(client, token, congregacao_id, "Com Fone", "92999991111")
    sem_fone = _criar_dizimista(client, token, congregacao_id, "Sem Fone")
    base = {"tipo": "Dízimo", "data_registro": "2026-03-02", "metodo_pagamento": "Espécie"}
    r1 = client.post(f"/semanas/{semana['id']}/rendas/", headers={"Authorization": f"Bearer {token}"},
                     json={**base, "valor": 10.0, "dizimista_ofertante_id": com_fone["id"]}).json()
    r2 = client.post(f"/semanas/{semana['id']}/rendas/", headers={"Authorization": f"Bearer {token}"},
                     json={**base, "valor": 20.0, "dizimista_ofertante_id": sem_fone["id"]}).json()

    resp = client.post(f"/semanas/{semana['id']}/agradecer-todos", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    corpo = resp.json()
    assert corpo["enviadas"] == [r1["id"]]
    assert corpo["sem_telefone"] == [r2["id"]]
    assert corpo["falhas"] == []

    resp2 = client.post(f"/semanas/{semana['id']}/agradecer-todos", headers={"Authorization": f"Bearer {token}"})
    assert resp2.json()["ja_enviadas"] == [r1["id"]]
    assert resp2.json()["enviadas"] == []


def test_webhook_evolution_3_filtros(client: TestClient, setup_data: dict, db_session, pasta_recibos, monkeypatch):
    import json
    import ocr
    import crud as _crud
    import schemas as _schemas

    cong = setup_data["congregacoes"]["congregacao1_area1"]
    _crud.create_user(
        db_session,
        _schemas.UsuarioCreate(
            email="tesoureiro-zap@teste.com",
            password="x",
            funcao="tesoureiro",
            telefone="(92) 99999-1111",
            denominacao_id=cong.denominacao_id,
            area_id=cong.area_id,
            congregacao_id=cong.id,
        ),
    )

    # Filtro 1: numero desconhecido (ex: usuario do Tocantins perguntando sobre ressurreicao) e ignorado.
    r_tocantins = client.post(
        "/webhooks/evolution",
        json={
            "data": {
                "key": {"remoteJid": "5563988887777@s.whatsapp.net", "fromMe": False},
                "message": {"conversation": "O que é ressurreição?"},
            }
        },
    )
    assert r_tocantins.status_code == 200
    assert r_tocantins.json() == {"status": "ignorado", "motivo": "remetente_nao_autorizado"}

    # Filtro 2: mensagem de texto do proprio tesoureiro (sem o 9o digito no JID) e ignorada pelo financeiro.
    r_texto = client.post(
        "/webhooks/evolution",
        json={
            "data": {
                "key": {"remoteJid": "559299991111@s.whatsapp.net", "fromMe": False},
                "message": {"conversation": "Boa noite pastor"},
            }
        },
    )
    assert r_texto.status_code == 200
    assert r_texto.json() == {"status": "ignorado", "motivo": "sem_imagem"}

    # Filtro 3: com OCR ativo, foto aleatoria (nao e recibo) e descartada.
    monkeypatch.setenv("OCR_PROVIDER", "gemini")
    monkeypatch.setenv("GEMINI_API_KEY", "chave-fake")
    img_b64 = base64.b64encode(PNG_BYTES).decode("ascii")

    class _RespFake:
        status_code = 200
        text = "ok"

        def __init__(self, txt):
            self._txt = txt

        def json(self):
            return {"candidates": [{"content": {"parts": [{"text": self._txt}]}}]}

    monkeypatch.setattr(
        ocr.httpx,
        "post",
        lambda *a, **kw: _RespFake('{"recibos": [{"data": null, "numero_recibo": null, "nome": null, "valor": null}]}'),
    )
    r_nao_recibo = client.post(
        "/webhooks/evolution",
        json={
            "data": {
                "key": {"remoteJid": "5592999991111@s.whatsapp.net", "fromMe": False},
                "message": {"base64": img_b64, "imageMessage": {"caption": "Cartaz"}},
            }
        },
    )
    assert r_nao_recibo.status_code == 200
    assert r_nao_recibo.json() == {"status": "ignorado", "motivo": "nao_eh_recibo"}

    # Filtro 3 aprovado: foto de 1a via de recibo cria ReciboPendente na congregacao do tesoureiro.
    monkeypatch.setattr(
        ocr.httpx,
        "post",
        lambda *a, **kw: _RespFake(
            '{"recibos": [{"data": "2026-03-02", "numero_recibo": "18592", "nome": "Debora Barros", '
            '"valor": 1185.0, "tipo": "Dízimo", "via": "1a_via_branca"}]}'
        ),
    )
    r_recibo = client.post(
        "/webhooks/evolution",
        json={
            "data": {
                "key": {"remoteJid": "559299991111@s.whatsapp.net", "fromMe": False},
                "message": {"base64": img_b64},
            }
        },
    )
    assert r_recibo.status_code == 200, r_recibo.text
    corpo = r_recibo.json()
    assert corpo["status"] == "processado"
    assert corpo["congregacao_id"] == cong.id
    assert len(corpo["recibo_ids"]) == 1

    token = setup_data["tokens"]["congregacao1_area1"]
    meses = client.get(f"/congregacoes/{cong.id}/meses/", headers={"Authorization": f"Bearer {token}"}).json()
    semana_id = meses[0]["semanas"][0]["id"]
    pendentes = client.get(
        f"/semanas/{semana_id}/recibos/?status_filtro=pendente",
        headers={"Authorization": f"Bearer {token}"},
    ).json()
    assert len(pendentes) == 1
    assert json.loads(pendentes[0]["sugestao_ocr"])["numero_recibo"] == "18592"
