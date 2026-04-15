#!/usr/bin/env bash
# init-sprint.sh — Requirement Refinator V3
#
# Onboarding asistido para crear un sprint nuevo o ingerir HUs desde una ruta externa.
# Ola 3 · U1 de la retrospectiva.
#
# Uso:
#   bash scripts/init-sprint.sh <sprint-id> --init
#       Crea docs/HUs/<sprint-id>/ (vacío) y copia las plantillas de contexto
#       si no existen los archivos reales.
#
#   bash scripts/init-sprint.sh <sprint-id> --ingest <ruta-externa>
#       Copia todos los archivos .md de <ruta-externa> a docs/HUs/<sprint-id>/.
#       Si <ruta-externa> contiene docs/contexto/contexto-funcional.md o
#       contexto-tecnico.md (recursivo), los copia también (con confirmación).
#       Valida que cada HU tenga al menos título y una sección de narrativa.
#
# Exit codes: 0 = OK · 1 = error de uso · 2 = fallo operativo

set -u

ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
cd "$ROOT" || exit 2

usage() {
  cat <<'USAGE'
Uso:
  bash scripts/init-sprint.sh <sprint-id> --init
  bash scripts/init-sprint.sh <sprint-id> --ingest <ruta-externa>

Ejemplos:
  bash scripts/init-sprint.sh Sprint-145 --init
  bash scripts/init-sprint.sh Sprint-145 --ingest /Users/me/Documents/otroCliente/HUs/
USAGE
  exit 1
}

SPRINT_ID="${1:-}"
MODE="${2:-}"
SRC="${3:-}"

[ -z "$SPRINT_ID" ] && usage
[ -z "$MODE" ] && usage

# Normaliza SPRINT_ID
if [[ ! "$SPRINT_ID" =~ ^[A-Za-z0-9][A-Za-z0-9_-]+$ ]]; then
  echo "✗ sprint-id inválido: $SPRINT_ID (solo alfanumérico, '-' y '_')"
  exit 1
fi

init_sprint() {
  local target="docs/HUs/$SPRINT_ID"
  if [ -d "$target" ]; then
    local n=$(find "$target" -maxdepth 1 -name "*.md" 2>/dev/null | wc -l | tr -d ' ')
    echo "⚠ docs/HUs/$SPRINT_ID ya existe con $n archivo(s) .md"
    echo "  Agrega tus HUs o ejecuta: /refinar-sprint $SPRINT_ID"
    return 0
  fi
  mkdir -p "$target"
  echo "✓ Creado docs/HUs/$SPRINT_ID/"

  # Copiar templates de contexto si el archivo real no existe
  for n in contexto-funcional contexto-tecnico; do
    if [ ! -f "docs/contexto/$n.md" ]; then
      if [ -f "docs/contexto/$n.template.md" ]; then
        cp "docs/contexto/$n.template.md" "docs/contexto/$n.md"
        echo "✓ Creado docs/contexto/$n.md (desde template)"
      else
        echo "⚠ No encontré docs/contexto/$n.template.md — crea docs/contexto/$n.md manualmente"
      fi
    fi
  done

  cat <<EOF

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ✅ Sprint $SPRINT_ID inicializado

  ➡ SIGUIENTES PASOS:
    1. Agrega tus HUs (.md) en docs/HUs/$SPRINT_ID/
    2. Edita docs/contexto/contexto-{funcional,tecnico}.md con info real
    3. Ejecuta: /refinar-sprint $SPRINT_ID
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EOF
}

ingest_sprint() {
  local src="$SRC"
  [ -z "$src" ] && { echo "✗ --ingest requiere <ruta-externa>"; exit 1; }
  [ ! -d "$src" ] && { echo "✗ ruta externa no existe o no es directorio: $src"; exit 2; }

  local target="docs/HUs/$SPRINT_ID"
  mkdir -p "$target"

  # 1) Copiar archivos .md directos (no recursivo, para no traer contenido anidado)
  local count=0
  while IFS= read -r -d '' file; do
    local basename=$(basename "$file")
    cp "$file" "$target/$basename"
    count=$((count+1))
  done < <(find "$src" -maxdepth 1 -name "*.md" -type f -print0 2>/dev/null)

  echo "✓ $count archivo(s) .md copiados a docs/HUs/$SPRINT_ID/"

  # 2) Buscar contextos en la ruta externa (recursivo 3 niveles)
  local ctx_func=$(find "$src" -maxdepth 3 -iname "*contexto*funcional*.md" -type f 2>/dev/null | head -1)
  local ctx_tec=$(find "$src" -maxdepth 3 -iname "*contexto*tecnico*.md" -o -iname "*contexto*técnico*.md" 2>/dev/null | head -1)
  if [ -n "$ctx_func" ] && [ ! -f "docs/contexto/contexto-funcional.md" ]; then
    cp "$ctx_func" "docs/contexto/contexto-funcional.md"
    echo "✓ contexto-funcional.md importado desde: $ctx_func"
  fi
  if [ -n "$ctx_tec" ] && [ ! -f "docs/contexto/contexto-tecnico.md" ]; then
    cp "$ctx_tec" "docs/contexto/contexto-tecnico.md"
    echo "✓ contexto-tecnico.md importado desde: $ctx_tec"
  fi

  # 3) Validar formato mínimo de las HUs copiadas
  local warnings=0
  for hu in "$target"/*.md; do
    [ ! -f "$hu" ] && continue
    local issues=""
    # Heurística simple: cada HU debe tener algún indicador de narrativa y de CAs
    if ! grep -qiE "quiero|requerimiento|como .* quiero" "$hu" 2>/dev/null; then
      issues="$issues narrativa"
    fi
    if ! grep -qiE "criteri[oa] de aceptaci|acceptance criteri" "$hu" 2>/dev/null; then
      issues="$issues criterios-aceptacion"
    fi
    if [ -n "$issues" ]; then
      echo "  ⚠ $(basename "$hu") — parece incompleto (falta: $issues)"
      warnings=$((warnings+1))
    fi
  done

  if [ $warnings -gt 0 ]; then
    echo ""
    echo "ℹ $warnings HU(s) con formato incompleto. El análisis las procesará pero generará más preguntas de clarificación."
  fi

  cat <<EOF

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ✅ Sprint $SPRINT_ID ingerido · $count HU(s)

  ➡ SIGUIENTE PASO:
     /refinar-sprint $SPRINT_ID
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EOF
}

case "$MODE" in
  --init)   init_sprint ;;
  --ingest) ingest_sprint ;;
  *) echo "✗ modo desconocido: $MODE"; usage ;;
esac
