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

## 🎚 Threshold: Modo A vs Modo B

**Constante:** `ORCHESTRATOR_HU_THRESHOLD = 5`. La skill `refinar-sprint` decide el modo según el número de HUs detectadas en Fase -1.

| Modo | Cuándo | Quién orquesta | Por qué |
|---|---|---|---|
| **A** | `N ≤ 5` | Sub-agente `orchestrator` (una sola invocación desde la skill) | Lógica encapsulada, menos overhead del asistente principal |
| **B** | `N > 5` | Asistente principal (lanza N `hu-full-analyzer` en paralelo + `scripts/consolidate-sprint.js`) | Cada analyzer usa su presupuesto de tokens aislado; escala a 15-20 HUs sin reventar el contexto del sub-agente |

**Regla de decisión** (la skill DEBE emitir checkpoint visible con el modo elegido):

```
N = count(glob(docs/HUs/<sprint>/*.md))
if N == 0 → abortar con [RR·CKPT] PRE ✗ · no hay HUs
if N ≤ 5  → Modo A
if N > 5  → Modo B
```

Ejemplo de checkpoint esperado: `[RR·CKPT] Modo B · 11 HUs > threshold (5) · orquestando desde el asistente principal`.

En Modo B el sub-agente `orchestrator` solo se reserva (opcional) para el reporte final con `mode=report-only`.

---

## Flujo del PM y comandos

El flujo end-to-end para el PM (setup → `/refinar-sprint` → HITL → `/iterar` → `/generar-informe` → `/generar-specs`) y la tabla completa de comandos/scripts viven en [README.md](README.md) (secciones "Flujo completo del PM" y "Comandos disponibles"). **Este archivo no los duplica** — si cambia el flujo, se actualiza allí.

Para el asistente solo importan estas invocaciones reconocidas:

| Slash command | Skill a invocar |
|---|---|
| `/refinar-sprint <id> [--iteracion \| --consolidar \| --dry-run]` | `refinar-sprint` |
| `/refinar-hu <id> <hu-file>` | `refinar-hu` |
| `/iterar-refinamiento <id>` | `iterar-refinamiento` |
| `/generar-informe <id>` | `generar-informe` |
| `/generar-specs <id> [--hu <US> \| --iterar <US>]` | `generar-specs` |

Semántica de cada comando → ver el `SKILL.md` correspondiente en `.claude/skills/<name>/`.

---

## Flujo del orquestador

El pipeline corre 6 fases (-1 → 5). Cada fase emite un `[RR·CKPT] Fase N <estado> · <detalle>` visible al PM.

| Fase | Nombre | Output | Checkpoint clave |
|---|---|---|---|
| **-1** | Pre-flight (G0) | Inputs verificados | `[RR·CKPT] PRE ✓` o `PRE ✗ · <motivo>` |
| **0** | Configuración mínima | sprint_config (fechas, equipo, capacidad, BAC) | `[RR·CKPT] Fase 0 ✓ · <sprint> · <N> HUs` |
| **1** | Análisis paralelo | N JSONs (INVEST + ISO + Gherkin + PERT + Riesgos + Deps) | `[RR·CKPT] Fase 1 ✓ · <N> JSONs · <M> gate_failed` |
| **2** | Quality gates G1-G9 + schema Ajv | JSONs validados (con reintento si falla) | `[RR·CKPT] Fase 2 ✓ · G1-G4 · <K> reintentos` |
| **3** | Consolidación | `data.json` (incluye métricas_sprint) | `[RR·CKPT] Fase 3 ✓ · data.json (<X> KB)` |
| **4** | Generación HTML | `index.html` con `/*__SPRINT_DATA__*/` reemplazado | `[RR·CKPT] Fase 4 ✓ · index.html (<Y> KB)` |
| **5** | Reporte al PM | Resumen ejecutivo | `[RR·CKPT] Fase 5 · listo` |

**Contrato detallado de cada fase** (pseudocódigo, validaciones exactas, side effects): [.claude/agents/orchestrator.md](.claude/agents/orchestrator.md). Si el flujo cambia, se actualiza allí — CLAUDE.md solo mantiene la tabla resumen.

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

## Estructura del proyecto

La estructura completa de carpetas vive en [README.md](README.md#estructura-del-proyecto) (canónico). Paths que el asistente debe conocer:

- `.claude/agents/<name>.md` — 5 agentes activos (orchestrator, hu-full-analyzer, report-builder, client-report-generator, spec-writer). Agentes reemplazados en `.claude/agents/_legacy/`.
- `.claude/skills/<name>/SKILL.md` — 5 skills del proyecto. El runtime descubre skills solo en este patrón, no en subnamespaces.
- `docs/HUs/<sprint-id>/*.md` — input del sprint (1 HU por archivo).
- `docs/contexto/contexto-{funcional,tecnico}.md` — contexto obligatorio.
- `templates/core/sprint-dashboard.html` + `hu-calidad.schema.json` — templates críticos (el orquestador los lee).
- `output/<sprint-id>/{index.html, data.json[, data.previous.json, tmp/, .checkpoint.json]}` — entregables y estado runtime.
- `scripts/` — utilidades (`preflight-check.sh`, `consolidate-sprint.js`, `validate-hu-json.js`, `checkpoint.js`, `next-step.js`, `init-sprint.sh`).
- `docs/referencia/kit-base-agents/` — 101 agentes del JM Kit (consulta humana, fuera del discovery del runtime).

---

## Reglas del sistema

### Leyenda de tags

Cada regla lleva un tag que indica qué pasa si se viola y cómo se hace cumplir:

| Tag | Significado | Cómo se enforza |
|---|---|---|
| **[BLOQUEANTE]** | Violarla aborta el pipeline o el turno. No hay reintento automático. | Detección manual del asistente + `[RR·CKPT] PRE ✗` / `[RR·PAUSE]` |
| **[GATE]** | Validada automáticamente por quality gates G1-G9 en `scripts/consolidate-sprint.js` o `validate-hu-json.js` | Reintento con feedback si falla |
| **[ARQUITECTURA]** | Decisión de diseño del sistema. Cambiarla requiere re-arquitectura, no re-ejecución. | Code review humano (no hay check automático) |
| **[ESTILO]** | Convención de formato, UX o observabilidad. No bloquea pero es el estándar esperado. | Revisión HITL del PM en el dashboard |

### Reglas v1.0 — Base

1. **[BLOQUEANTE]** Sin contexto, sin análisis — Si `docs/contexto/` está vacío, pedir al PM que lo complete.
2. **[BLOQUEANTE]** Sin HUs, sin análisis — Verificar que existan archivos `.md` en `docs/HUs/Sprint-X/`.
3. **[BLOQUEANTE]** No inventar información técnica — Si no está en el contexto, marcarlo como "No documentado — requiere confirmación".
4. **[ESTILO]** Gherkin en español de negocio — Sin rutas de API ni IDs técnicos.
5. **[ESTILO]** Estimaciones justificadas — Cada tarea incluye justificación de tiempo.
6. **[BLOQUEANTE]** Preguntas, no suposiciones — Cuando falte info crítica, generar preguntas de clarificación (no inventar defaults).
7. **[ARQUITECTURA]** 1 agente por HU, todos en paralelo — hu-full-analyzer hace todo. No 5 agentes separados.
8. **[BLOQUEANTE]** Output por sprint — Cada sprint en `output/Sprint-X/`. No sobreescribir sprints anteriores.
9. **[BLOQUEANTE]** HUs aprobadas son inmutables — En modo iteración, no tocar las aprobadas (snapshot guard enforza).
10. **[BLOQUEANTE]** Sin spec APROBADO → sin implementación — Regla cardinal del SDD.

### Reglas de Cobertura y Calidad

11. **[BLOQUEANTE]** Refinamiento AÑADE, nunca RESTA — data.json contiene TODA la información del fuente + el análisis.
12. **[GATE]** Validación de cobertura obligatoria — Comparar sección por sección el original vs refinado (G1: criteriosAceptacion.length ≥ criteriosOriginales.length).
13. **[BLOQUEANTE]** Criterios originales en campo separado — `criteriosOriginales[]` y `criteriosAceptacion[]` coexisten.
14. **[GATE]** Tareas con DoD verificable — `[VERBO] [ARTEFACTO] en [UBICACIÓN] — DoD: [criterio concreto]` (G2: DoD ≥ 15 chars).
15. **[GATE]** PERT triple coherente — O ≤ P ≤ Pe → E = (O + 4P + Pe) / 6 (G3).
16. **[ESTILO]** Perfiles mínimos: DEV y QA — Solo separar FE/DB si hay rol dedicado en el equipo.
17. **[ARQUITECTURA]** Template HTML inmutable — `sprint-dashboard.html` contiene TODO el CSS y JS. Nunca generar CSS/JS desde agentes.
18. **[BLOQUEANTE]** Output limpio — Solo `index.html` + `data.json` en output/Sprint-X/ (+ `data.previous.json` en modo iteración). Sin parciales, sin individuales.
19. **[ARQUITECTURA]** Templates son contratos — Leer templates/ antes de generar output.

### Reglas de Estándares de Calidad

20. **[GATE]** ISO 29148 como contrato — 9 atributos: Necesario, Apropiado, Inequívoco, Completo, Singular, Factible, Verificable, Correcto, Conforme.
21. **[GATE]** Calificación ISO 0-5 obligatoria — Fórmula: `(iso29148_norm * 0.50 + invest_norm * 0.30 + iso25010_norm * 0.20) * 5` (G4).
22. **[GATE]** CAs ISO-compliant — Verificable, Singular, Inequívoco. Si no cumple → BLOQUEO.
23. **[GATE]** Cobertura ISO 25010 en NFRs — Al menos 1 tarea de verificación por cada característica aplicable.
24. **[ARQUITECTURA]** Agentes producen DATA — JSON puro. Nunca HTML, CSS ni JS.
25. **[ARQUITECTURA]** 1 template renderiza todo — sprint-dashboard.html lee `window.__SPRINT_DATA__` y renderiza.
26. **[ARQUITECTURA]** Contexto UNA VEZ — El orquestador lee archivos; los agentes reciben texto plano en el prompt.

### Reglas de Entregables (NO NEGOCIABLES)

27. **[BLOQUEANTE]** UN SOLO HTML por sprint — `output/Sprint-X/index.html` es el único entregable visual.
28. **[BLOQUEANTE]** Tabs del dashboard (fijas):
    1. **Dashboard Sprint** — KPIs, gauges ISO, tabla HUs, HITL (Focus Mode via "Revisar HU").
    2. **Avance del Sprint** — 4 sub-tabs: 💰 EVM (con PV/EV/AC iniciados en 0) · 📅 Cronograma · ⚠ Radar de Riesgos · 📄 Specs.
       - Sub-tab Specs (siempre visible) tiene 3 estados: (a) esperando aprobación de HUs, (b) invitación a `/generar-specs`, (c) tabla con descarga `.md` por HU. Ver `.claude/agents/spec-writer.md` para el marco ASDD.
    3. **Informe Cliente** — Renderizado desde `data.json.informe_cliente`.
    4. **Informes** (dropdown) — Exportar/importar Markdown, imprimir PDF.
29. **[BLOQUEANTE]** `generar-informe` NO genera archivos externos — Enriquece `data.json` con `informe_cliente` y re-inyecta en el template.
30. **[ESTILO]** Tooltips obligatorios — `.ux-tip` con `data-tip`.
31. **[ESTILO]** Guías visibles por vista — Callout de "Qué hacer aquí" colapsable.
32. **[ESTILO]** Alerta de pérdida de estado — `beforeunload` con aviso si hay cambios sin exportar.
33. **[ESTILO]** Banner sticky de respaldo — CTA "Descargar respaldo (Markdown)" cuando hay cambios locales.
34. **[BLOQUEANTE]** Round-trip completo — Markdown exportado contiene `<!-- RR-STATE-BEGIN -->...JSON...<!-- RR-STATE-END -->`.
35. **[ARQUITECTURA]** Chart offline-first — Chart.js por CDN con fallback SVG inline. Gantt siempre SVG.
36. **[BLOQUEANTE]** EVM parte en cero — PV, EV, AC siempre inician en 0. Prohibido autocompletar.

### Reglas de Observabilidad (v2.0)

37. **[GATE]** Checkpoints por fase — Cada fase del orquestador emite `[RR·CKPT] Fase N <estado> · <detalle>` en texto plano.
38. **[ESTILO]** Heartbeat en fases largas — Si una fase tarda > 60s, emitir `[RR·CKPT] Fase N · heartbeat · esperando <cosa concreta>`.
39. **[BLOQUEANTE]** Regla de no-silencio — Ver sección "🛡 Regla de no-silencio" al inicio de este archivo.
40. **[BLOQUEANTE]** Snapshot guard --iteración — Antes de reescribir `data.json`, copiar actual a `data.previous.json`. Post-merge, verificar que HUs `pm_aprobada: true` no cambiaron.

---

## Formato de HUs de entrada y Sistema de Diseño

- **Formato de HUs**: guía completa para el PM en [docs/HUs/README.md](docs/HUs/README.md). Mínimo obligatorio por HU: rol (quién), intención (qué), beneficio (para qué), detalle del desarrollo, criterios de aceptación iniciales.
- **Sistema de Diseño**: tokens, paleta, tipografía y estilos viven en [docs/ui-design-guidelines.md](docs/ui-design-guidelines.md) y están aplicados UNA sola vez en `templates/core/sprint-dashboard.html`. **Regla operativa**: los agentes nunca generan CSS ni HTML — solo producen JSON.

---

## Checklist post-refactor

Corre `bash scripts/preflight-check.sh` (4 chequeos: merge markers, 5/5 skills registradas, 5/5 agentes registrados, JS del template compila). Exit 0 = OK · 1 = fallos · 2 = error.

Se invoca automáticamente como primer paso de Fase -1 del orchestrator. Se recomienda engancharlo a pre-commit local (`git config core.hooksPath .claude/hooks`).

Si preflight pasa pero algo sigue raro: reinicia sesión Claude Code (el system-reminder debe listar las 5 skills `refinar-*` y `generar-*`) y verifica que `Skill(skill="refinar-sprint")` no devuelva "Unknown skill".

---

## Regression testing del analyzer

Las fixtures `docs/HUs/_fixtures/Sprint-dryrun/HU-{dryrun,malformada}.md` + sus `.expectations.json` permiten validar la **calidad** del output del `hu-full-analyzer` sin correr sobre HUs reales. Usar tras cambios al prompt de `hu-full-analyzer.md` o update del modelo:

```
node scripts/regression-check.js \
  docs/HUs/_fixtures/Sprint-dryrun/HU-dryrun.expectations.json \
  output/Sprint-dryrun/tmp/HU-DRYRUN.json
```

Exit 0 = sin regresiones críticas · Exit 1 = al menos 1 regresión · Exit 2 = error de ejecución. Detalle del contrato de expectations en [docs/HUs/\_fixtures/README.md](docs/HUs/_fixtures/README.md).
