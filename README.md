# Requirement Refinator

**Framework de refinamiento y especificación de historias de usuario para Product Managers**, impulsado por agentes IA.

Del backlog en bruto al **contrato ejecutable ASDD**, en un flujo guiado con HITL (Human-in-the-Loop) que cubre:

- ✅ Validación **INVEST + ISO/IEC/IEEE 29148:2018**
- ✅ Criterios de aceptación en **Gherkin** (BDD)
- ✅ Tareas técnicas con **estimaciones PERT** (O/P/Pe)
- ✅ Análisis de riesgos **RISICAR** (DAFP Colombia)
- ✅ Mapeo de dependencias
- ✅ Calificación de calidad **ISO/IEC 25010**
- ✅ Dashboard **EVM** (Valor Ganado, PMI-PMBOK 7) con Gantt y Bitácora PMO
- ✅ **Informe ejecutivo** al cliente embebido en el mismo HTML
- ✅ **Specs ASDD** (Agentic Spec-Driven Development, Sofka) con Gate 0 y descarga `.md` por HU

Todo en **un solo archivo HTML** interactivo, autocontenido y offline-first.

---

## Requisitos

| Herramienta | Uso |
|---|---|
| [Claude Code](https://claude.ai/code) o [Antigravity](https://antigravity.dev) | Ejecutar los agentes IA |
| Node.js ≥ 18 | Scripts de validación, consolidación y navegación |
| Git | Clonar y versionar el proyecto |
| Navegador moderno | Abrir el dashboard interactivo (Chrome recomendado) |

---

## Inicio rápido

### 1. Clonar el proyecto

```bash
git clone https://github.com/mauriciosepulveda-max/PM-refinador.git
cd PM-refinador
```

### 2. Preparar el contexto del proyecto

Si es tu primer sprint:

```bash
cp docs/contexto/contexto-funcional.template.md docs/contexto/contexto-funcional.md
cp docs/contexto/contexto-tecnico.template.md   docs/contexto/contexto-tecnico.md
```

Edita ambos archivos con la información real de tu proyecto (dominio, stack, integraciones, convenciones).

### 3. Inicializar el sprint

**Opción A — sprint nuevo desde cero:**
```bash
bash scripts/init-sprint.sh Sprint-144 --init
```

Esto crea `docs/HUs/Sprint-144/` vacío y deja los templates de contexto listos (si no existían).

**Opción B — ingerir HUs desde otra carpeta** (útil cuando las HUs vienen de un cliente o un sharepoint exportado):
```bash
bash scripts/init-sprint.sh Sprint-144 --ingest /ruta/al/otro/proyecto/HUs/
```

Copia todos los `.md` sueltos al worktree, detecta contextos funcionales/técnicos si existen y valida el formato mínimo.

### 4. Agregar/completar las HUs

Cada HU es un `.md` dentro de `docs/HUs/Sprint-144/` con al menos:

```markdown
# Título de la HU

## Narrativa
Como [rol] quiero [acción] para que [beneficio]

## Criterios de Aceptación
- CA1: …
- CA2: …
```

### 5. Ejecutar el análisis

Abre Claude Code o Antigravity en la carpeta del proyecto:

```
/refinar-sprint Sprint-144
```

El agente te pedirá **solo una cosa** (Fase 0 minimizada): rango de fechas + equipo. Todo lo demás se calcula automáticamente (días hábiles, capacidad, BAC).

### 6. Revisar el dashboard

```bash
open output/Sprint-144/index.html
```

El dashboard HITL incluye:

- Tab **Dashboard Sprint** — calidad por HU, aprobar/rechazar, dar feedback
- Tab **Avance del Sprint** — 4 sub-tabs: EVM · Cronograma · Radar de Riesgos · **Specs**
- Tab **Informe Cliente** — se llena al correr `/generar-informe`
- Tab **Informes** — exportar/importar Markdown, imprimir PDF

---

## 🔄 Flujo completo del PM (end-to-end)

```
                 ┌──────────────────┐
                 │  1. Setup del    │   init-sprint.sh --init | --ingest
                 │     sprint       │
                 └────────┬─────────┘
                          ▼
        ┌─────────────────────────────────────┐
        │  2. /refinar-sprint Sprint-X        │
        │  ├── Pre-flight G0 automático       │
        │  ├── Fase 0: 1 pregunta mínima      │
        │  ├── Fase 1: N hu-full-analyzer ║   │
        │  ├── Fase 2: Quality Gates G1-G4    │
        │  ├── Fase 3: data.json consolidado  │
        │  ├── Fase 4: index.html inyectado   │
        │  └── Fase 5: next-step.js reporta   │
        └────────┬────────────────────────────┘
                 ▼
        ┌────────────────────────────────┐
        │  3. Dashboard HITL — PM revisa │
        │  · Edita CAs Gherkin           │
        │  · Ajusta PERT (O/P/Pe)        │
        │  · Gestiona riesgos (RISICAR)  │
        │  · Aprueba ✓ / Rechaza ✗       │
        └────────┬───────────────────────┘
                 ▼
              ¿Hay HUs rechazadas o con feedback?
                 │                         │
                 ▼ sí                      ▼ no
        ┌──────────────────┐      ┌──────────────────────┐
        │ /refinar-sprint  │      │ 100% aprobadas       │
        │  --iteracion     │      │ → auto-download .md  │
        │ (re-analiza las  │      │ consolidado con HUs  │
        │  rechazadas,     │      └──────────┬───────────┘
        │  preserva OK)    │                 │
        └────────┬─────────┘                 ▼
                 │              ┌───────────────────────────────┐
                 └─────────────▶│  4. Mediciones EVM + Riesgos  │
                                │  · Editar PV/EV/AC/BAC por HU │
                                │  · 📸 Snapshot diario por HU  │
                                │  · Cerrar riesgos mitigados   │
                                └──────────┬────────────────────┘
                                           ▼
                                     ┌─────────────────────┐
                                     │ EV/BAC ≥ 95% ?      │
                                     └─────────┬───────────┘
                                               ▼ sí
                    ┌──────────────────────────────────────────┐
                    │ Banner verde: "Sprint listo para cierre" │
                    └──────────────────┬───────────────────────┘
                                       ▼
                    ┌─────────────────────────────────────────┐
                    │  5. /generar-informe Sprint-X           │
                    │  → enriquece data.json con             │
                    │    informe_cliente (ejecutivo + Gantt)  │
                    │  → aparece en Tab "Informe Cliente"     │
                    └───────────────┬─────────────────────────┘
                                    ▼
                    ┌──────────────────────────────────────────────┐
                    │  6. Tab Specs muestra Estado 2              │
                    │  → Sugiere: /generar-specs Sprint-X          │
                    └───────────────┬──────────────────────────────┘
                                    ▼
                    ┌────────────────────────────────────────────────┐
                    │  7. /generar-specs Sprint-X                    │
                    │  Pipeline ASDD por HU:                         │
                    │   Paso 0  Clasificación                        │
                    │   Paso 1  Evaluación INVEST (reuso de scores)  │
                    │   Paso 2  DoR — bloquea si no cumple           │
                    │   Paso 3  Análisis QUÉ · DÓNDE · POR QUÉ       │
                    │           + 5 secciones ASDD Capa 1            │
                    │           + Mermaid (SSD + flowchart)          │
                    │           + API contracts + tareas + DoD       │
                    │   Paso 4  (delegación al orchestrator)         │
                    │  Gate 0 ▸ estructural + completitud + CoE      │
                    │  Output ▸ specs/Sprint-X/<hu>-v1.spec.md       │
                    │         + embed content_md en data.json        │
                    └───────────────┬────────────────────────────────┘
                                    ▼
                    ┌───────────────────────────────────────────────┐
                    │  8. Tab Specs muestra Estado 3                │
                    │  Tabla con HU · versión · estado · Gate 0 ·   │
                    │  iteraciones · botón ⬇ .md                    │
                    │                                                │
                    │  PM revisa cada spec (descarga .md)           │
                    │  · Aprueba → estado: APROBADO                 │
                    │  · Feedback → /generar-specs --iterar <hu>    │
                    │    (genera v2, preserva v1 — máx 5 iter)      │
                    └───────────────┬───────────────────────────────┘
                                    ▼
                    ┌───────────────────────────────────────────────┐
                    │  9. Cierre formal del sprint                  │
                    │  Botones PDF / Word en EVM → Bitácora PMO     │
                    │  lista para compartir con cliente y PMO       │
                    └───────────────────────────────────────────────┘
```

En cada paso, `scripts/next-step.js` emite un banner con el comando exacto siguiente.

---

## Comandos disponibles

### Skills (invocables desde Claude Code)

| Comando | Descripción |
|---|---|
| `/refinar-sprint Sprint-X` | Analiza todas las HUs → genera el dashboard |
| `/refinar-sprint Sprint-X --iteracion` | Re-analiza solo HUs rechazadas/con feedback (preserva aprobadas) |
| `/refinar-sprint Sprint-X --consolidar` | Regenera el HTML sin re-analizar (útil si cambiaste el template) |
| `/refinar-sprint Sprint-X --dry-run` | Pre-flight + 1 HU fixture, sin escribir outputs |
| `/refinar-hu Sprint-X "nombre-hu.md"` | Analiza una sola HU |
| `/iterar-refinamiento Sprint-X` | Alias para `--iteracion` |
| `/generar-informe Sprint-X` | Informe ejecutivo para el cliente → tab "Informe Cliente" |
| `/generar-specs Sprint-X` | **Specs ASDD para todas las HUs aprobadas** |
| `/generar-specs Sprint-X --hu US-01` | Spec para una sola HU |
| `/generar-specs Sprint-X --iterar US-01` | Itera sobre la última versión con feedback |

### Scripts utilitarios (CLI)

| Script | Uso | Cuándo |
|---|---|---|
| `scripts/preflight-check.sh` | Valida framework (merge markers · skills/agents registrados · JS del template) | Antes de commit o invocación de skill |
| `scripts/init-sprint.sh Sprint-X --init \| --ingest <ruta>` | Onboarding asistido del sprint | Antes de agregar HUs |
| `scripts/consolidate-sprint.js <manifest>` | Consolida N JSONs + inyecta HTML con post-write validation | Interno de `/refinar-sprint` Modo B |
| `scripts/validate-hu-json.js <path>` | Valida un JSON de HU contra el schema (Ajv con fallback) | Interno de Fase 2 |
| `scripts/next-step.js <sprint>` | Emite el siguiente paso sugerido al PM según estado | Fin de cada skill |
| `scripts/checkpoint.js <save\|load\|clear\|list-completed>` | Resumabilidad de ejecuciones largas | Interno de `/refinar-sprint` Modo B |
| `scripts/worktree-info.js` | Dual-path awareness cuando operas desde worktrees | Interno de `next-step.js` |

---

## Dashboard — features por tab

### Tab 1 · Dashboard Sprint
- KPIs globales: HUs totales · % revisión · calificación ISO promedio · horas estimadas · riesgos críticos · preguntas HITL
- Gauges: ISO 29148 · INVEST · ISO 25010
- Tabla de HUs con calificación y estado
- **Botón "Revisar HU"** por fila → Focus Mode con 6 paneles:
  - Narrativa original vs. refinada
  - CAs Gherkin expandibles
  - Tareas PERT editables (O/P/Pe)
  - Riesgos RISICAR con matriz de calor
  - Dependencias mapeadas
  - Preguntas HITL + Feedback libre
- **Barra sticky**: Guardar borrador · Rechazar · Aprobar

### Tab 2 · Avance del Sprint (4 sub-tabs)

**💰 EVM** — PMI-PMBOK 7 Earned Value Management
- Parámetros del sprint (fechas, capacidad, BAC global editable)
- Gráfico curva S (PV · EV · AC) con fallback SVG si Chart.js no carga
- Tabla EVM por HU con inputs editables **BAC · PV · EV · AC** (Ola 2: BAC editable por HU con recálculo del total)
- Botón **📸 Snapshot diario** por fila (Ola 3: captura PV/EV/AC con fecha de hoy)
- Historial de mediciones con delete
- **Banner automático "Sprint cerrable"** cuando: 100% HUs aprobadas · EV/BAC ≥ 95% · 0 riesgos Inaceptables
- Botones export: **📄 PDF** (print dialog) · **📝 Word** (.doc compatible MS Office/LibreOffice)

**📅 Cronograma** — Gantt SVG del sprint con ruta crítica

**⚠ Radar de Riesgos** — matriz RISICAR completa con edición de gravedad/probabilidad

**📄 Specs** — 3 estados según progreso:
- **Estado 1** (< 100% HUs aprobadas) — callout informativo "Faltan N HUs por aprobar"
- **Estado 2** (100% aprobadas, sin specs) — callout con comando exacto `/generar-specs Sprint-X`
- **Estado 3** (specs generados) — tabla (HU · versión · estado · Gate 0 · iteraciones · botón ⬇ `.md`)

### Tab 3 · Informe Cliente
Renderizado desde `data.json.informe_cliente` (llenado por `/generar-informe`).
Incluye: resumen ejecutivo, Gantt simplificado, funcionalidades en lenguaje de negocio, riesgos de negocio, cláusula de aprobación pasiva.

### Tab 4 · Informes (dropdown)
- Exportar respaldo Markdown (round-trip: incluye HITL + mediciones EVM)
- Importar respaldo
- Imprimir PDF

---

## Marco ASDD (Agentic Spec-Driven Development)

El proyecto adopta el marco **ASDD de Sofka** como cimiento para la generación y gobernanza de specs.

### Pipeline de 5 pasos

| Paso | Nombre | Responsable | Output |
|---|---|---|---|
| **0** | Clasificación del artefacto | spec-writer | Tipo: HU \| Requerimiento |
| **1** | Evaluación de calidad | spec-writer | INVEST (HU) / IEEE 830 (req) |
| **2** | Validación de completitud (DoR) | spec-writer | Ambigüedades resueltas |
| **3** | Análisis técnico dirigido | spec-writer | **QUÉ · DÓNDE · POR QUÉ** + 5 secciones ASDD |
| **4** | Delegación al especialista | orchestrator | Spec entregado a Backend/Frontend/QA |

### Las 5 secciones del Spec (Capa 1 ASDD)

1. **Negocio & Dominio** — contexto, modelo de dominio, RF/RNF, reglas
2. **Arquitectura** — drivers, componentes, diagrama de secuencia (SSD), flowchart, API contracts, modelo de datos, riesgos técnicos
3. **Calidad** — CAs Gherkin refinados, casos de prueba base, criterios verificables (cobertura, latencia), estrategia de testing
4. **Diseño & UX** — design system, WCAG AA, responsive
5. **Restricciones** — librerías permitidas/prohibidas (R-002/R-003/R-007), versiones mínimas, anti-patrones, compliance

### Gate 0 — Validación antes de APROBADO

Un spec solo puede pasar a `estado: APROBADO` si cumple:
- **Estructural**: frontmatter YAML completo · 8 secciones presentes · ≥ 1 Mermaid · tabla de trazabilidad no vacía
- **Completitud**: QUÉ/DÓNDE/POR QUÉ no vacío · ≥ 3 RF numerados · ≥ 2 CAs Gherkin · DoD con ≥ 5 checkboxes
- **CoE**: sin librerías bloqueadas · stack alineado con contexto técnico · sin lógica en controladores (si aplica)

### Persistencia y descarga

- Archivo fuente: `specs/<sprint-id>/<hu-id>-v<N>.spec.md` (inmutable — cada iteración es archivo nuevo)
- Embed: `content_md` se copia a `data.json.historias[].specs[]` para descarga directa desde el navegador (zero dependencias externas)
- Dashboard: la tab **Specs** muestra el listado con botón ⬇ por HU

### Iteración HITL

```
/generar-specs Sprint-X                    → genera v1 (todas las HUs aprobadas)
/generar-specs Sprint-X --iterar US-01     → genera v2 con feedback (preserva v1)
... (máx 5 iteraciones por spec)
```

Al aprobar un spec (manual + Gate 0): actualizar frontmatter a `estado: APROBADO`, `aprobado_por: <nombre>`.

> Referencia completa: `.claude/agents/spec-writer.md` y `.claude/skills/generar-specs/SKILL.md`

---

## Arquitectura de agentes (V1)

```
orchestrator              ← Coordina el flujo completo (modo A: sub-agente; modo B: distribuido)
├── hu-full-analyzer × N  ← 1 por HU, en paralelo. Produce JSON con INVEST + ISO + Gherkin + PERT + Riesgos + Dependencias
├── spec-writer           ← Genera specs ASDD por HU aprobada (pipeline 5 pasos + Gate 0)
├── client-report-generator  ← Enriquece data.json con informe_cliente
└── report-builder        ← Inyecta data.json en el template HTML
```

### Threshold adaptativo (Ola 2)

| Tamaño del sprint | Modo de orquestación | Razón |
|---|---|---|
| **N ≤ 5 HUs** | Modo A — sub-agente `orchestrator` hace todo el flujo | Una sola invocación, lógica encapsulada |
| **N > 5 HUs** | Modo B — asistente principal orquesta directamente | Evita el token-limit del sub-agente; cada analyzer usa su presupuesto aislado |

En Modo B, el asistente lanza N `hu-full-analyzer` en paralelo y luego invoca `scripts/consolidate-sprint.js` para consolidar + inyectar HTML.

### Resumabilidad (Ola 2)

Cada fase larga persiste checkpoint en `output/<sprint>/.checkpoint.json`. Si una ejecución falla a mitad:
- `scripts/checkpoint.js list-completed <sprint>` lista las HUs ya analizadas (leyendo `tmp/*.json`)
- El asistente **salta** esas HUs al reanudar — no re-procesa lo ya hecho
- Al terminar OK, el checkpoint se borra automáticamente

---

## Estructura del proyecto

```
PM-refinador/
├── CLAUDE.md                       ← Workflow master, reglas del sistema, punto de entrada
├── README.md                       ← Este archivo
├── .gitignore                      ← Excluye output/, HUs reales y contextos reales
├── .claude/
│   ├── settings.json               ← Hook Stop + watchdog (opt-in)
│   ├── agents/                     ← Agentes descubiertos por el runtime
│   │   ├── orchestrator.md
│   │   ├── hu-full-analyzer.md
│   │   ├── spec-writer.md          ← Actualizado con marco ASDD
│   │   ├── client-report-generator.md
│   │   ├── report-builder.md
│   │   ├── _legacy/                ← Agentes anteriores (no usados)
│   │   └── _kit-base/              ← 101 agentes del JM Kit (READ-ONLY)
│   ├── skills/                     ← Skills (comandos /refinar-*, /generar-*)
│   │   ├── refinar-sprint/
│   │   ├── refinar-hu/
│   │   ├── iterar-refinamiento/
│   │   ├── generar-informe/
│   │   ├── generar-specs/          ← Actualizada con pipeline ASDD
│   │   └── _kit-base/              ← 110 skills genéricos (READ-ONLY)
│   ├── rules/_kit-base/            ← R-001 a R-008 + GEMINI.md
│   └── scripts/watchdog-empty-turn.js
├── scripts/                        ← Scripts utilitarios Node/Bash
│   ├── preflight-check.sh
│   ├── init-sprint.sh
│   ├── consolidate-sprint.js
│   ├── validate-hu-json.js
│   ├── next-step.js
│   ├── checkpoint.js
│   └── worktree-info.js
├── docs/
│   ├── HUs/
│   │   ├── Sprint-X/               ← Tus HUs (gitignored)
│   │   └── _fixtures/Sprint-dryrun/← HU sintética para --dry-run
│   ├── contexto/
│   │   ├── contexto-funcional.template.md
│   │   └── contexto-tecnico.template.md
│   └── referencia/                 ← ISO 29148, 25010, INVEST, RISICAR, etc.
├── templates/
│   ├── core/
│   │   ├── sprint-dashboard.html   ← Template único (no modificar)
│   │   └── hu-calidad.schema.json  ← Contrato JSON de hu-full-analyzer
│   └── auxiliary/
├── output/                         ← Generado (gitignored)
│   └── Sprint-X/
│       ├── index.html              ← Dashboard (entregable único)
│       ├── data.json               ← Fuente única de verdad
│       └── tmp/                    ← JSONs intermedios durante Modo B
└── specs/                          ← Specs ASDD (gitignored)
    └── Sprint-X/
        ├── US-01-v1.spec.md
        ├── US-01-v2.spec.md
        └── US-01-v3.spec.md        ← estado: APROBADO
```

---

## Estándares aplicados

| Estándar | Uso |
|---|---|
| **ISO/IEC/IEEE 29148:2018** | 9 atributos de calidad del requisito |
| **ISO/IEC 25010** | 8 características de calidad del producto (funcional, rendimiento, seguridad, mantenibilidad…) |
| **INVEST** | Criterios de buenas historias de usuario (Independent, Negotiable, Valuable, Estimable, Small, Testable) |
| **RISICAR (DAFP Colombia)** | Metodología de gestión de riesgos (gravedad × probabilidad, niveles RAG) |
| **PMI-PMBOK 7** | Métricas EVM (PV/EV/AC, CPI/SPI, EAC/ETC/VAC/TCPI) |
| **ASDD (Sofka)** | Agentic Spec-Driven Development — pipeline 5 pasos + Gate 0 |
| **Gherkin / BDD** | Lenguaje de criterios de aceptación |
| **PERT** | Estimación triple (O + 4P + Pe) / 6 |

---

## Troubleshooting

**Skill no encontrada al invocar `/refinar-sprint`**
```bash
bash scripts/preflight-check.sh
```
Verifica que las 5 skills y 5 agentes estén registrados en las rutas correctas.

**"Cargando datos…" infinito en el dashboard**
Indicador de JSON/JS roto. El flujo normal ya valida esto post-write, pero si editaste el template manualmente:
```bash
node -e "const fs=require('fs'); const h=fs.readFileSync('output/<sprint>/index.html','utf8'); const s=[...h.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join(';'); new Function(s); console.log('OK');"
```

**Token-limit al ejecutar sprint grande (>5 HUs)**
El framework usa **Modo B** automáticamente desde 6 HUs (orquestación distribuida). Si falla, verifica que existe `scripts/consolidate-sprint.js` y corre `bash scripts/preflight-check.sh`.

**Fechas guardadas como "0002" en el dashboard**
`sanitizeISODate` auto-sana al cargar. Si persiste el problema, borra localStorage del navegador o usa el botón "🗑 Limpiar" en la tab Avance.

**Los specs desaparecieron al regenerar el dashboard**
`consolidate-sprint.js` preserva `historias[].specs[]` de la versión previa. Si desaparecen, verifica que `output/<sprint>/data.json` existía antes del regenerar y contenía los specs.

---

## Créditos

Creado por **Mauricio Sepúlveda Henao**

Con Claude Code, Antigravity, Gemini y NotebookLM · Marco metodológico ASDD de **Sofka Technologies**.

Inspirado en JM Agentic Development Kit + ASD-main (ASDD orchestrator pattern).

---

## Licencia

Ver [LICENSE](LICENSE) (si aplica).
