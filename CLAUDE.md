# Requirement Refinator

Herramienta de refinamiento de historias de usuario para Product Managers.
Un sistema de agentes analiza las HUs del sprint, genera CAs en Gherkin, tareas técnicas estimadas, riesgos y dependencias, y produce un único dashboard HTML interactivo con HITL -- cumpliendo los estándares **ISO/IEC/IEEE 29148:2018** e **ISO/IEC 25010**.

> **Inspirado en:** JM Agentic Development Kit + ASD-main (ASDD orchestrator pattern)
> **Metodología:** SDD -- Spec-Driven Development con quality gates
> **Normativa aplicada:** ISO/IEC/IEEE 29148:2018 (Requisitos) · ISO/IEC 25010 (Calidad del producto)

---

## 🎯 PUNTO DE ENTRADA DEL ASISTENTE (REGLA CARDINAL)

Cuando el PM invoca `/refinar-sprint <id>`, `/refinar-hu`, `/iterar-refinamiento`, `/generar-informe` o `/generar-specs`, **la ÚNICA acción válida del asistente principal es invocar la skill correspondiente mediante el tool `Skill` en el mismo turno**.

Acción canónica para `/refinar-sprint Sprint-144`:

```
Skill(skill="refinar-sprint", args="Sprint-144")
```

Reglas estrictas:
- **NO** leer HUs manualmente desde el asistente principal.
- **NO** hacer preguntas al PM antes de invocar el skill (el skill pregunta lo mínimo necesario en su Fase 0).
- **NO** replicar el flujo de 5 fases en el asistente principal.
- **NO** invocar directamente `Agent(subagent_type="orchestrator", ...)` desde el asistente — eso es responsabilidad de la skill.
- **NO** cerrar el turno con solo texto anunciando la acción. El tool call del skill va en el **mismo mensaje**.

Si la skill no está registrada:
```
⚠ La skill `refinar-sprint` no aparece en el registry del runtime.
Verifica que existe: `ls .claude/skills/refinar-sprint/SKILL.md`
Si falta, revisa la última sección "Checklist post-refactor" de este CLAUDE.md.
```

**Ningún otro camino es válido.** Si el asistente nota que está por leer un archivo o hacer una pregunta ANTES de invocar el skill, debe detenerse e invocar el skill de una vez.

---

## 🛡 Regla de no-silencio (protección anti-tokenburn)

Si el asistente principal o cualquier agente del pipeline está a punto de cerrar un turno **sin** tool call visible y **sin** mensaje de texto suficiente, DEBE en su lugar emitir un mensaje con este formato:

```
[RR·PAUSE] sin progreso detectado · <causa_intuida> · <acción_sugerida>
```

Ejemplos:
- `[RR·PAUSE] sin progreso · esperando input del PM · ¿confirmamos Sprint-144?`
- `[RR·PAUSE] sin progreso · Skill(refinar-sprint) devolvió "Unknown skill" · ejecuta`ls .claude/skills/refinar-sprint/SKILL.md` para verificar registro`
- `[RR·PAUSE] sin progreso · orchestrator timeout · reintenta con /refinar-sprint <id>`

Reglas:
- Nunca cerrar un turno sin uno de: (a) tool call, (b) texto ≥ 40 chars con valor, o (c) `[RR·PAUSE]`.
- Aplica al asistente principal **Y** a cualquier sub-agente.
- El PM puede buscar `[RR·PAUSE]` en el transcript para detectar ciclos muertos.

---

## ⛓ Regla anti-anuncio sin ejecución (refuerzo del no-silencio)

Cuando el asistente está por anunciar una acción que **requiere un tool call** (`Skill`, `Agent`, `Bash`, `Read`, `Write`, `Edit`), el tool call DEBE ir en el **mismo mensaje del anuncio**.

Patrones prohibidos (todos terminan cerrando turno sin ejecución):

- ❌ "Lanzo el orchestrator ahora." — sin tool call.
- ❌ "Ejecutando las 11 HUs en paralelo." — sin tool call.
- ❌ "Arranco el script de consolidación." — sin tool call.

Patrones correctos:

- ✅ "Lanzando orchestrator." + bloque `<Agent subagent_type="orchestrator">` en la misma respuesta.
- ✅ Tool call directo, sin preámbulo.
- ✅ `[RR·PAUSE] <causa>` si por alguna razón la acción NO se puede ejecutar ahora.

Si el asistente detecta que ya publicó un anuncio sin tool call en un turno previo, en el siguiente turno DEBE:
1. Reconocerlo explícitamente ("El turno anterior anuncié sin ejecutar"), y
2. Emitir el tool call pendiente o un `[RR·PAUSE]` con la causa real.

**Esta regla se refuerza con** `scripts/preflight-check.sh` (chequeos automáticos) y los quality gates G3.1/G3.2 de `scripts/consolidate-sprint.js` (validación post-write del HTML).

---

## Principios Arquitectónicos

1. **Contexto se lee UNA VEZ** -- El orquestador lee todos los archivos y pasa el contenido como texto a los agentes. Los agentes nunca leen archivos.
2. **1 agente por HU** -- `hu-full-analyzer` ejecuta los 5 análisis (INVEST, ISO 29148, ISO 25010, Gherkin, Tareas, Riesgos, Dependencias) en una sola invocación. No 5 agentes separados.
3. **Agentes producen DATA, no presentación** -- Los agentes devuelven JSON puro conforme a `hu-calidad.schema.json`. Nunca HTML ni CSS.
4. **1 template HTML fijo** -- `templates/core/sprint-dashboard.html` es un archivo HTML estático con CSS y JS incluidos. Renderiza todo desde `window.__SPRINT_DATA__`.
5. **Sin artefactos intermedios** -- No hay `parciales/*.json`, no hay `<hu-id>.html` individuales, no hay `style.css` ni `script.js` separados. Solo `data.json` + `index.html`.
6. **Eficiencia de invocaciones** -- 1 invocación por HU + 0-1 reintentos por quality gates.
7. **Autocontención del orquestador** -- El orquestador recibe TODO lo que necesita en un único prompt y no vuelve a preguntar al asistente padre. Si algo falta, aborta con `[RR·CKPT] PRE ✗`.
8. **Checkpoints visibles** -- Cada fase emite un `[RR·CKPT]` en texto plano (fuera de tool call) para que el PM vea progreso.
9. **Orquestación adaptativa por tamaño del sprint** -- Ver sección siguiente.

---

## 🎚 Threshold: cuándo usar sub-agente orchestrator vs orquestación directa

**Constante:** `ORCHESTRATOR_HU_THRESHOLD = 5`

El framework soporta dos modos de orquestación. La skill `refinar-sprint` decide cuál usar según el número de HUs detectadas en Fase -1.

### Modo A — Sub-agente `orchestrator` (para sprints pequeños)

**Cuándo:** `N_HUs ≤ 5`.

**Flujo:** La skill delega todas las fases (0→5) al sub-agente `orchestrator` con un único prompt autocontenido. El sub-agente lee contexto, lanza los N analizadores en paralelo, consolida y genera el HTML.

**Ventaja:** Una sola invocación de tool desde el asistente principal; lógica encapsulada.
**Límite:** A partir de ~6 HUs el contexto del sub-agente se infla (5 archivos de inputs + N prompts de análisis + N JSONs de respuesta) y puede agotar su presupuesto de tokens.

### Modo B — Orquestación directa desde la skill (para sprints grandes)

**Cuándo:** `N_HUs > 5`.

**Flujo:**
1. La skill `refinar-sprint` corre Fase -1 y Fase 0 directamente (lee inputs, arma `contexto_condensado`).
2. Lanza los N `hu-full-analyzer` en paralelo desde el asistente principal (sin sub-agente intermedio).
3. Recoge los N JSONs en `output/<sprint>/tmp/<hu_id>.json`.
4. Ejecuta `bash` → `node scripts/consolidate-sprint.js <manifest>` para consolidar + inyectar HTML.
5. El sub-agente `orchestrator` solo se usa (opcional) para el reporte final con `mode=report-only`.

**Ventaja:** Cada `hu-full-analyzer` consume su propio presupuesto de tokens (aislado); el asistente principal solo bufferea los N JSONs. Escalable a 15-20 HUs.
**Límite:** Requiere que el asistente principal siga el contrato paso a paso sin perderse (ver regla "Punto de entrada del asistente" y "Regla anti-anuncio sin ejecución").

### Regla de decisión

```
Fase -1 (preflight OK) → N = count(glob(docs/HUs/<sprint>/*.md))
  if N == 0            → abortar con [RR·CKPT] PRE ✗ · no hay HUs
  if N ≤ 5             → Modo A (sub-agente orchestrator)
  if N > 5             → Modo B (orquestación directa + consolidate-sprint.js)
```

La skill `refinar-sprint` DEBE declarar el modo elegido en un checkpoint visible:

```
[RR·CKPT] Modo B · 11 HUs > threshold (5) · orquestando desde el asistente principal
```

---

## Cómo usar (Flujo del PM)

### Paso 1 -- Preparar los insumos
1. Clonar este proyecto desde Git al IDE (VS Code, Cursor, Antigravity, etc.)
2. Agregar las HUs del sprint en `docs/HUs/Sprint-X/` (archivos `.md`)
3. Agregar/actualizar el contexto del proyecto en `docs/contexto/`:
   - `contexto-funcional.md` -- Información de negocio, reglas, dominio
   - `contexto-tecnico.md` -- Stack, arquitectura, integraciones, entornos

### Paso 2 -- Ejecutar el análisis
```
/refinar-sprint Sprint-X
```
Claude analiza TODAS las HUs en paralelo (1 agente por HU) y genera un único `output/Sprint-X/index.html` con todo.

Para una HU individual:
```
/refinar-hu Sprint-X "nombre-archivo-hu.md"
```

### Paso 3 -- Revisar y dar feedback (HITL)
- Abrir `output/Sprint-X/index.html` en el navegador (SPA multi-vista)
- **Tab "Dashboard Sprint"**: KPIs, gauges ISO 29148 / INVEST / ISO 25010, tabla de HUs
- **Botón "Revisar HU"** por fila → entra al **Focus Mode** de la HU
- En Focus Mode hay paneles colapsables: Narrativa, CAs Gherkin, Tareas PERT editables, Riesgos, Dependencias, Preguntas HITL, Feedback
- **Editar PERT** (O/P/Pe) → recalcula E automáticamente
- **Responder preguntas HITL** en los textareas
- **Escribir feedback** libre en el panel de feedback
- **Barra sticky**: Guardar borrador / Rechazar / Aprobar HU
- Estado persistente en `localStorage` bajo `rr_hitl_<sprint-id>`
- **Tab "Avance del Sprint"**: EVM completo (habilita cuando el 100% de HUs está aprobado)
- **Tab "Informes"**: dropdown con export Markdown / informe ejecutivo / specs
- El export Markdown genera un `.md` estructurado con el feedback, consumible por `--iteracion`

### Paso 4 -- Iterar con feedback
```
/refinar-sprint Sprint-X --iteracion
```
Re-analiza SOLO las HUs rechazadas o con feedback. Las aprobadas se preservan intactas (con snapshot guard).

### Paso 5 -- Generar informe al cliente
```
/generar-informe Sprint-X --formato ejecutivo
```

### Paso 6 -- Generar specs SDD
```
/generar-specs Sprint-X
```

---

## Comandos disponibles

| Comando | Descripción |
|---------|-------------|
| `/refinar-sprint <sprint-id>` | Analiza todas las HUs en paralelo → 1 HTML |
| `/refinar-sprint <sprint-id> --iteracion` | Re-analiza HUs rechazadas/con feedback |
| `/refinar-sprint <sprint-id> --consolidar` | Solo regenera index.html con data.json existente |
| `/refinar-sprint <sprint-id> --dry-run` | Ejecuta pre-flight + 1 HU fixture sin escribir outputs |
| `/refinar-hu <sprint-id> <hu-file>` | Analiza 1 HU, acumula en data.json |
| `/iterar-refinamiento <sprint-id>` | Atajo para modo iteración |
| `/generar-informe <sprint-id>` | Informe ejecutivo (enriquece data.json) |
| `/generar-specs <sprint-id>` | Specs SDD con HITL iterativo |

---

## Flujo del orquestador

```
[FASE -1 -- PRE-FLIGHT (G0)]
  Verificar en paralelo:
    - docs/HUs/<sprint-id>/*.md           ≥ 1 archivo
    - docs/contexto/contexto-funcional.md existe y no vacío
    - docs/contexto/contexto-tecnico.md   existe y no vacío
    - templates/core/hu-calidad.schema.json existe y JSON válido
    - templates/core/sprint-dashboard.html contiene "/*__SPRINT_DATA__*/"
  Si falta algo → [RR·CKPT] PRE ✗ · <motivo> · abortar sin preguntar

[FASE 0 -- CONFIGURACIÓN MÍNIMA (máx 1 pregunta al PM)]
  Pedir fechas + equipo en un solo mensaje con defaults razonables.
  Calcular días hábiles, capacidad, BAC sin preguntar al PM.
  [RR·CKPT] Fase 0 ✓ · <sprint-id> · <N> HUs · sprint_config OK

[FASE 1 -- ANÁLISIS EN PARALELO (1 agente por HU)]
  Para CADA HU simultáneamente:
  └── @hu-full-analyzer → JSON con INVEST + ISO 29148 + ISO 25010
                          + Gherkin + Tareas PERT + Riesgos + Dependencias
  [RR·CKPT] Fase 1 → lanzando <N> hu-full-analyzer
  [RR·CKPT] Fase 1 ✓ · <N> JSONs recibidos · <M> con quality_gate_failed

[FASE 2 -- QUALITY GATES (orquestador valida)]
  G1: criteriosAceptacion.length >= criteriosOriginales.length
  G2: todas las tareas tienen DoD no vacío (≥ 15 chars)
  G3: todas las tareas tienen PERT triple coherente (O ≤ P ≤ Pe)
  G4: calificacion_iso es número 0-5 y se recalcula determinísticamente
  G_SCHEMA: JSON válido contra templates/core/hu-calidad.schema.json (Ajv)
  [RR·CKPT] Fase 2 ✓ · G1-G4 validados · <K> reintentos

[FASE 3 -- CONSOLIDACIÓN (orquestador construye)]
  Reunir JSONs → calcular metricas_sprint → escribir data.json
  [RR·CKPT] Fase 3 ✓ · data.json consolidado (<X> KB)

[FASE 4 -- GENERACIÓN HTML (inyección en template)]
  Leer templates/core/sprint-dashboard.html
  Reemplazar /*__SPRINT_DATA__*/null con JSON.stringify(data)
  Escribir output/Sprint-X/index.html
  [RR·CKPT] Fase 4 ✓ · index.html generado (<Y> KB) → output/<sprint-id>/index.html

[FASE 5 -- REPORTE AL PM]
  Resumen: HUs, calificación promedio, horas, riesgos, preguntas.
  [RR·CKPT] Fase 5 · listo
```

---

## Agentes

| Agente | Rol | Normativa |
|--------|-----|-----------|
| `orchestrator` | Coordinador -- lee contexto, lanza agentes en paralelo, consolida, inyecta en template | -- |
| `hu-full-analyzer` | Análisis completo de 1 HU: INVEST + ISO 29148 + ISO 25010 + Gherkin + Tareas PERT + Riesgos + Dependencias | ISO 29148 + ISO 25010 + INVEST |
| `report-builder` | Inyecta data.json en template HTML. NO genera CSS ni JS. | -- |
| `client-report-generator` | Informe ejecutivo al cliente | ISO 25030 |
| `spec-writer` | Specs SDD con Mermaid + HITL | ISO 29148 |

> **Nota sobre enrichers (hu-security-enricher, hu-integration-enricher, hu-data-enricher, hu-split-advisor):** diseñados como segunda pasada selectiva pero **no implementados en esta versión**. La lógica base está absorbida por `hu-full-analyzer`. Si se requiere enriquecimiento posterior, debe crearse el archivo del enricher en `.claude/agents/` y añadir la Fase 2.5 correspondiente en `orchestrator.md` antes de referenciarlos aquí.

Agentes legacy preservados en `.claude/agents/_legacy/` como referencia — su lógica fue absorbida por `hu-full-analyzer`: `hu-analyzer`, `gherkin-writer`, `task-estimator`, `risk-analyst`, `dependency-mapper`.

---

## Estructura de archivos

```
Requirement Refinator/
├── CLAUDE.md                              ← Este archivo (workflow master)
├── README.md
├── .gitignore
├── .claude/
│   ├── agents/                            ← registrados directamente (runtime los descubre aquí)
│   │   ├── orchestrator.md
│   │   ├── hu-full-analyzer.md
│   │   ├── report-builder.md
│   │   ├── client-report-generator.md
│   │   ├── spec-writer.md
│   │   ├── _legacy/                       ← Reemplazados, no usados en flujo principal
│   │   │   └── hu-analyzer.md, gherkin-writer.md, task-estimator.md, risk-analyst.md, dependency-mapper.md
│   │   └── _kit-base/                     ← 101 agentes del JM Kit (READ-ONLY, referencia)
│   ├── rules/
│   │   └── _kit-base/                     ← R-001 a R-008 + GEMINI.md (READ-ONLY)
│   ├── skills/                            ← registradas directamente (runtime las descubre aquí)
│   │   ├── refinar-sprint/SKILL.md
│   │   ├── refinar-hu/SKILL.md
│   │   ├── iterar-refinamiento/SKILL.md
│   │   ├── generar-informe/SKILL.md
│   │   ├── generar-specs/SKILL.md
│   │   └── _kit-base/                     ← 110 skills genéricos (READ-ONLY)
│   ├── workflows/
│   │   └── _kit-base/                     ← 101 workflows genéricos (READ-ONLY)
│   └── settings.json                      ← hook Stop de watchdog (si runtime lo soporta)
├── docs/
│   ├── HUs/
│   │   ├── Sprint-X/                      ← HUs del Sprint (el PM crea esta carpeta)
│   │   └── _fixtures/Sprint-dryrun/       ← HU dummy para --dry-run
│   ├── contexto/
│   │   ├── contexto-funcional.template.md
│   │   └── contexto-tecnico.template.md
│   └── referencia/
├── output/
│   └── Sprint-X/
│       ├── index.html
│       ├── data.json
│       └── data.previous.json             ← snapshot pre-iteración (modo --iteracion)
├── scripts/
│   ├── validate-hu-json.js                ← validador Ajv del schema
│   ├── approve_specs.js
│   ├── generador_informes.js
│   ├── generador_specs.js
│   └── inyectar_feedback.js
└── templates/
    ├── core/                              ← CRÍTICOS — el orquestador los lee
    │   ├── sprint-dashboard.html
    │   └── hu-calidad.schema.json
    └── auxiliary/
```

---

## Reglas del sistema

### Reglas v1.0 -- Base

1. **Sin contexto, sin análisis** -- Si `docs/contexto/` está vacío, pedir al PM que lo complete.
2. **Sin HUs, sin análisis** -- Verificar que existan archivos `.md` en `docs/HUs/Sprint-X/`.
3. **No inventar información técnica** -- Si no está en el contexto, marcarlo como "No documentado -- requiere confirmación".
4. **Gherkin en español de negocio** -- Sin rutas de API ni IDs técnicos.
5. **Estimaciones justificadas** -- Cada tarea incluye justificación de tiempo.
6. **Preguntas, no suposiciones** -- Cuando falte info crítica, generar preguntas de clarificación.
7. **1 agente por HU, todos en paralelo** -- hu-full-analyzer hace todo. No 5 agentes separados.
8. **Output por sprint** -- Cada sprint en `output/Sprint-X/`. No sobreescribir sprints anteriores.
9. **HUs aprobadas son inmutables** -- En modo iteración, no tocar las aprobadas (snapshot guard).
10. **Sin spec APROBADO → sin implementación** -- Regla cardinal del SDD.

### Reglas de Cobertura y Calidad

11. **Refinamiento AÑADE, nunca RESTA** -- data.json contiene TODA la información del fuente + el análisis.
12. **Validación de cobertura obligatoria** -- Comparar sección por sección el original vs refinado.
13. **Criterios originales en campo separado** -- `criteriosOriginales[]` y `criteriosAceptacion[]` coexisten.
14. **Tareas con DoD verificable** -- `[VERBO] [ARTEFACTO] en [UBICACIÓN] -- DoD: [criterio concreto]`
15. **PERT triple coherente** -- O ≤ P ≤ Pe → E = (O + 4P + Pe) / 6
16. **Perfiles mínimos: DEV y QA** -- Solo separar FE/DB si hay rol dedicado en el equipo.
17. **Template HTML inmutable** -- `sprint-dashboard.html` contiene TODO el CSS y JS. Nunca generar CSS/JS desde agentes.
18. **Output limpio** -- Solo `index.html` + `data.json` en output/Sprint-X/ (+ `data.previous.json` en modo iteración). Sin parciales, sin individuales.
19. **Templates son contratos** -- Leer templates/ antes de generar output.

### Reglas de Estándares de Calidad

20. **ISO 29148 como contrato** -- 9 atributos: Necesario, Apropiado, Inequívoco, Completo, Singular, Factible, Verificable, Correcto, Conforme.
21. **Calificación ISO 0-5 obligatoria** -- Fórmula: `(iso29148_norm * 0.50 + invest_norm * 0.30 + iso25010_norm * 0.20) * 5`
22. **CAs ISO-compliant** -- Verificable, Singular, Inequívoco. Si no cumple → BLOQUEO.
23. **Cobertura ISO 25010 en NFRs** -- Al menos 1 tarea de verificación por cada característica aplicable.
24. **Agentes producen DATA** -- JSON puro. Nunca HTML, CSS ni JS.
25. **1 template renderiza todo** -- sprint-dashboard.html lee window.__SPRINT_DATA__ y renderiza.
26. **Contexto UNA VEZ** -- El orquestador lee archivos; los agentes reciben texto plano en el prompt.

### Reglas de Entregables (NO NEGOCIABLES)

27. **UN SOLO HTML por sprint** -- `output/Sprint-X/index.html` es el único entregable visual.
28. **Tabs del dashboard (fijas)**:
    1. **Dashboard Sprint** -- KPIs, gauges ISO, tabla HUs, HITL (Focus Mode via "Revisar HU").
    2. **Avance del Sprint** -- EVM completo con PV/EV/AC iniciados en 0.
    3. **Informe Cliente** -- Renderizado desde `data.json.informe_cliente`.
    4. **Informes** (dropdown) -- Exportar/importar Markdown, imprimir PDF.
29. **`generar-informe` NO genera archivos externos** -- Enriquece `data.json` con `informe_cliente` y re-inyecta en el template.
30. **Tooltips obligatorios** -- `.ux-tip` con `data-tip`.
31. **Guías visibles por vista** -- Callout de "Qué hacer aquí" colapsable.
32. **Alerta de pérdida de estado** -- `beforeunload` con aviso si hay cambios sin exportar.
33. **Banner sticky de respaldo** -- CTA "Descargar respaldo (Markdown)" cuando hay cambios locales.
34. **Round-trip completo** -- Markdown exportado contiene `<!-- RR-STATE-BEGIN -->...JSON...<!-- RR-STATE-END -->`.
35. **Chart offline-first** -- Chart.js por CDN con fallback SVG inline. Gantt siempre SVG.
36. **EVM parte en cero** -- PV, EV, AC siempre inician en 0. Prohibido autocompletar.

### Reglas de Observabilidad (v2.0)

37. **Checkpoints por fase** -- Cada fase del orquestador emite `[RR·CKPT] Fase N <estado> · <detalle>` en texto plano.
38. **Heartbeat en fases largas** -- Si una fase tarda > 60s, emitir `[RR·CKPT] Fase N · heartbeat · esperando <cosa concreta>`.
39. **Regla de no-silencio** -- Ver sección "🛡 Regla de no-silencio" al inicio de este archivo.
40. **Snapshot guard --iteración** -- Antes de reescribir `data.json`, copiar actual a `data.previous.json`. Post-merge, verificar que HUs `pm_aprobada: true` no cambiaron.

---

## Formato esperado de las HUs de entrada

Las HUs deben estar en Markdown con al menos:
- Quién solicita (perfil/rol)
- Qué quiere (intención/funcionalidad)
- Para qué (propósito/beneficio de negocio)
- Detalle del desarrollo solicitado
- Criterios de aceptación (pueden ser básicos, los agentes los expandirán)

Ver `docs/HUs/README.md` para la guía completa.

---

## Sistema de Diseño

El template HTML usa el sistema de diseño definido en `docs/ui-design-guidelines.md`:
- **Primario:** `#FF7E08` (naranja)
- **Fondo oscuro:** `#000000` (negro -- header)
- **Fondo base:** `#FAF8F6` (gris cálido)
- **Fuentes:** Clash Grotesk (headings) + Inter (body) + JetBrains Mono (código)
- **Semánticos (RAG):** Verde `#16A34A` / Ámbar `#D97706` / Rojo `#DC2626`

Todo esto está definido UNA SOLA VEZ en `templates/core/sprint-dashboard.html`. Los agentes nunca generan CSS.

---

## Checklist post-refactor (verificación rápida)

Si algo no funciona tras mover archivos, corre **`bash scripts/preflight-check.sh`**. Ejecuta 4 chequeos automáticos:

1. No hay merge markers sin resolver en `CLAUDE.md`, `templates/core/`, `.claude/agents/`, `.claude/skills/`.
2. Las 5 skills del proyecto están registradas en `.claude/skills/<name>/SKILL.md`.
3. Los 5 agentes del proyecto están registrados en `.claude/agents/<name>.md`.
4. El JS del template `sprint-dashboard.html` compila (no hay conflict markers embebidos en `<script>`, `<<`, etc.).

Exit codes: `0` = OK · `1` = fallos · `2` = error de ejecución.

Se recomienda correr también:
- Antes de cada commit (se puede enganchar a un pre-commit hook local con `git config core.hooksPath .claude/hooks`).
- Como primer paso de Fase -1 de `/refinar-sprint` (el orchestrator lo invoca).

Checks manuales adicionales si el preflight pasa pero algo sigue raro:
- Reiniciar sesión Claude Code; el system-reminder debe listar `refinar-sprint`, `refinar-hu`, etc.
- `Skill(skill="refinar-sprint")` no debe retornar "Unknown skill".
- `grep "_project/" .claude/skills/ .claude/agents/ CLAUDE.md` — sólo resultados históricos o en `_kit-base/`, no en archivos activos.
