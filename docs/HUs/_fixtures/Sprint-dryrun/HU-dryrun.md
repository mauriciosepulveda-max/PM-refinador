# HU-DRYRUN · Fixture mínima para --dry-run

> Esta HU es sintética. Sirve para validar el pipeline en modo `/refinar-sprint <id> --dry-run` sin consumir invocaciones sobre HUs reales.
> NO editar en producción. Si se rompe el formato, rompe el dry-run.

## Narrativa

Como **PM del Requirement Refinator**
quiero **ejecutar un pre-flight completo con 1 HU fixture**
para **verificar que el pipeline está funcional antes de correr 11 HUs reales**.

## Propósito de negocio

Evitar gastar 11 invocaciones en paralelo cuando el pipeline tiene un defecto trivial (skill no registrada, template corrupto, schema roto, etc.). El fixture ejerce las ramas básicas del flujo: lectura de contexto, análisis de 1 HU, quality gates G1-G4, validación de schema Ajv.

## Detalle del desarrollo solicitado

- El modo `--dry-run` DEBE pasar el pre-flight de paths (contexto, schema, template).
- El modo `--dry-run` DEBE ejecutar `hu-full-analyzer` sobre esta HU exactamente una vez.
- El modo `--dry-run` DEBE validar el JSON resultante contra `templates/core/hu-calidad.schema.json` vía `scripts/validate-hu-json.js`.
- El modo `--dry-run` NO DEBE escribir `output/<sprint-id>/data.json` ni `output/<sprint-id>/index.html`.
- El modo `--dry-run` DEBE reportar: tiempo total, tokens estimados, resultado de cada gate (G1-G4 + G_SCHEMA).

## Criterios de aceptación originales

- **CA1:** Dado un worktree con contexto y template válidos, cuando el PM ejecuta `/refinar-sprint <id> --dry-run`, entonces el pipeline retorna `[RR·CKPT] DRY-RUN ✓` en menos de 120 segundos.
- **CA2:** Dado un worktree con el template HTML corrupto (sin el marcador `/*__SPRINT_DATA__*/null`), cuando el PM ejecuta `--dry-run`, entonces el pipeline aborta en Fase -1 con `[RR·CKPT] PRE ✗ · Template HTML corrupto`.
- **CA3:** Dado un JSON con `criteriosAceptacion.length < criteriosOriginales.length`, cuando el validador Ajv lo revisa, entonces marca `G_SCHEMA ✗` con el error específico.
- **CA4:** Dado un worktree sin `docs/contexto/contexto-funcional.md`, cuando el PM ejecuta `--dry-run`, entonces el pipeline aborta en Fase -1 sin preguntar al PM por las fechas del sprint.
- **CA5:** El modo `--dry-run` NO crea ni sobreescribe archivos en `output/`.

## Reglas de negocio

- Esta HU es únicamente un fixture técnico. No representa funcionalidad de cliente.
- Debe ser la primera alfabéticamente en `docs/HUs/_fixtures/Sprint-dryrun/` para que el orchestrator la seleccione por defecto.

## Notas técnicas

- Stack: Node.js ≥ 18 (para el script de validación).
- Dependencia opcional: `ajv` (el script tiene fallback mínimo si no está instalada).
- Fixture compatible con `mode=dry-run` del orquestador descrito en `.claude/agents/orchestrator.md`.
