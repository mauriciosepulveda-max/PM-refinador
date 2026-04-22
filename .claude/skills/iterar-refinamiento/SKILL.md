---
name: iterar-refinamiento
description: Re-analiza las HUs del sprint incorporando el feedback del equipo. Preserva las HUs ya aprobadas. Solo re-procesa las rechazadas o con comentarios.
argument-hint: "<sprint-id>"
---

# Skill: iterar-refinamiento

Re-analiza las HUs de un sprint con el feedback del equipo, preservando las ya aprobadas.

## Activación

```
/iterar-refinamiento Sprint-1
```

Equivalente a: `/refinar-sprint Sprint-1 --iteracion`

## Modo de orquestación

Elige según cantidad de HUs a re-analizar (threshold `ORCHESTRATOR_HU_THRESHOLD=5`):
- **N ≤ 5** → Modo A: delegar al sub-agente `orchestrator` con `mode=iteracion`
- **N > 5** → Modo B: orquestación directa desde el asistente (mismo flujo que `/refinar-sprint` Modo B)

**Snapshot guard obligatorio**: antes de re-escribir `data.json`, copiar el actual a `output/<sprint-id>/data.previous.json`. Post-merge, verificar que las HUs con `pm_aprobada: true` no cambiaron; si alguna lo hizo, revertir al snapshot y abortar.

## Proceso

### Fase -1 · Pre-flight
Ejecutar `Bash(command="node scripts/preflight-check.js")`. Si exit ≠ 0, abortar con `[RR·CKPT] PRE ✗`.

### Fase 0 · Lectura + clasificación
1. Leer `output/<sprint-id>/data.json`
2. Clasificar HUs:

| Categoría | Condición | Acción |
|-----------|-----------|--------|
| ✅ Aprobadas | `pm_aprobada: true` | **PRESERVAR** — inmutables (snapshot guard las protege) |
| 🔄 Con feedback | `pm_feedback` no vacío | RE-ANALIZAR con feedback como `[FEEDBACK_PREVIO_DEL_PM]` en el prompt |
| ❌ Rechazadas | `pm_aprobada: false` | RE-ANALIZAR desde cero |
| ⏸ Sin revisar | `pm_aprobada: null` | Mantener, advertir al PM |

`[RR·CKPT] Fase 0 ✓ · N a re-analizar · M preservadas · K sin revisar`

### Fase 1-4 · Re-análisis + consolidación
El asistente (Modo B) o el sub-agente `orchestrator` (Modo A):
- Lanza `hu-full-analyzer` sólo para las HUs pendientes, con el feedback del PM en el prompt.
- Re-consolida vía `scripts/consolidate-sprint.js` que ahora **preserva automáticamente** `historias[].specs[]` de la versión anterior (Ola 4).
- Valida con snapshot guard que ninguna HU aprobada cambió.

### Fase 5 · Reporte
```
══════════════════════════════════════════════════════════════
  🔄 ITERACIÓN · <sprint-id>
══════════════════════════════════════════════════════════════

  Re-analizadas: <N> HUs (rechazadas/con feedback)
  Preservadas:   <M> HUs aprobadas (snapshot guard OK)
  Pendientes:    <K> HUs sin revisar
  Specs:         <S> preservados de la iteración anterior (si aplica)

  Dashboard: output/<sprint-id>/index.html

  [RR·CKPT] Fase 5 · iteración lista
══════════════════════════════════════════════════════════════
```

Ejecutar `bash: node scripts/next-step.js <sprint-id>` para emitir el siguiente paso sugerido según el nuevo estado (más HUs aprobadas → generar informe; todas aprobadas → generar specs; etc.).

## Reglas

- **NUNCA tocar HUs aprobadas** — Snapshot guard lo enforza.
- **Feedback como contexto** — El `pm_feedback` se pasa como input al agente, no se descarta.
- **Preservar specs** — `consolidate-sprint.js` preserva `historias[].specs[]` de la versión previa automáticamente.
- **Historial** — Mover las métricas actuales a `data.json.iteracion_anterior` antes de re-escribir.
