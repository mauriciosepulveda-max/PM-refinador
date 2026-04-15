---
name: refinar-sprint
description: Orquesta el análisis completo de todas las HUs de un sprint. Pre-flight + 1 pregunta mínima + delega todo al agente orchestrator con prompt autocontenido. Output = un solo index.html + data.json. Soporta --iteracion, --consolidar, --dry-run.
argument-hint: "<sprint-id>  (ej: Sprint-144)  [--iteracion] [--consolidar] [--dry-run]"
---

# Skill: refinar-sprint

Orquestador del Requirement Refinator. Analiza TODAS las HUs de un sprint y produce **un solo archivo HTML** con dashboard, detalle por HU, Gherkin, tareas, riesgos, dependencias, preguntas y HITL.

## Activación

```
/refinar-sprint Sprint-144                # Analiza todas las HUs
/refinar-sprint Sprint-144 --iteracion    # Re-analiza HUs rechazadas/con feedback
/refinar-sprint Sprint-144 --consolidar   # Solo regenera index.html con data.json existente
/refinar-sprint Sprint-144 --dry-run      # Pre-flight + 1 HU fixture, sin escribir outputs
```

## Arquitectura (Principios)

- **Contexto se lee UNA VEZ** por el orquestador, se pasa como texto a los agentes.
- **1 agente por HU** (`hu-full-analyzer`) hace los análisis en una sola invocación.
- **Agentes producen DATA** (JSON), nunca presentación (HTML/CSS).
- **1 template HTML fijo** (`templates/core/sprint-dashboard.html`) renderiza todo vía JS.
- **Sin artefactos intermedios** — no hay `parciales/`, no hay HTMLs individuales.
- **Output final**: `output/<sprint-id>/index.html` + `output/<sprint-id>/data.json`

---

## Proceso

### Fase -1 — Pre-flight (G0, NO interactivo, ANTES de cualquier pregunta)

**Paso 1 (framework sano):** ejecutar `bash scripts/preflight-check.sh`. Si exit ≠ 0, abortar con `[RR·CKPT] PRE ✗ · preflight fallido · ver salida` sin preguntar al PM.

**Paso 2 (insumos del sprint):** verificar en paralelo (`Read` / `Glob`):

| Recurso | Condición |
|---|---|
| `docs/HUs/<sprint-id>/*.md` | ≥ 1 match |
| `docs/contexto/contexto-funcional.md` | existe y no vacío |
| `docs/contexto/contexto-tecnico.md` | existe y no vacío |
| `templates/core/hu-calidad.schema.json` | existe, JSON válido |
| `templates/core/sprint-dashboard.html` | existe y contiene `/*__SPRINT_DATA__*/null` |

Tabla de errores (abortar, NO seguir, NO preguntar):

| Falta | Mensaje al PM |
|---|---|
| 0 HUs en el sprint | `[RR·CKPT] PRE ✗ · No hay HUs en docs/HUs/<sprint-id>/. Sprints disponibles: <lista>` |
| contexto-funcional.md ausente | `[RR·CKPT] PRE ✗ · Copia docs/contexto/contexto-funcional.template.md a contexto-funcional.md y rellénalo.` |
| contexto-tecnico.md ausente | idem |
| hu-calidad.schema.json faltante | `[RR·CKPT] PRE ✗ · Template core roto. Reinstala templates/core/hu-calidad.schema.json desde git.` |
| sprint-dashboard.html sin placeholder | `[RR·CKPT] PRE ✗ · Template HTML corrupto. Restaura templates/core/sprint-dashboard.html desde git.` |

Si TODO pasa:
```
[RR·CKPT] PRE ✓ · <N> HUs · contexto OK · templates OK · continuando a Fase 0
```

### Fase 0 — Configuración Mínima (MÁX 1 PREGUNTA, defaults agresivos)

Pedir al PM en UN SOLO mensaje compacto SOLO los datos no-derivables:

```
Para configurar Gantt y capacidad necesito dos cosas:

 1. Rango del sprint: <fecha_inicio> → <fecha_fin>   (formato YYYY-MM-DD)
 2. Equipo: "Ana G-DEV, Luis T-DEV, María P-QA, ..."
    (roles: DEV, FE, QA, DB, DEVOPS, UX)

Opcional (si no lo dices, uso defaults):
 - Horas efectivas/día: default 8h
 - Ausencias programadas: default 0 (formato: "Ana 3d, Luis 1d")

Responde "usa defaults" si prefieres que asuma 8h/persona y 0 ausencias.
```

**Reglas de derivación automática (el orquestador no pregunta):**
- `dias_habiles` = count(L-V entre fecha_inicio y fecha_fin). No preguntar.
- `horas_dia_persona` default = 8.
- `dias_ausencia` por persona default = 0 si el PM dijo "usa defaults".
- `horas_totales` por rol y `bac_horas` se calculan sin preguntar.

**No-bloqueo:** si el PM ya pasó fechas + equipo en el mismo mensaje del comando (ej. `/refinar-sprint Sprint-144 2026-04-15 2026-05-05 "Ana-DEV,..."`), NO interrumpir: armar `sprint_config` con defaults y continuar.

**Única excepción que bloquea:** faltan AMBAS fechas.

Construir `sprint_config`:
```json
{
  "fecha_inicio": "YYYY-MM-DD",
  "fecha_fin":    "YYYY-MM-DD",
  "dias_habiles": N,
  "horas_dia_persona": 8,
  "equipo": [
    {"nombre": "Ana García", "rol": "DEV", "dias_ausencia": 0}
  ],
  "capacidad_por_rol": {
    "DEV": {"personas": 2, "dias_disponibles": [N, N], "horas_totales": X},
    "QA":  {"personas": 1, "dias_disponibles": [N], "horas_totales": Y}
  },
  "bac_horas": N
}
```

Mostrar al PM el `sprint_config` resultante en un bloque compacto antes de Fase 1:

```
[RR·CKPT] Fase 0 ✓ · Sprint-144 · 2026-04-15 → 2026-05-05 · 15 días hábiles
           Equipo: 4 DEV, 2 QA · 8h/día · 0.5 días ausencia QA2
           Capacidad (BAC): 716h
           → Lanzando hu-full-analyzer en paralelo sobre 11 HUs...
```

---

### Decisión de modo (threshold ORCHESTRATOR_HU_THRESHOLD = 5)

Tras Fase 0, contar `N = count(docs/HUs/<sprint-id>/*.md)` y elegir:

```
if N ≤ 5 → Modo A — sub-agente orchestrator (bloque "Fases 1-5 Modo A")
if N > 5 → Modo B — orquestación directa (bloque "Fases 1-5 Modo B")
```

Emitir `[RR·CKPT] Modo <A|B> · <N> HUs · <motivo>` antes de continuar.

### Fases 1-5 Modo A — DELEGAR al orquestador (sprints ≤ 5 HUs)

Emitir UN SOLO `Agent(subagent_type="orchestrator", prompt=...)` con el contrato siguiente. El orchestrator NO debe hacer ping-pong al asistente; recibe TODO aquí.

**Prompt mínimo autocontenido:**

```
=== REFINAR-SPRINT TASK ===
mode: full                       # "full" | "iteracion" | "consolidar" | "dry-run"
sprint_id: Sprint-144
worktree_root: <absolute path al worktree>

sprint_config:
  fecha_inicio: 2026-04-15
  fecha_fin:    2026-05-05
  dias_habiles: 15
  horas_dia_persona: 8
  equipo:
    - {nombre: "Dev1", rol: "DEV", dias_ausencia: 0}
    - {nombre: "Dev2", rol: "DEV", dias_ausencia: 0}
    - {nombre: "Dev3", rol: "DEV", dias_ausencia: 0}
    - {nombre: "Dev4", rol: "DEV", dias_ausencia: 0}
    - {nombre: "QA1",  rol: "QA",  dias_ausencia: 0}
    - {nombre: "QA2",  rol: "QA",  dias_ausencia: 0.5}

inputs_paths:
  hus_glob:      docs/HUs/Sprint-144/*.md
  ctx_funcional: docs/contexto/contexto-funcional.md
  ctx_tecnico:   docs/contexto/contexto-tecnico.md
  schema:        templates/core/hu-calidad.schema.json
  template_html: templates/core/sprint-dashboard.html

outputs_paths:
  data_json:  output/Sprint-144/data.json
  index_html: output/Sprint-144/index.html
  snapshot:   output/Sprint-144/data.previous.json   # solo en mode=iteracion

rules:
  - Emitir checkpoints [RR·CKPT] por fase (texto plano fuera de tool call).
  - Agotar Fases 1→5 sin volver a preguntar al asistente principal.
  - Si G1-G4 fallan 2 veces, marcar quality_gate_failed y continuar.
  - No crear HTMLs individuales por HU.
  - No generar CSS ni JS.
  - Heartbeat cada ~60s si fase se alarga.
  - En mode=iteracion, antes de reescribir data.json, copiar actual a snapshot path.
  - En mode=dry-run, NO escribir data.json ni index.html. Solo correr pre-flight y 1 HU fixture.

return:
  path_data_json: "output/Sprint-144/data.json"
  path_index_html: "output/Sprint-144/index.html"
  metrics: {hus_analizadas, calificacion_promedio, horas_totales, riesgos_criticos, preguntas}
=== END TASK ===
```

Regla: el orchestrator recibe TODO de una vez. No puede pedir al padre que relea archivos. Si algún path no existe, aborta con `[RR·CKPT] PRE ✗ · <motivo>` y retorna error — NO con pregunta.

---

### Fases 1-5 Modo B — Orquestación directa (sprints > 5 HUs)

El asistente principal ejecuta las fases paso a paso (evita token-limit del sub-agente monolítico con muchas HUs). Contrato:

**Fase 1 — Análisis en paralelo (asistente principal):**

1. Antes de lanzar, consultar el checkpoint: `bash scripts/checkpoint.js list-completed <sprint-id>` → devuelve IDs de HUs ya analizadas (JSONs existentes en `tmp/`).
2. Lanzar en paralelo (un mensaje con N `Agent(subagent_type="hu-full-analyzer", prompt=...)`, donde N = HUs pendientes):
   ```
   [SPRINT]: <sprint-id>
   [HU_FILENAME]: <nombre archivo>
   [CONTEXTO_CONDENSADO]: <texto armado en Fase 0>
   [LISTA_HUs_SPRINT]: <lista>
   [CONTENIDO_COMPLETO_HU]: <contenido íntegro>
   Responde SOLO con el JSON conforme a hu-calidad.schema.json.
   ```
3. Guardar cada JSON de respuesta en `output/<sprint-id>/tmp/<hu_id>.json` (usar Write).
4. Tras recibir los N: `[RR·CKPT] Fase 1 ✓ · N JSONs recibidos`.
5. `bash scripts/checkpoint.js save <sprint-id> analysis_complete` para persistir progreso.

**Fase 2-4 — Consolidación + HTML (vía script):**

```
bash: node scripts/consolidate-sprint.js output/<sprint-id>/tmp/manifest.json
```

El script:
- Lee todos los JSONs de `tmp/`
- Aplica quality gates (G1-G4 + G_SCHEMA)
- Calcula `metricas_sprint`
- Escribe `data.json` + `index.html` con validación post-write (G3.1/G3.2)
- Limpia `.checkpoint.json` al terminar OK

**Fase 5 — Reporte final:**

Ejecutar `bash: node scripts/next-step.js <sprint-id>` para emitir el siguiente paso sugerido al PM.

**Protocolo de resumabilidad:**

Si el asistente detecta `output/<sprint-id>/.checkpoint.json` al iniciar Fase 1, debe:
1. Leer el checkpoint.
2. Saltar HUs que ya estén en `tmp/`.
3. Emitir: `[RR·CKPT] Modo B · resumiendo desde checkpoint · <X>/<N> HUs ya analizadas`.

---

## Modo `--iteracion`

1. Leer `output/<sprint-id>/data.json` existente.
2. Copiar a `output/<sprint-id>/data.previous.json` (snapshot guard).
3. Mover métricas actuales a `iteracion_anterior` en data.json.
4. Identificar HUs con `pm_aprobada: false` o `pm_feedback` no vacío.
5. Re-lanzar orquestador con `mode: iteracion` y prompt que incluya `hus_a_reanalizar: [...]` + feedback por HU.
6. El orquestador debe preservar HUs `pm_aprobada: true` byte-a-byte.
7. Post-merge: comparar contra snapshot. Si alguna HU aprobada cambió → ABORTAR con diff visible.
8. Regenerar `data.json` e `index.html`.

## Modo `--consolidar`

1. Leer `output/<sprint-id>/data.json` existente (sin re-analizar).
2. Re-lanzar orquestador con `mode: consolidar`.
3. Solo re-inyecta en template y reescribe `index.html`.

## Modo `--dry-run`

1. Pre-flight G0 completo.
2. Lanzar hu-full-analyzer para UNA sola HU (fixture `docs/HUs/_fixtures/Sprint-dryrun/HU-dryrun.md` si existe, sino la primera alfabética del sprint).
3. Correr G1-G4 + validación Ajv vía `node scripts/validate-hu-json.js`.
4. NO escribir `data.json` ni `index.html`. Emitir reporte:

```
[RR·CKPT] DRY-RUN ✓ · HU-dryrun analizada en <T>s · tokens ~<N>
           Estimado para <N> HUs reales: <T·N>s · ~<N·T> tokens
           Gates: G1✓ G2✓ G3✓ G4✓ G_SCHEMA✓
           → Ejecutar `/refinar-sprint Sprint-X` para ejecución real.
```

---

## Reglas

- **Sin HUs → sin análisis** — Fase -1 lo enforca.
- **1 agente por HU** — hu-full-analyzer hace todo. No 5 agentes separados.
- **Contexto UNA VEZ** — El orquestador lee; los agentes reciben texto plano.
- **Template inmutable** — No modificar `sprint-dashboard.html`, solo inyectar datos.
- **Sin intermedios** — No crear `parciales/`, no crear `<hu-id>.html`.
- **HUs aprobadas inmutables** — Snapshot guard en modo `--iteracion`.
- **Output por sprint** — Cada sprint en `output/Sprint-X/`. No sobreescribir otros sprints.
- **Checkpoints obligatorios** — `[RR·CKPT]` por fase, fuera de tool calls.
- **No-silencio** — ningún turno sin tool call, texto o `[RR·PAUSE]`.
