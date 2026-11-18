"""Testes do modulo de OCR (Etapa B) com as APIs mocadas."""
import pytest

import ocr


class _RespostaFake:
    def __init__(self, status_code: int, corpo: dict, texto: str = ""):
        self.status_code = status_code
        self._corpo = corpo
        self.text = texto or "fake"

    def json(self):
        return self._corpo


def _envelope_gemini(texto: str) -> dict:
    return {"candidates": [{"content": {"parts": [{"text": texto}]}}]}


def _envelope_muse(texto: str) -> dict:
    return {"choices": [{"message": {"role": "assistant", "content": texto}}]}


# --- Provedor padrao: muse ---

def test_provedor_padrao_e_muse(monkeypatch):
    monkeypatch.delenv("OCR_PROVIDER", raising=False)
    assert ocr.provedor() == "muse"


def test_muse_sem_chave_indisponivel(monkeypatch):
    monkeypatch.delenv("OCR_PROVIDER", raising=False)
    monkeypatch.delenv("MODEL_API_KEY", raising=False)
    assert ocr.ocr_disponivel() is False
    with pytest.raises(RuntimeError):
        ocr.extrair_recibo(b"fake")


def test_muse_extracao_ok(monkeypatch):
    monkeypatch.delenv("OCR_PROVIDER", raising=False)
    monkeypatch.setenv("MODEL_API_KEY", "chave-fake")
    chamadas = {}

    def fake_post(url, headers=None, json=None, params=None, timeout=None):
        chamadas["url"] = url
        chamadas["headers"] = headers
        chamadas["json"] = json
        return _RespostaFake(200, _envelope_muse(
            '{"data": "2026-02-03", "numero_recibo": "555", "nome": "Jose da Silva", "valor": 150.5}'
        ))

    monkeypatch.setattr(ocr.httpx, "post", fake_post)
    resultado = ocr.extrair_recibo(b"bytes-da-imagem")
    assert resultado == {"data": "2026-02-03", "numero_recibo": "555", "nome": "Jose da Silva", "valor": 150.5}
    assert chamadas["url"] == "https://api.meta.ai/v1/chat/completions"
    assert chamadas["headers"]["Authorization"] == "Bearer chave-fake"
    assert chamadas["json"]["model"] == "muse-spark-1.3"
    partes = chamadas["json"]["messages"][0]["content"]
    assert partes[0]["type"] == "text"
    assert partes[1]["type"] == "image_url"
    assert partes[1]["image_url"]["url"].startswith("data:image/png;base64,")


def test_muse_tolera_cerca_markdown_e_valor_br(monkeypatch):
    monkeypatch.delenv("OCR_PROVIDER", raising=False)
    monkeypatch.setenv("MODEL_API_KEY", "chave-fake")

    def fake_post(url, headers=None, json=None, params=None, timeout=None):
        return _RespostaFake(200, _envelope_muse(
            '```json\n{"data": null, "numero_recibo": null, "nome": null, "valor": "R$ 1.200,50"}\n```'
        ))

    monkeypatch.setattr(ocr.httpx, "post", fake_post)
    assert ocr.extrair_recibo(b"x") == {"data": None, "numero_recibo": None, "nome": None, "valor": 1200.50}


def test_muse_http_erro_vira_value_error(monkeypatch):
    monkeypatch.delenv("OCR_PROVIDER", raising=False)
    monkeypatch.setenv("MODEL_API_KEY", "chave-fake")

    def fake_post(url, headers=None, json=None, params=None, timeout=None):
        return _RespostaFake(401, {}, texto="unauthorized")

    monkeypatch.setattr(ocr.httpx, "post", fake_post)
    with pytest.raises(ValueError, match="HTTP 401"):
        ocr.extrair_recibo(b"x")


# --- Provedor alternativo: gemini ---

def test_gemini_sem_chave_indisponivel(monkeypatch):
    monkeypatch.setenv("OCR_PROVIDER", "gemini")
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    assert ocr.ocr_disponivel() is False
    with pytest.raises(RuntimeError):
        ocr.extrair_recibo(b"fake")


def test_gemini_extracao_ok(monkeypatch):
    monkeypatch.setenv("OCR_PROVIDER", "gemini")
    monkeypatch.setenv("GEMINI_API_KEY", "chave-fake")
    chamadas = {}

    def fake_post(url, params=None, json=None, headers=None, timeout=None):
        chamadas["url"] = url
        chamadas["params"] = params
        assert "inline_data" in json["contents"][0]["parts"][1]
        return _RespostaFake(200, _envelope_gemini(
            '{"data": "2026-02-03", "numero_recibo": "555", "nome": "Jose da Silva", "valor": 150.5}'
        ))

    monkeypatch.setattr(ocr.httpx, "post", fake_post)
    resultado = ocr.extrair_recibo(b"bytes-da-imagem")
    assert resultado == {"data": "2026-02-03", "numero_recibo": "555", "nome": "Jose da Silva", "valor": 150.5}
    assert "generateContent" in chamadas["url"]
    assert chamadas["params"] == {"key": "chave-fake"}


def test_gemini_extracao_enriquecida_e_nomes_conhecidos(monkeypatch):
    monkeypatch.setenv("OCR_PROVIDER", "gemini")
    monkeypatch.setenv("GEMINI_API_KEY", "chave-fake")
    chamadas = {}

    def fake_post(url, params=None, json=None, headers=None, timeout=None):
        chamadas["prompt"] = json["contents"][0]["parts"][0]["text"]
        return _RespostaFake(200, _envelope_gemini(
            '{"data": "2026-11-10", "numero_recibo": "951107", "nome": "José Odanildo Lopes", '
            '"valor": 570.0, "tipo": "dizimo", "valor_extenso": "Quinhentos e setenta reais", '
            '"divergencia_valor": false, "via": "2a_via_azul", "congregacao_numero": "XXIII"}'
        ))

    monkeypatch.setattr(ocr.httpx, "post", fake_post)
    resultado = ocr.extrair_recibo(
        b"bytes-da-imagem",
        nomes_conhecidos=["José Odanildo Lopes", "Marcos Brito"],
    )
    assert "José Odanildo Lopes" in chamadas["prompt"]
    assert "Marcos Brito" in chamadas["prompt"]
    assert resultado == {
        "data": "2026-11-10",
        "numero_recibo": "951107",
        "nome": "José Odanildo Lopes",
        "valor": 570.0,
        "tipo": "Dízimo",
        "valor_extenso": "Quinhentos e setenta reais",
        "divergencia_valor": False,
        "via": "2a_via_azul",
        "congregacao_numero": "23",
    }


def test_extrair_recibos_multiplos_e_rotacao(monkeypatch):
    monkeypatch.setenv("OCR_PROVIDER", "gemini")
    monkeypatch.setenv("GEMINI_API_KEY", "chave-fake")

    def fake_post(url, params=None, json=None, headers=None, timeout=None):
        return _RespostaFake(200, _envelope_gemini(
            '{"recibos": ['
            '{"data": "2026-10-04", "numero_recibo": "314856", "nome": "Nicolly Neri", "valor": 50, '
            '"tipo": "Dízimo", "rotacao_graus": 0, "box_2d": [10, 10, 490, 490]}, '
            '{"data": "2026-10-04", "numero_recibo": "314859", "nome": "Gabriel de Menezes", "valor": 10, '
            '"tipo": "Dízimo", "rotacao_graus": 90, "box_2d": [10, 510, 490, 990]}, '
            '{"data": "2026-10-04", "numero_recibo": "314860", "nome": "Culto de Celebração", "valor": 40, '
            '"tipo": "oferta", "divergencia_valor": true, "valor_extenso": "Quarenta reais", '
            '"rotacao_graus": 0, "box_2d": [510, 510, 990, 990]}'
            ']}'
        ))

    monkeypatch.setattr(ocr.httpx, "post", fake_post)
    resultados = ocr.extrair_recibos(b"folha-4-recibos")
    assert len(resultados) == 3
    assert resultados[0]["numero_recibo"] == "314856"
    assert resultados[0]["rotacao_graus"] == 0
    assert resultados[1]["numero_recibo"] == "314859"
    assert resultados[1]["rotacao_graus"] == 90
    assert resultados[1]["box_2d"] == [10.0, 510.0, 490.0, 990.0]
    assert resultados[2]["tipo"] == "Oferta"
    assert resultados[2]["divergencia_valor"] is True
