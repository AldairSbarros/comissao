"""OCR de recibos manuscritos via modelo de visao.

Recibos preenchidos a mao (principalmente cursiva) nao sao legiveis por OCR
tradicional (tesseract e similares), entao usamos um modelo multimodal: ele
recebe a foto do recibo e devolve os campos em JSON.

O resultado e SEMPRE sugestao: nada e lancado sem confirmacao humana na tela
de conferencia. Sem chave configurada, `ocr_disponivel()` retorna False e o
fluxo funciona 100% manual (digitacao olhando a foto).

Provedores (variavel OCR_PROVIDER, default: muse):
- muse: Meta API, formato OpenAI-compatible (chat/completions + image_url).
  ENV: MODEL_API_KEY (obrigatoria), META_API_URL (default https://api.meta.ai/v1),
  OCR_MUSE_MODEL (default muse-spark-1.3).
- gemini: Google AI Studio (generateContent).
  ENV: GEMINI_API_KEY (obrigatoria), OCR_GEMINI_MODEL (default gemini-2.0-flash).
"""
import base64
import json
import logging
import os
import re
import unicodedata

import httpx

logger = logging.getLogger(__name__)

TIMEOUT_SEGUNDOS = 60
MAX_NOMES_CONHECIDOS = 150
_ROMANOS_CONGREGACAO = {
    "IX": "9",
    "XIII": "13",
    "XVII": "17",
    "XXIII": "23",
}


def provedor() -> str:
    return os.environ.get("OCR_PROVIDER", "muse").strip().lower()


def ocr_disponivel() -> bool:
    """True quando o provedor selecionado tem chave configurada."""
    if provedor() == "gemini":
        return bool(os.environ.get("GEMINI_API_KEY"))
    return bool(os.environ.get("MODEL_API_KEY"))


def _prompt(
    ano: int,
    nomes_conhecidos: list[str] | None = None,
    multiplos: bool = False,
) -> str:
    nomes_filtrados = [n.strip() for n in (nomes_conhecidos or []) if n and n.strip()][:MAX_NOMES_CONHECIDOS]
    bloco_nomes = ""
    if nomes_filtrados:
        lista_str = "; ".join(nomes_filtrados)
        bloco_nomes = (
            "\n- Lista de contribuintes ja cadastrados nesta congregacao "
            "(se o nome manuscrito corresponder a algum deles apesar de letra cursiva "
            "dificil ou abreviacao, prefira retornar exatamente a grafia da lista): "
            f"[{lista_str}]."
        )

    campos_schema = (
        '{"data": "AAAA-MM-DD ou null", "numero_recibo": "string ou null", '
        '"nome": "string ou null", "valor": numero ou null, '
        '"tipo": "Dízimo ou Oferta ou null", '
        '"valor_extenso": "string ou null", '
        '"divergencia_valor": true ou false, '
        '"via": "1a_via_branca ou 2a_via_azul ou null", '
        '"congregacao_numero": "string ou null"'
    )
    if multiplos:
        campos_schema += (
            ', "rotacao_graus": 0 ou 90 ou 180 ou 270, '
            '"box_2d": [ymin, xmin, ymax, xmax]'
        )
    campos_schema += "}"

    if multiplos:
        cabecalho = (
            "Voce esta analisando uma foto ou folha escaneada que pode conter "
            "1 ou varios recibos de contribuicao da igreja IEADAM em portugues "
            "(alguns podem estar girados ou deitados). Localize TODOS os recibos "
            "visiveis na imagem, na ordem de leitura, e responda SOMENTE com um "
            "objeto JSON valido, sem markdown e sem explicacao:\n"
            f'{{"recibos": [{campos_schema}]}}\n'
            "- rotacao_graus: graus no sentido horario (0, 90, 180 ou 270) "
            "necessarios para deixar este recibo em pe e legivel.\n"
            "- box_2d: coordenadas normalizadas de 0 a 1000 [ymin, xmin, ymax, xmax] "
            "delimitando exatamente este recibo na imagem original.\n"
        )
    else:
        cabecalho = (
            "Voce esta lendo a foto de um recibo de contribuicao de igreja (IEADAM), "
            "preenchido a mao em portugues. Extraia os campos abaixo e responda "
            "SOMENTE com um objeto JSON valido, sem markdown e sem explicacao:\n"
            f"{campos_schema}\n"
        )

    return (
        f"{cabecalho}"
        f"- data: data escrita no recibo (aceite formatos como '10 de Novembro 2026', "
        f"'04 de OUT 2026' ou '01 de 11 2026'); converta para AAAA-MM-DD. "
        f"Se o ano estiver ausente, use {ano}. Se ilegivel, null.\n"
        "- numero_recibo: numero do recibo (geralmente impresso em vermelho no centro). "
        "Se ilegivel, null.\n"
        "- nome: nome do contribuinte ou descricao no campo Contribuinte. Se ilegivel, null.\n"
        "- valor: valor numerico em reais. LEIA SEMPRE o quadro numerico E a tarja cinza "
        "'Importancia Supra de' (valor por extenso). Use o extenso para desempatar "
        "algarismos duvidosos (ex.: 570,00 vs 510,00). Se ilegivel, null.\n"
        "- valor_extenso: transcricao exata do valor por extenso escrito na tarja cinza "
        "'Importancia Supra de'. Se ilegivel ou vazio, null.\n"
        "- divergencia_valor: true se houver conflito real entre o numero e o extenso ou "
        "sinal claro de rasura/adulteracao no valor; caso contrario false.\n"
        "- tipo: observe a marcacao '[X] Dizimo' e '[X] Oferta'. Se o carbono nao marcou "
        "com clareza, classifique como 'Dízimo' quando o campo Contribuinte for nome de "
        "pessoa fisica e como 'Oferta' quando for descricao de culto/evento "
        "(ex.: 'Culto de Celebracao', 'Culto de Doutrina', 'Oferta Ordinaria', 'Missao').\n"
        "- via: '1a_via_branca' se for papel branco/caneta direta, '2a_via_azul' se for "
        "papel azul ou segunda via carbonada, ou null se nao der para distinguir.\n"
        "- congregacao_numero: numero da congregacao no cabecalho (ex.: '9', '13', '17', '23'; "
        "converta algarismos romanos como XXIII para '23'). Se ausente, null."
        f"{bloco_nomes}\n"
        "Nao invente valores: na duvida, null."
    )


def _parse_valor(valor) -> float | None:
    """Aceita numero ou string BR ("150,00", "R$ 1.200,50") e devolve float."""
    if valor is None:
        return None
    if isinstance(valor, bool):
        return None
    if isinstance(valor, (int, float)):
        return float(valor)
    if isinstance(valor, str):
        texto = valor.strip().replace("R$", "").strip()
        # Formato BR: milhar com ponto, decimal com virgula.
        if "," in texto:
            texto = texto.replace(".", "").replace(",", ".")
        try:
            return float(texto)
        except ValueError:
            return None
    return None


def _remover_acentos(texto: str) -> str:
    nfkd = unicodedata.normalize("NFKD", texto)
    return "".join(ch for ch in nfkd if not unicodedata.combining(ch))


def _normalizar_tipo(tipo) -> str | None:
    if not tipo:
        return None
    texto = str(tipo).strip()
    if not texto:
        return None
    chave = _remover_acentos(texto).lower()
    if "dizim" in chave:
        return "Dízimo"
    if "ofert" in chave:
        return "Oferta"
    return texto


def _normalizar_congregacao_numero(valor) -> str | None:
    if valor is None:
        return None
    texto = str(valor).strip().upper()
    if not texto:
        return None
    if texto in _ROMANOS_CONGREGACAO:
        return _ROMANOS_CONGREGACAO[texto]
    if texto.isdigit():
        return str(int(texto))
    return str(valor).strip()


def _normalizar_box_2d(box) -> list[float] | None:
    if not isinstance(box, (list, tuple)) or len(box) != 4:
        return None
    try:
        coords = [float(c) for c in box]
    except (TypeError, ValueError):
        return None
    ymin, xmin, ymax, xmax = coords
    if not (0 <= ymin < ymax <= 1000 and 0 <= xmin < xmax <= 1000):
        return None
    return coords


def _limpar_cercas(texto: str) -> str:
    limpo = re.sub(r"^```(?:json)?\s*", "", texto.strip())
    return re.sub(r"\s*```$", "", limpo)


def _extrair_json(texto: str) -> dict:
    """Extrai o primeiro objeto JSON do texto (tolera cercas ```json)."""
    limpo = _limpar_cercas(texto)
    inicio = limpo.find("{")
    fim = limpo.rfind("}")
    if inicio == -1 or fim == -1 or fim <= inicio:
        raise ValueError(f"Resposta sem JSON: {texto[:200]}")
    return json.loads(limpo[inicio:fim + 1])


def _extrair_lista_json(texto: str) -> list[dict]:
    """Extrai lista de objetos JSON (aceita {'recibos': [...]}, [...] ou {...})."""
    limpo = _limpar_cercas(texto)
    ini_obj = limpo.find("{")
    ini_arr = limpo.find("[")
    if ini_arr != -1 and (ini_obj == -1 or ini_arr < ini_obj):
        fim_arr = limpo.rfind("]")
        if fim_arr <= ini_arr:
            raise ValueError(f"Resposta sem JSON valido: {texto[:200]}")
        parsed = json.loads(limpo[ini_arr:fim_arr + 1])
        if isinstance(parsed, list):
            itens = [item for item in parsed if isinstance(item, dict)]
            if not itens:
                raise ValueError(f"Lista JSON sem recibos: {texto[:200]}")
            return itens
        raise ValueError(f"Resposta sem lista JSON: {texto[:200]}")

    obj = _extrair_json(limpo)
    if isinstance(obj, dict) and isinstance(obj.get("recibos"), list):
        itens = [item for item in obj["recibos"] if isinstance(item, dict)]
        if not itens:
            raise ValueError(f"Nenhum recibo encontrado na resposta: {texto[:200]}")
        return itens
    if isinstance(obj, dict):
        return [obj]
    raise ValueError(f"Resposta inesperada do JSON: {texto[:200]}")


def _normalizar(dados: dict) -> dict:
    data = dados.get("data")
    numero = dados.get("numero_recibo")
    nome = dados.get("nome")
    resultado: dict = {
        "data": str(data).strip() if data else None,
        "numero_recibo": str(numero).strip() if numero else None,
        "nome": str(nome).strip() if nome else None,
        "valor": _parse_valor(dados.get("valor")),
    }

    tipo = _normalizar_tipo(dados.get("tipo"))
    if tipo is not None:
        resultado["tipo"] = tipo

    valor_extenso = dados.get("valor_extenso")
    if valor_extenso is not None and str(valor_extenso).strip():
        resultado["valor_extenso"] = str(valor_extenso).strip()

    if "divergencia_valor" in dados and dados["divergencia_valor"] is not None:
        resultado["divergencia_valor"] = bool(dados["divergencia_valor"])

    via = dados.get("via")
    if via is not None and str(via).strip():
        resultado["via"] = str(via).strip()

    cong = _normalizar_congregacao_numero(dados.get("congregacao_numero"))
    if cong is not None:
        resultado["congregacao_numero"] = cong

    if "rotacao_graus" in dados and dados["rotacao_graus"] is not None:
        try:
            rot = int(dados["rotacao_graus"])
            if rot in (0, 90, 180, 270):
                resultado["rotacao_graus"] = rot
        except (TypeError, ValueError):
            pass

    box = _normalizar_box_2d(dados.get("box_2d"))
    if box is not None:
        resultado["box_2d"] = box

    return resultado


def _chamar_muse(
    imagem_bytes: bytes,
    mime: str,
    ano: int,
    nomes_conhecidos: list[str] | None = None,
    multiplos: bool = False,
) -> tuple[str, str]:
    api_key = os.environ.get("MODEL_API_KEY")
    if not api_key:
        raise RuntimeError("OCR indisponivel: defina MODEL_API_KEY no ambiente.")
    base = os.environ.get("META_API_URL", "https://api.meta.ai/v1").rstrip("/")
    modelo = os.environ.get("OCR_MUSE_MODEL", "muse-spark-1.3")
    data_uri = f"data:{mime};base64," + base64.b64encode(imagem_bytes).decode("ascii")
    payload = {
        "model": modelo,
        "temperature": 0,
        "messages": [{
            "role": "user",
            "content": [
                {"type": "text", "text": _prompt(ano, nomes_conhecidos=nomes_conhecidos, multiplos=multiplos)},
                {"type": "image_url", "image_url": {"url": data_uri}},
            ],
        }],
    }
    try:
        resp = httpx.post(
            f"{base}/chat/completions",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json=payload,
            timeout=TIMEOUT_SEGUNDOS,
        )
    except httpx.HTTPError as exc:
        raise ValueError(f"Falha de rede no OCR: {exc}") from exc
    if resp.status_code != 200:
        raise ValueError(f"OCR recusado (HTTP {resp.status_code}): {resp.text[:300]}")
    try:
        corpo = resp.json()
        return corpo["choices"][0]["message"]["content"], resp.text
    except (KeyError, IndexError, ValueError) as exc:
        raise ValueError(f"Resposta inesperada do OCR: {resp.text[:300]}") from exc


def _chamar_gemini(
    imagem_bytes: bytes,
    mime: str,
    ano: int,
    nomes_conhecidos: list[str] | None = None,
    multiplos: bool = False,
) -> tuple[str, str]:
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("OCR indisponivel: defina GEMINI_API_KEY no ambiente.")
    modelo = os.environ.get("OCR_GEMINI_MODEL", "gemini-2.0-flash")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{modelo}:generateContent"
    payload = {
        "contents": [{
            "parts": [
                {"text": _prompt(ano, nomes_conhecidos=nomes_conhecidos, multiplos=multiplos)},
                {"inline_data": {
                    "mime_type": mime,
                    "data": base64.b64encode(imagem_bytes).decode("ascii"),
                }},
            ]
        }],
        "generationConfig": {"temperature": 0, "response_mime_type": "application/json"},
    }
    try:
        resp = httpx.post(url, params={"key": api_key}, json=payload, timeout=TIMEOUT_SEGUNDOS)
    except httpx.HTTPError as exc:
        raise ValueError(f"Falha de rede no OCR: {exc}") from exc
    if resp.status_code != 200:
        raise ValueError(f"OCR recusado (HTTP {resp.status_code}): {resp.text[:300]}")
    try:
        corpo = resp.json()
        return corpo["candidates"][0]["content"]["parts"][0]["text"], resp.text
    except (KeyError, IndexError, ValueError) as exc:
        raise ValueError(f"Resposta inesperada do OCR: {resp.text[:300]}") from exc


def _extrair_muse(
    imagem_bytes: bytes,
    mime: str,
    ano: int,
    nomes_conhecidos: list[str] | None = None,
) -> dict:
    texto, raw = _chamar_muse(imagem_bytes, mime, ano, nomes_conhecidos=nomes_conhecidos, multiplos=False)
    try:
        return _normalizar(_extrair_lista_json(texto)[0])
    except ValueError as exc:
        raise ValueError(f"Resposta inesperada do OCR: {raw[:300]}") from exc


def _extrair_gemini(
    imagem_bytes: bytes,
    mime: str,
    ano: int,
    nomes_conhecidos: list[str] | None = None,
) -> dict:
    texto, raw = _chamar_gemini(imagem_bytes, mime, ano, nomes_conhecidos=nomes_conhecidos, multiplos=False)
    try:
        return _normalizar(_extrair_lista_json(texto)[0])
    except ValueError as exc:
        raise ValueError(f"Resposta inesperada do OCR: {raw[:300]}") from exc


def _ano_padrao(ano: int | None) -> int:
    if ano is None:
        from datetime import date
        return date.today().year
    return ano


def extrair_recibo(
    imagem_bytes: bytes,
    mime: str = "image/png",
    ano: int | None = None,
    nomes_conhecidos: list[str] | None = None,
) -> dict:
    """Le a foto de um recibo e devolve {data, numero_recibo, nome, valor, ...}.

    Campos ilegiveis voltam como None. Levanta RuntimeError se o OCR nao
    estiver configurado e ValueError se a API falhar ou responder mal.
    """
    ano = _ano_padrao(ano)
    if provedor() == "gemini":
        return _extrair_gemini(imagem_bytes, mime, ano, nomes_conhecidos=nomes_conhecidos)
    return _extrair_muse(imagem_bytes, mime, ano, nomes_conhecidos=nomes_conhecidos)


def extrair_recibos(
    imagem_bytes: bytes,
    mime: str = "image/png",
    ano: int | None = None,
    nomes_conhecidos: list[str] | None = None,
) -> list[dict]:
    """Le uma foto ou pagina escaneada com 1 ou varios recibos e devolve lista normalizada."""
    ano = _ano_padrao(ano)
    if provedor() == "gemini":
        texto, raw = _chamar_gemini(imagem_bytes, mime, ano, nomes_conhecidos=nomes_conhecidos, multiplos=True)
    else:
        texto, raw = _chamar_muse(imagem_bytes, mime, ano, nomes_conhecidos=nomes_conhecidos, multiplos=True)
    try:
        return [_normalizar(item) for item in _extrair_lista_json(texto)]
    except ValueError as exc:
        raise ValueError(f"Resposta inesperada do OCR: {raw[:300]}") from exc
