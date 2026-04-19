#!/usr/bin/env bash
# preflight-check.sh — Requirement Refinator V3
#
# Chequeos que detectan fallos del framework antes de ejecutar /refinar-sprint.
# Diseñado para correr como:
#   - Primer paso de Fase -1 del orchestrator (defensa runtime)
#   - Pre-commit hook local (defensa desarrollador)
#   - Verificación manual: `bash scripts/preflight-check.sh`
#
# Exit codes: 0=OK, 1=fallos encontrados, 2=error de ejecución
#
# Los chequeos NO dependen de jq, ajv ni de dependencias externas.

ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
cd "$ROOT" || exit 2

errors=0
warnings=0

echo "[preflight] 1/4 · Merge markers en archivos críticos..."
# grep -l sobre files que existen; filtrar _legacy/ (referencia histórica de agentes reemplazados)
MARKER_FILES=$(grep -rln "^<<<<<<<\|^=======$\|^>>>>>>>" CLAUDE.md templates/core/ .claude/agents/ .claude/skills/ 2>/dev/null \
  | grep -v "/_legacy/" || true)
if [ -n "$MARKER_FILES" ]; then
  echo "  ✗ Merge markers sin resolver en:"
  echo "$MARKER_FILES" | sed 's/^/    /'
  errors=$((errors+1))
else
  echo "  ✓ sin merge markers"
fi

echo "[preflight] 2/4 · Skills del proyecto registrados..."
REQUIRED_SKILLS="refinar-sprint refinar-hu iterar-refinamiento generar-informe generar-specs"
missing_sk=0
for s in $REQUIRED_SKILLS; do
  if [ ! -f ".claude/skills/$s/SKILL.md" ]; then
    echo "  ✗ skill faltante: .claude/skills/$s/SKILL.md"
    missing_sk=$((missing_sk+1))
  fi
done
if [ $missing_sk -eq 0 ]; then
  echo "  ✓ 5/5 skills registradas en .claude/skills/<name>/"
else
  errors=$((errors+missing_sk))
  echo "  ℹ El runtime de Claude Code descubre skills en .claude/skills/<name>/ (no en subnamespaces)."
fi

echo "[preflight] 3/4 · Agentes del proyecto registrados..."
REQUIRED_AGENTS="orchestrator hu-full-analyzer report-builder client-report-generator spec-writer"
missing_ag=0
for a in $REQUIRED_AGENTS; do
  if [ ! -f ".claude/agents/$a.md" ]; then
    echo "  ✗ agente faltante: .claude/agents/$a.md"
    missing_ag=$((missing_ag+1))
  fi
done
if [ $missing_ag -eq 0 ]; then
  echo "  ✓ 5/5 agentes registrados en .claude/agents/"
else
  errors=$((errors+missing_ag))
fi

echo "[preflight] 4/4 · Template JS syntax..."
if [ -f templates/core/sprint-dashboard.html ]; then
  if command -v node >/dev/null 2>&1; then
    OUT=$(node -e "
      const fs=require('fs');
      const html=fs.readFileSync('templates/core/sprint-dashboard.html','utf8');
      const scripts=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join(';\n');
      try{ new Function(scripts); console.log('OK'); }
      catch(e){ console.error('FAIL:'+e.message); process.exit(1); }
    " 2>&1)
    if echo "$OUT" | grep -q '^OK'; then
      echo "  ✓ template JS válido — todos los <script> compilan"
    else
      echo "  ✗ template JS rompe: $OUT"
      errors=$((errors+1))
    fi
  else
    echo "  ⚠ node no instalado; saltando verificación JS"
    warnings=$((warnings+1))
  fi
else
  echo "  ✗ templates/core/sprint-dashboard.html ausente"
  errors=$((errors+1))
fi

# Resumen
echo ""
if [ $errors -gt 0 ]; then
  echo "[preflight] ✗ FALLÓ · $errors fallo(s), $warnings warning(s)"
  echo "           Corrige antes de commit o antes de ejecutar /refinar-sprint."
  exit 1
fi
if [ $warnings -gt 0 ]; then
  echo "[preflight] ✓ OK con $warnings warning(s) (revísalos cuando puedas)"
else
  echo "[preflight] ✓ TODOS los chequeos pasaron"
fi
exit 0
