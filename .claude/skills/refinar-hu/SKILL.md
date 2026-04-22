---
name: refinar-hu
description: Analiza una sola Historia de Usuario con maxima profundidad. Lanza 1 agente hu-full-analyzer, valida quality gates, genera data.json + index.html. 1 HU por sesion = maxima calidad.
argument-hint: "<sprint-id> <hu-filename>  (ej: Sprint-1 HU-1425-Finandina.md)"
---

# Skill: refinar-hu

Procesa **una sola Historia de Usuario** con maxima profundidad de analisis.

## Activacion

```
/refinar-hu Sprint-1 "HU 1425 - Parametrizacion Caratula Finandina.md"
/refinar-hu Sprint-2 HU-LOGIN.md
```

## Modo de orquestación

`/refinar-hu` siempre opera en **Modo A** (1 HU = 1 `hu-full-analyzer`, siempre por debajo del threshold `ORCHESTRATOR_HU_THRESHOLD=5`). No requiere orquestación distribuida.

Cada fase emite un `[RR·CKPT]` visible al PM.

## Proceso

### Fase -1 — Pre-flight

Ejecutar `Bash(command="node scripts/preflight-check.js")`. Si exit ≠ 0, abortar con `[RR·CKPT] PRE ✗` sin preguntar.

### Fase 0 — Validacion de Insumos (BLOQUEANTE)

1. Verificar que existe `docs/HUs/<sprint-id>/<hu-filename>`.
   - Si no existe: listar archivos disponibles en `docs/HUs/<sprint-id>/`.
2. Verificar que existe contexto en `docs/contexto/`.
3. Leer templates: `hu-calidad.schema.json` + `sprint-dashboard.html`.
4. Si existe `output/<sprint-id>/data.json`, leerlo (para no perder HUs ya procesadas).

### Fase 1 — Lectura Completa

Leer (UNA VEZ):
- `docs/HUs/<sprint-id>/<hu-filename>` — contenido integro
- `docs/contexto/contexto-funcional.md`
- `docs/contexto/contexto-tecnico.md`
- Lista de todas las HUs del sprint (glob de filenames)

### Fase 2 — Analisis (1 agente)

Lanzar 1 agente `hu-full-analyzer` con:
- Contenido completo de la HU
- Contexto condensado del proyecto
- Lista de HUs del sprint
- Sprint ID

### Fase 3 — Quality Gates

| Gate | Condicion | Accion si falla |
|------|-----------|-----------------|
| G1 | CAs >= CAs originales | Relanzar agente (máx 1 reintento) |
| G2 | Todas las tareas con DoD (≥ 15 chars) | Relanzar agente |
| G3 | Todas las tareas con PERT triple coherente (O ≤ P ≤ Pe) | Relanzar agente |
| G4 | calificacion_iso es número 0-5 | Recalcular determinísticamente |
| G_SCHEMA | JSON válido contra `templates/core/hu-calidad.schema.json` | Correr `node scripts/validate-hu-json.js <path>` vía `Bash` |

Si falla 2 veces → `quality_gate_failed: true`, continuar con la HU marcada.

### Fase 4 — Generacion de Output

1. Si existe `data.json` previo: agregar/actualizar la HU en el array `historias[]`.
2. Si no existe: crear `data.json` con solo esta HU.
3. Recalcular `metricas_sprint`.
4. Inyectar data.json en `templates/sprint-dashboard.html` → escribir `output/<sprint-id>/index.html`.

### Fase 5 — Reporte

```
══════════════════════════════════════════════════════════════
  HU PROCESADA: [hu-id] — [titulo]
══════════════════════════════════════════════════════════════

  Calificacion ISO: [N.N] / 5.0 — [Nivel]
  ISO 29148: [%]% | INVEST: [%]% | ISO 25010: [N]/[N]
  [N] escenarios Gherkin | [N] tareas ([N]h) | [N] riesgos

  Dashboard: output/<sprint-id>/index.html

  [RR·CKPT] Fase 5 · listo · HU acumulada en data.json
══════════════════════════════════════════════════════════════
```

Ejecutar `bash: node scripts/next-step.js <sprint-id>` para que el PM vea automáticamente el siguiente paso según el estado del sprint (más HUs por refinar, revisar HITL, iterar, etc.).

## Reglas

- **1 HU = 1 sesion** — Nunca mas de una HU por invocacion.
- **1 agente** — hu-full-analyzer hace todo el analisis.
- **Contexto UNA VEZ** — Leer y pasar como texto.
- **Template inmutable** — Solo inyectar datos.
- **Acumulativo** — Si ya hay HUs en data.json, preservarlas.
