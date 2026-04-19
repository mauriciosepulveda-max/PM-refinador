# Fixtures — regression testing del pipeline

Este directorio contiene HUs sintéticas + archivos de *expectations* (golden) usados para detectar regresiones del `hu-full-analyzer` sin correr sobre HUs reales.

A diferencia del schema (`templates/core/hu-calidad.schema.json`), que valida **estructura**, las expectations aquí validan **calidad**: rangos de scores, coberturas mínimas, umbrales de preguntas HITL, coherencia PERT, etc. Los rangos toleran la no-determinismo del LLM sin permitir degradaciones silenciosas.

## Fixtures incluidas

| Fixture | Perfil | Lo que debe producir el analyzer |
|---|---|---|
| `Sprint-dryrun/HU-dryrun.md` | **HU bien formada** — 5 CAs explícitos, rol/beneficio claros, contexto técnico completo | `calificacion_iso` entre 3.5–5.0, nivel "Excelente" o "Buena", ≤ 6 preguntas HITL, 5+ CAs Gherkin |
| `Sprint-dryrun/HU-malformada.md` | **HU deliberadamente pobre** — narrativa vaga ("haga cosas"), 2 CAs ambiguos, fluff | `calificacion_iso` entre 0.0–3.0, nivel "Aceptable"/"Deficiente"/"Crítica", ≥ 3 preguntas HITL, ambigüedades detectadas |

Las expectations viven en `<fixture>.expectations.json` al lado de cada `.md`.

## Uso

1. Producir un output del analyzer para la fixture:
   ```bash
   /refinar-sprint Sprint-dryrun --dry-run
   # o manualmente guardar el JSON del analyzer en output/Sprint-dryrun/tmp/HU-DRYRUN.json
   ```

2. Correr el regression-check:
   ```bash
   node scripts/regression-check.js \
     docs/HUs/_fixtures/Sprint-dryrun/HU-dryrun.expectations.json \
     output/Sprint-dryrun/tmp/HU-DRYRUN.json
   ```

3. Interpretar exit code:
   - `0` — todas las assertions críticas pasan (warnings reportados, no fallan)
   - `1` — al menos 1 assertion critical falló → regresión detectada
   - `2` — error de entrada (archivo no existe, JSON malformado)

## Contrato de expectations

Cada archivo `.expectations.json` contiene:

- `fixture_id`, `fixture_path` — identifica contra qué HU se evalúa
- `expectations_version` — semver del archivo de expectations (incrementar cuando se ajusten rangos)
- `schema_version_expected` — versión del schema del output (debe matchear `schema_version` en el JSON del analyzer)
- `description`, `rationale` — por qué estas expectations (contexto para quien ajuste)
- `assertions[]` — lista de reglas a evaluar

Reglas disponibles (ver `scripts/regression-check.js`):

| Regla | Uso | Ejemplo |
|---|---|---|
| `equals` | valor exacto | `{ "rule": "equals", "value": "1.0.0" }` |
| `matches` | regex sobre string | `{ "rule": "matches", "value": "^HU-" }` |
| `type` | typeof (`string`, `number`, `array`, `object`, `boolean`) | `{ "rule": "type", "value": "array" }` |
| `minLength` | length de string/array | `{ "rule": "minLength", "value": 50 }` |
| `min`, `max`, `between` | rangos numéricos | `{ "rule": "between", "min": 3.5, "max": 5.0 }` |
| `in` | value ∈ lista | `{ "rule": "in", "values": ["Excelente", "Buena"] }` |
| `contains_any` | substring any-of | `{ "rule": "contains_any", "values": ["PM", "Product Manager"] }` |
| `minArrayLength` | array.length ≥ N | `{ "rule": "minArrayLength", "value": 1 }` |
| `each_minLength` | aplicar minLength a cada item de un `arr[*].campo` | `{ "path": "tareas[*].dod", "rule": "each_minLength", "value": 15 }` |
| `each_min` | aplicar min a cada item | `{ "path": "tareas[*].estimacion_o", "rule": "each_min", "value": 0.5 }` |
| `each_pert_coherent` | O ≤ P ≤ Pe en cada tarea | `{ "path": "tareas[*].pert_coherence", "rule": "each_pert_coherent" }` |

Severidad por assertion:

- `"severity": "critical"` — fallo cuenta en `failed_critical` y causa exit 1
- `"severity": "warning"` — fallo se reporta pero no afecta exit code

## Cuándo ajustar expectations

Solo ajustar rangos cuando **el modelo del analyzer cambie** (update de versión de Sonnet, cambio en el prompt de `hu-full-analyzer.md`) y el nuevo comportamiento sea mejor que el anterior. Nunca ajustar rangos para "hacer pasar" un regression sin investigar causa raíz.

Incrementar `expectations_version` con semver cuando se ajusten las reglas (MAJOR si se endurecen umbrales críticos, MINOR si se añaden assertions, PATCH si se aclaran descripciones).
