#!/usr/bin/env bash
#
# atualiza.sh — Atualiza o financeiro no VPS em um comando só.
#
# O que ele faz, nesta ordem:
#   1. Backup do banco (financeiro_data) em ./backups
#   2. git pull (somente fast-forward, para não sobrescrever nada)
#   3. Rebuild das imagens Docker
#   4. Sobe/reinicia os containers
#   5. Roda o seed (idempotente: só cria o superuser na 1ª vez;
#      em atualizações ele apenas confirma que já existe e sai)
#
# Uso:
#   ./atualiza.sh              # atualização normal
#   ./atualiza.sh --recover    # também permite recuperar a senha do superuser
#   ./atualiza.sh --no-seed    # faz tudo, mas pula o seed
#
set -euo pipefail

# Vai para o diretório onde este script está (a raiz do projeto).
cd "$(dirname "$0")"

# Detecta o comando compose (v2 "docker compose" ou v1 "docker-compose").
if docker compose version >/dev/null 2>&1; then
  COMPOSE="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE="docker-compose"
else
  echo "ERRO: 'docker compose' não encontrado. Instale o Docker + Compose." >&2
  exit 1
fi

# --- Flags ---------------------------------------------------------------
RECOVER=""
RUN_SEED=1
for arg in "$@"; do
  case "$arg" in
    --recover) RECOVER="--recover" ;;
    --no-seed) RUN_SEED=0 ;;
    -h|--help)
      grep '^#' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "ERRO: opção desconhecida: $arg" >&2
      echo "Use: ./atualiza.sh [--recover] [--no-seed]" >&2
      exit 1
      ;;
  esac
done

# --- 1. Backup -----------------------------------------------------------
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_DIR="./backups"
mkdir -p "$BACKUP_DIR"

echo "==> [1/5] Backup dos dados..."
if [ -d "./financeiro_data" ]; then
  BACKUP_FILE="${BACKUP_DIR}/financeiro_data_${TIMESTAMP}.tar.gz"
  tar -czf "$BACKUP_FILE" financeiro_data
  echo "    OK: $BACKUP_FILE"
else
  echo "    Aviso: ./financeiro_data não existe (primeira instalação?). Sem backup."
fi

# Mantém apenas os 10 backups mais recentes.
ls -1t "$BACKUP_DIR"/financeiro_data_*.tar.gz 2>/dev/null | tail -n +11 | xargs -r rm -f

# --- 2. Pull --------------------------------------------------------------
echo "==> [2/5] Atualizando código (git pull)..."
git pull --ff-only

# --- 3. Build -------------------------------------------------------------
echo "==> [3/5] Rebuild das imagens Docker..."
$COMPOSE build

# --- 4. Up ----------------------------------------------------------------
echo "==> [4/5] Subindo os containers..."
$COMPOSE up -d

# Pequena pausa para o backend iniciar e criar o índice do superuser.
sleep 3

# --- 5. Seed --------------------------------------------------------------
if [ "$RUN_SEED" -eq 1 ]; then
  echo "==> [5/5] Aplicando seed..."
  echo "    (Se o superuser já existir, ele confirma e sai sem pedir nada.)"
  # Sem -T para que, na 1ª vez, o terminal permita digitar as senhas.
  $COMPOSE exec backend python seed.py $RECOVER
else
  echo "==> [5/5] Seed pulado (--no-seed)."
fi

echo ""
echo "Concluído. Status:"
$COMPOSE ps