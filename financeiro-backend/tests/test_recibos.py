"""Testes do upload de recibos + conferencia assistida (Etapa B)."""
import base64
import importlib.util
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient

import crud
import recibos
import schemas
import security

# PNG 1x1 valido (evita depender de Pillow/fpdf nos testes).
PNG_BYTES = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
)
TEM_FITZ = importlib.util.find_spec("fitz") is not None


def _pdf_minimo() -> bytes:
    """Monta um PDF valido de 1 pagina (sem dependencias externas)."""
    stream = b"BT /F1 12 Tf 10 180 Td (Recibo 1) Tj ET"
    objs = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] "
        b"/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
        b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for i, corpo in enumerate(objs, start=1):
        offsets.append(len(out))
        out += f"{i} 0 obj\n".encode() + corpo + b"\nendobj\n"
    xref = len(out)
    out += f"xref\n0 {len(objs) + 1}\n0000000000 65535 f \n".encode()
    for off in offsets:
        out += f"{off:010d} 00000 n \n".encode()
    out += f"trailer\n<< /Size {len(objs) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF".encode()
    return bytes(out)


@pytest.fixture(autouse=True)
def sem_chave_ocr(monkeypatch):
    """Garante o modo 100% manual (sem OCR) nestes testes."""
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)


@pytest.fixture()
def pasta_recibos(tmp_path, monkeypatch):
    monkeypatch.setattr(recibos, "BASE_DIR", str(tmp_path / "recibos"))
    return tmp_path


def _criar_mes_semana(client: TestClient, token: str, congregacao_id: int):
    mes = client.post(
        "/meses/",
        headers={"Authorization": f"Bearer {token}"},
        json={"nome": "2026/02", "congregacao_id": congregacao_id, "saldo_inicial": 0.0},
    )
    assert mes.status_code == 201
    semana = client.post(
        f"/meses/{mes.json()['id']}/semanas/",
        headers={"Authorization": f"Bearer {token}"},
        json={"numero": 1, "data_inicio": "2026-02-01", "data_fim": "2026-02-07"},
    )
    assert semana.status_code == 201
    return mes.json(), semana.json()


def _token_dirigente(db_session, congregacao_id: int) -> str:
    user = crud.create_user(db_session, schemas.UsuarioCreate(
        email="dirigente@example.com", password="x", funcao="dirigente",
        congregacao_id=congregacao_id,
    ))
    return security.create_access_token(data={"sub": user.email}, expires_delta=timedelta(minutes=30))


def _upload(client, token, semana_id, arquivos):
    return client.post(
        f"/semanas/{semana_id}/recibos/upload",
        headers={"Authorization": f"Bearer {token}"},
        files=[("files", (nome, conteudo, mime)) for nome, conteudo, mime in arquivos],
    )


def test_upload_imagens_gera_pendentes(client: TestClient, setup_data: dict, pasta_recibos):
    token = setup_data["tokens"]["congregacao1_area1"]
    congregacao_id = setup_data["congregacoes"]["congregacao1_area1"].id
    _, semana = _criar_mes_semana(client, token, congregacao_id)

    resp = _upload(client, token, semana["id"], [
        ("recibo1.png", PNG_BYTES, "image/png"),
        ("recibo2.png", PNG_BYTES, "image/png"),
    ])
    assert resp.status_code == 201, resp.text
    itens = resp.json()
    assert len(itens) == 2
    assert all(i["status"] == "pendente" for i in itens)
    # Sem chave de OCR: sem sugestao, sem erro — fluxo manual puro.
    assert all(i["sugestao_ocr"] is None and i["ocr_erro"] is None for i in itens)

    # A imagem de cada pendente pode ser baixada para a conferencia.
    img = client.get(f"/recibos/{itens[0]['id']}/imagem", headers={"Authorization": f"Bearer {token}"})
    assert img.status_code == 200
    assert img.headers["content-type"] == "image/png"
    assert img.content.startswith(b"\x89PNG")


def test_upload_pdf(client: TestClient, setup_data: dict, pasta_recibos):
    token = setup_data["tokens"]["congregacao1_area1"]
    congregacao_id = setup_data["congregacoes"]["congregacao1_area1"].id
    _, semana = _criar_mes_semana(client, token, congregacao_id)

    resp = _upload(client, token, semana["id"], [("recibos.pdf", _pdf_minimo(), "application/pdf")])
    if TEM_FITZ:
        assert resp.status_code == 201, resp.text
        itens = resp.json()
        assert len(itens) == 1
        assert itens[0]["pagina_origem"] == 1
    else:
        assert resp.status_code == 400
        assert "PyMuPDF" in resp.json()["detail"]


def test_upload_bytes_invalidos_400(client: TestClient, setup_data: dict, pasta_recibos):
    token = setup_data["tokens"]["congregacao1_area1"]
    congregacao_id = setup_data["congregacoes"]["congregacao1_area1"].id
    _, semana = _criar_mes_semana(client, token, congregacao_id)
    resp = _upload(client, token, semana["id"], [("falso.png", b"isso nao e imagem", "image/png")])
    # Com fitz: erro de parse; sem fitz: magic invalido. Nos dois casos, 400.
    assert resp.status_code == 400


def test_confirmar_cria_renda_vinculada_e_recalcula(client: TestClient, setup_data: dict, pasta_recibos):
    token = setup_data["tokens"]["congregacao1_area1"]
    congregacao_id = setup_data["congregacoes"]["congregacao1_area1"].id
    mes, semana = _criar_mes_semana(client, token, congregacao_id)
    up = _upload(client, token, semana["id"], [("r.png", PNG_BYTES, "image/png")])
    recibo_id = up.json()[0]["id"]

    resp = client.post(
        f"/recibos/{recibo_id}/confirmar",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "tipo": "Dízimo", "valor": 150.0, "data_registro": "2026-02-03",
            "numero_recibo": "555", "metodo_pagamento": "Espécie",
            "dizimista_nome": "José da Silva",
        },
    )
    assert resp.status_code == 201, resp.text
    renda = resp.json()
    assert renda["numero_recibo"] == "555"
    assert renda["recibo_imagem"]  # renda vinculada a foto do recibo
    assert renda["dizimista_ofertante_id"] is not None

    # O dizimista foi criado pelo nome e a comissao recalculada.
    diz = client.get(f"/congregacoes/{congregacao_id}/dizimistas/", headers={"Authorization": f"Bearer {token}"})
    assert any(d["nome"] == "José da Silva" for d in diz.json())
    semanas = client.get(f"/meses/{mes['id']}/semanas/", headers={"Authorization": f"Bearer {token}"})
    assert semanas.json()[0]["comissao"] == pytest.approx(150.0 * 0.33)

    # Pendente saiu da fila.
    pend = client.get(
        f"/semanas/{semana['id']}/recibos/?status_filtro=pendente",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert pend.json() == []
    # Confirmar de novo e excluir: bloqueados.
    assert client.post(f"/recibos/{recibo_id}/confirmar",
                       headers={"Authorization": f"Bearer {token}"}, json={
                           "tipo": "Dízimo", "valor": 1.0, "data_registro": "2026-02-03",
                           "metodo_pagamento": "Espécie"}).status_code == 400
    assert client.delete(f"/recibos/{recibo_id}", headers={"Authorization": f"Bearer {token}"}).status_code == 400


def test_confirmar_duplicado_409(client: TestClient, setup_data: dict, pasta_recibos):
    token = setup_data["tokens"]["congregacao1_area1"]
    congregacao_id = setup_data["congregacoes"]["congregacao1_area1"].id
    _, semana = _criar_mes_semana(client, token, congregacao_id)
    up = _upload(client, token, semana["id"], [
        ("a.png", PNG_BYTES, "image/png"),
        ("b.png", PNG_BYTES, "image/png"),
    ])
    ids = [i["id"] for i in up.json()]
    payload = {"tipo": "Dízimo", "valor": 50.0, "data_registro": "2026-02-03",
               "numero_recibo": "777", "metodo_pagamento": "Espécie"}
    assert client.post(f"/recibos/{ids[0]}/confirmar",
                       headers={"Authorization": f"Bearer {token}"}, json=payload).status_code == 201
    dup = client.post(f"/recibos/{ids[1]}/confirmar",
                      headers={"Authorization": f"Bearer {token}"}, json=payload)
    assert dup.status_code == 409


def test_upload_tipo_invalido_400(client: TestClient, setup_data: dict, pasta_recibos):
    token = setup_data["tokens"]["congregacao1_area1"]
    congregacao_id = setup_data["congregacoes"]["congregacao1_area1"].id
    _, semana = _criar_mes_semana(client, token, congregacao_id)
    resp = _upload(client, token, semana["id"], [("nota.txt", b"oi", "text/plain")])
    assert resp.status_code == 400


def test_upload_e_confirmar_mes_fechado_400(client: TestClient, setup_data: dict, pasta_recibos):
    token = setup_data["tokens"]["congregacao1_area1"]
    congregacao_id = setup_data["congregacoes"]["congregacao1_area1"].id
    mes, semana = _criar_mes_semana(client, token, congregacao_id)
    up = _upload(client, token, semana["id"], [("r.png", PNG_BYTES, "image/png")])
    recibo_id = up.json()[0]["id"]
    assert client.put(f"/meses/{mes['id']}/fechar", headers={"Authorization": f"Bearer {token}"}).status_code == 200

    up2 = _upload(client, token, semana["id"], [("r2.png", PNG_BYTES, "image/png")])
    assert up2.status_code == 400
    conf = client.post(
        f"/recibos/{recibo_id}/confirmar",
        headers={"Authorization": f"Bearer {token}"},
        json={"tipo": "Dízimo", "valor": 10.0, "data_registro": "2026-02-03", "metodo_pagamento": "Espécie"},
    )
    assert conf.status_code == 400


def test_dirigente_nao_pode_enviar_nem_confirmar(client: TestClient, setup_data: dict, db_session, pasta_recibos):
    token = setup_data["tokens"]["congregacao1_area1"]
    congregacao_id = setup_data["congregacoes"]["congregacao1_area1"].id
    _, semana = _criar_mes_semana(client, token, congregacao_id)
    up = _upload(client, token, semana["id"], [("r.png", PNG_BYTES, "image/png")])
    recibo_id = up.json()[0]["id"]

    token_dir = _token_dirigente(db_session, congregacao_id)
    up_dir = _upload(client, token_dir, semana["id"], [("r.png", PNG_BYTES, "image/png")])
    assert up_dir.status_code == 403
    conf_dir = client.post(
        f"/recibos/{recibo_id}/confirmar",
        headers={"Authorization": f"Bearer {token_dir}"},
        json={"tipo": "Dízimo", "valor": 10.0, "data_registro": "2026-02-03", "metodo_pagamento": "Espécie"},
    )
    assert conf_dir.status_code == 403
    # Mas pode ver a fila e a imagem (leitura).
    assert client.get(f"/semanas/{semana['id']}/recibos/",
                      headers={"Authorization": f"Bearer {token_dir}"}).status_code == 200
    assert client.get(f"/recibos/{recibo_id}/imagem",
                      headers={"Authorization": f"Bearer {token_dir}"}).status_code == 200


def test_excluir_pendente_remove_arquivo(client: TestClient, setup_data: dict, pasta_recibos):
    token = setup_data["tokens"]["congregacao1_area1"]
    congregacao_id = setup_data["congregacoes"]["congregacao1_area1"].id
    _, semana = _criar_mes_semana(client, token, congregacao_id)
    up = _upload(client, token, semana["id"], [("r.png", PNG_BYTES, "image/png")])
    recibo_id = up.json()[0]["id"]
    assert client.delete(f"/recibos/{recibo_id}", headers={"Authorization": f"Bearer {token}"}).status_code == 204
    assert client.get(f"/recibos/{recibo_id}/imagem", headers={"Authorization": f"Bearer {token}"}).status_code == 404
    # Nenhum arquivo restou na pasta.
    base = pasta_recibos / "recibos"
    restaram = [p for p in base.rglob("*") if p.is_file()] if base.exists() else []
    assert restaram == []


def test_reprocessar_ocr_sem_chave_400(client: TestClient, setup_data: dict, pasta_recibos):
    token = setup_data["tokens"]["congregacao1_area1"]
    congregacao_id = setup_data["congregacoes"]["congregacao1_area1"].id
    _, semana = _criar_mes_semana(client, token, congregacao_id)
    up = _upload(client, token, semana["id"], [("r.png", PNG_BYTES, "image/png")])
    recibo_id = up.json()[0]["id"]
    resp = client.post(f"/recibos/{recibo_id}/ocr/reprocessar", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 400


def test_buscar_dizimista_aproximado(db_session, setup_data: dict):
    cong_id = setup_data["congregacoes"]["congregacao1_area1"].id
    d1 = crud.create_dizimista_ofertante(db_session, schemas.DizimistaOfertanteCreate(nome="Débora Lima Barros"), cong_id)
    d2 = crud.create_dizimista_ofertante(db_session, schemas.DizimistaOfertanteCreate(nome="José Odanildo Lopes"), cong_id)
    d3 = crud.create_dizimista_ofertante(db_session, schemas.DizimistaOfertanteCreate(nome="Nicolly Neri"), cong_id)
    lista = [d1, d2, d3]

    assert recibos._buscar_dizimista_aproximado("Debora Barros", lista).id == d1.id
    assert recibos._buscar_dizimista_aproximado("Jose Odanildo", lista).id == d2.id
    assert recibos._buscar_dizimista_aproximado("Nicoly Nery", lista).id == d3.id
    assert recibos._buscar_dizimista_aproximado("Culto de Celebração", lista) is None


def test_upload_folha_multiplos_recibos_desmembra_e_vincula(client: TestClient, setup_data: dict, db_session, pasta_recibos, monkeypatch):
    import json
    import ocr
    from conftest import TestingSessionLocal

    monkeypatch.setenv("OCR_PROVIDER", "gemini")
    monkeypatch.setenv("GEMINI_API_KEY", "chave-fake")
    monkeypatch.setattr(recibos, "SessionLocal", TestingSessionLocal)

    token = setup_data["tokens"]["congregacao1_area1"]
    cong_id = setup_data["congregacoes"]["congregacao1_area1"].id
    debora = crud.create_dizimista_ofertante(db_session, schemas.DizimistaOfertanteCreate(nome="Débora Lima Barros"), cong_id)
    _, semana = _criar_mes_semana(client, token, cong_id)

    class _RespFake:
        status_code = 200
        text = "ok"

        def __init__(self, corpo):
            self._corpo = corpo

        def json(self):
            return self._corpo

    def fake_post(url, params=None, json=None, headers=None, timeout=None):
        return _RespFake({
            "candidates": [{
                "content": {
                    "parts": [{
                        "text": (
                            '{"recibos": ['
                            '{"data": "2026-02-02", "numero_recibo": "18592", "nome": "Debora Barros", '
                            '"valor": 1185.0, "tipo": "Dízimo", "valor_extenso": "mil, cento e oitenta e cinco reais", '
                            '"divergencia_valor": false, "rotacao_graus": 0, "box_2d": [0, 0, 500, 500]}, '
                            '{"data": "2026-02-02", "numero_recibo": "314859", "nome": "Gabriel de Menezes", '
                            '"valor": 10.0, "tipo": "Dízimo", "rotacao_graus": 90, "box_2d": [0, 500, 500, 1000]}, '
                            '{"data": "2026-02-02", "numero_recibo": "314860", "nome": "Culto de Celebração", '
                            '"valor": 40.0, "tipo": "Oferta", "rotacao_graus": 0, "box_2d": [500, 500, 1000, 1000]}'
                            ']}'
                        )
                    }]
                }
            }]
        })

    monkeypatch.setattr(ocr.httpx, "post", fake_post)

    up = _upload(client, token, semana["id"], [("folha.png", PNG_BYTES, "image/png")])
    assert up.status_code == 201

    lista = client.get(
        f"/semanas/{semana['id']}/recibos/?status_filtro=pendente",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert lista.status_code == 200
    itens = lista.json()
    assert len(itens) == 3

    sugs = [json.loads(i["sugestao_ocr"]) for i in itens]
    assert sugs[0]["numero_recibo"] == "18592"
    assert sugs[0]["dizimista_id"] == debora.id
    assert sugs[0]["dizimista_nome_cadastro"] == "Débora Lima Barros"
    assert sugs[1]["numero_recibo"] == "314859"
    assert sugs[2]["tipo"] == "Oferta"

    # Cada recibo desmembrado tem sua propria imagem acessivel.
    for item in itens:
        img = client.get(f"/recibos/{item['id']}/imagem", headers={"Authorization": f"Bearer {token}"})
        assert img.status_code == 200
        assert img.content.startswith(b"\x89PNG")


def test_pareamento_1a_e_2a_via_e_confirmacao_em_lote(client: TestClient, setup_data: dict, pasta_recibos, monkeypatch):
    import json
    import ocr
    from conftest import TestingSessionLocal

    monkeypatch.setenv("OCR_PROVIDER", "gemini")
    monkeypatch.setenv("GEMINI_API_KEY", "chave-fake")
    monkeypatch.setattr(recibos, "SessionLocal", TestingSessionLocal)

    token = setup_data["tokens"]["congregacao1_area1"]
    cong_id = setup_data["congregacoes"]["congregacao1_area1"].id
    mes, semana = _criar_mes_semana(client, token, cong_id)

    respostas_ocr = iter([
        # 1a via do 311768 (R$ 150) e 311769 (R$ 200)
        '{"recibos": [{"data": "2026-02-02", "numero_recibo": "311768", "nome": "Paula", "valor": 150.0, "tipo": "Dízimo", "via": "1a_via_branca"}]}',
        '{"recibos": [{"data": "2026-02-02", "numero_recibo": "311769", "nome": "Carlos", "valor": 200.0, "tipo": "Dízimo", "via": "1a_via_branca"}]}',
        # 2a via do 311768 (bate R$ 150) e 311769 (diverge R$ 50)
        '{"recibos": [{"data": "2026-02-02", "numero_recibo": "311768", "nome": "Paula", "valor": 150.0, "tipo": "Dízimo", "via": "2a_via_azul"}]}',
        '{"recibos": [{"data": "2026-02-02", "numero_recibo": "311769", "nome": "Carlos", "valor": 50.0, "tipo": "Dízimo", "via": "2a_via_azul"}]}',
    ])

    class _RespFake:
        status_code = 200
        text = "ok"

        def __init__(self, txt):
            self._txt = txt

        def json(self):
            return {"candidates": [{"content": {"parts": [{"text": self._txt}]}}]}

    monkeypatch.setattr(ocr.httpx, "post", lambda *a, **kw: _RespFake(next(respostas_ocr)))

    # Envia as 1as vias e depois as 2as vias
    for _ in range(4):
        resp = _upload(client, token, semana["id"], [("r.png", PNG_BYTES, "image/png")])
        assert resp.status_code == 201

    lista = client.get(
        f"/semanas/{semana['id']}/recibos/?status_filtro=pendente",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert lista.status_code == 200
    itens = lista.json()
    assert len(itens) == 2

    por_num = {json.loads(i["sugestao_ocr"])["numero_recibo"]: i for i in itens}
    item_ok = por_num["311768"]
    item_div = por_num["311769"]

    assert item_ok["arquivo_par"]
    assert json.loads(item_ok["sugestao_ocr"])["status_conferencia"] == "conferido_ok"
    assert json.loads(item_div["sugestao_ocr"])["status_conferencia"] == "divergente"

    # Imagem pareada pode ser baixada para exibir lado a lado.
    img_par = client.get(f"/recibos/{item_ok['id']}/imagem-par", headers={"Authorization": f"Bearer {token}"})
    assert img_par.status_code == 200
    assert img_par.content.startswith(b"\x89PNG")

    # Confirmacao em lote aprova apenas o conferido_ok e preserva o divergente.
    lote = client.post(
        f"/semanas/{semana['id']}/recibos/confirmar-conferidos",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert lote.status_code == 200, lote.text
    assert lote.json()["confirmados"] == [item_ok["id"]]
    assert item_div["id"] in lote.json()["ignorados"]

    restantes = client.get(
        f"/semanas/{semana['id']}/recibos/?status_filtro=pendente",
        headers={"Authorization": f"Bearer {token}"},
    ).json()
    assert [r["id"] for r in restantes] == [item_div["id"]]

    semanas = client.get(f"/meses/{mes['id']}/semanas/", headers={"Authorization": f"Bearer {token}"}).json()
    assert semanas[0]["comissao"] == pytest.approx(150.0 * 0.33)
