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

## Proceso

1. Leer `output/<sprint-id>/data.json`
2. Clasificar HUs:

| Categoría | Condición | Acción |
|-----------|-----------|--------|
| ✅ Aprobadas | `pm_aprobada: true` | **PRESERVAR** — no tocar |
| 🔄 Con feedback | `pm_feedback` no vacío | RE-ANALIZAR con feedback como input adicional |
| ❌ Rechazadas | `pm_aprobada: false` | RE-ANALIZAR desde cero |
| ⏸ Sin revisar | `pm_aprobada: null` | Mantener, pero advertir al PM |

3. Para cada HU a re-analizar:
   - Pasar a los agentes el feedback del PM como contexto adicional
   - Pasar las preguntas del PM respondidas (si las hubo)
   - Los agentes deben mejorar su análisis anterior

4. Actualizar `data.json` y regenerar `index.html`
5. Reportar:

```
🔄 Iteración completada para <sprint-id>

Re-analizadas: <N> HUs
Preservadas: <N> HUs aprobadas
Pendientes: <N> HUs sin revisar

📂 Dashboard actualizado: output/<sprint-id>/index.html
```

## Reglas

- **NUNCA tocar HUs aprobadas** — Son inmutables hasta que el PM cambie su estado.
- **Feedback como contexto** — El PM feedback se pasa como input al agente, no se descarta.
- **Historial** — Mantener una nota en `data.json` de que es una iteración (N de iteración).
