---
name: generar-specs
description: Genera especificaciones ASDD (Agentic Spec-Driven Development, Sofka) para las HUs aprobadas del sprint. Ejecuta el pipeline ASDD de 5 pasos (Clasificación · Evaluación · Completitud · Análisis QUÉ/DÓNDE/POR QUÉ · Delegación). Produce specs por HU con Gate 0 + embed en data.json para descarga desde el dashboard. Soporta iteración HITL versionada.
argument-hint: "<sprint-id> [--hu <hu-id>] [--iterar <hu-id>]"
---

# Skill: generar-specs

Genera especificaciones técnicas **ASDD** para las HUs aprobadas del sprint. Cada spec es un contrato ejecutable que permite a los agentes especializados (Backend, Frontend, QA) implementar sin ambigüedad.

## Marco: ASDD (Sofka)

> ASDD transforma requerimientos en software de alta calidad a través de un pipeline estructurado de 5 pasos. Ver `.claude/agents/spec-writer.md` para el marco completo.

**Pilares:**
- **Especificación estructurada** — El spec es el contrato ejecutable del sistema.
- **Ejecución por agentes** — Backend/Frontend/QA trabajan sobre el spec sin preguntas al PM.
- **Validación multidimensional** — Gate 0 valida estructura, completitud y mínima CoE.
- **Gobernanza** — Políticas CoE aplicadas automáticamente.

## Activación

```
/generar-specs Sprint-144                 # Todas las HUs aprobadas (lote inicial)
/generar-specs Sprint-144 --hu US-01      # Solo una HU específica
/generar-specs Sprint-144 --iterar US-01  # Itera sobre la última versión con feedback del PM
```

---

## Precondiciones (BLOQUEANTES — Paso 2 del pipeline)

Verificar ANTES de lanzar spec-writer:

| Gate | Verificación |
|---|---|
| **P2.1** | Existe `output/<sprint-id>/data.json` |
| **P2.2** | Al menos 1 HU con `pm_aprobada: true` (si pasa `--hu`, esa HU debe cumplir) |
| **P2.3** | HUs objetivo NO tienen preguntas de clarificación con `impacto: "Alto"` sin responder |
| **P2.4** | `criteriosAceptacion.length >= criteriosOriginales.length` por HU (regla 11 del proyecto) |

Si falla cualquiera → `[SPEC·PRE ✗] · <motivo>` y abortar sin invocar spec-writer.

**Paso opcional pero recomendado:** si el cliente no ha aprobado el informe ejecutivo, preguntar al PM:
```
⚠️ El cliente aún no ha aprobado el informe ejecutivo del sprint.
   a) Continuar con los specs de todas formas
   b) Ejecutar /generar-informe primero (recomendado)
```

---

## Pipeline ASDD — Ejecución por HU

Por cada HU aprobada seleccionada:

### Paso 0 · Clasificación
`spec-writer` determina el tipo de artefacto. Para este framework siempre es **HU** (el Refinator trabaja con historias de usuario). Documentar en frontmatter: `tipo: HU`.

### Paso 1 · Evaluación de calidad (INVEST)
`spec-writer` revalida la HU bajo INVEST usando los scores ya calculados en `data.json` (`invest_score_norm`, `iso29148_score_norm`). Si el score es bajo (< 0.7), emitir warning en el spec — no bloquear, pero informar.

### Paso 2 · Completitud / DoR
Validar la Definition of Ready (ver lista en spec-writer.md). Si no cumple, listar fallos y abortar.

### Paso 3 · Análisis Técnico Dirigido
`spec-writer` genera la sección **QUÉ / DÓNDE / POR QUÉ** más las 5 secciones ASDD Capa 1:
1. Negocio & Dominio
2. Arquitectura
3. Calidad
4. Diseño & UX (si aplica)
5. Restricciones

Más: Lista de Tareas de Implementación (Paso 4 upstream), DoD, Trazabilidad.

### Paso 4 · Delegación (no ejecutada aquí)
El spec queda listo para que el orchestrator lo entregue al agente especializado (Backend/Frontend/QA). Esta skill **NO ejecuta el Paso 4** — solo lo habilita con un spec válido.

---

## Proceso HITL — iteración

```
Iteración 1:  spec-writer genera BORRADOR v1
  Archivo: specs/<sprint-id>/<hu-id>-v1.spec.md
  Frontmatter: estado: BORRADOR
     ↓
PM revisa el archivo (o desde el dashboard → tab Specs → botón descarga)
     ↓
PM da feedback:
  a) "Apruebo el spec US-XX" → Gate 0 → APROBADO
  b) "Necesita cambios: [descripción]" → /generar-specs Sprint-X --iterar US-XX
  c) "Rechazar y rehacer desde cero" → /generar-specs Sprint-X --hu US-XX (v1 nuevo, preserva las anteriores)
     ↓
spec-writer genera v(N+1) incorporando feedback, SIN borrar versiones anteriores
     ↓
Gate 0 validación (auto + manual PM)
     ↓
Si pasa Gate 0 + PM confirma → estado: APROBADO en frontmatter
```

**Máximo 5 iteraciones por spec.** Si se supera, escalar al PM con la lista de puntos no resueltos.

---

## Gate 0 — Validación antes de APROBADO

Antes de actualizar `estado: APROBADO`, ejecutar validación (manual por ahora; automatizable en Ola futura):

**Estructural:**
- [x] Frontmatter YAML completo
- [x] 8 secciones presentes (Análisis QUÉ/DÓNDE/POR QUÉ + 5 secciones ASDD + Tareas + DoD)
- [x] ≥ 1 diagrama Mermaid (SSD o flowchart)
- [x] Tabla de trazabilidad no vacía

**Completitud:**
- [x] QUÉ/DÓNDE/POR QUÉ no vacío
- [x] ≥ 3 requisitos funcionales numerados
- [x] ≥ 2 CAs Gherkin refinados (happy + error)
- [x] DoD con ≥ 5 checkboxes
- [x] Sección "Restricciones" deriva librerías/herramientas/convenciones de `docs/contexto/contexto-tecnico.md` secciones 6.1–6.4 del sprint (sin inventar stacks ni heredar reglas globales)

**CoE mínima (alineación con contexto técnico del sprint):**
- [x] Sin referencias a tecnologías listadas como prohibidas en `contexto-tecnico.md` sección 6.2
- [x] Stack declarado alineado con `contexto-tecnico.md` sección 1 y sección 6.1 (permitidas)
- [x] Convenciones de código (sección 6.3) y herramientas obligatorias (sección 6.4) reflejadas en las tareas

Si falla cualquiera → `estado: EN_REVISION` + notas al final del spec listando los fallos específicos.

---

## Persistencia y embed en data.json

Después de cada generación/iteración exitosa:

1. El archivo `.md` queda escrito en `specs/<sprint-id>/<hu-id>-v<N>.spec.md`.
2. **Actualizar `output/<sprint-id>/data.json`**: añadir o actualizar `historias[i].specs[]` con:
   ```json
   {
     "version": "1.0",
     "path": "specs/Sprint-144/US-01-v1.spec.md",
     "estado": "BORRADOR",
     "creado": "2026-04-14T10:30:00Z",
     "aprobado_por": null,
     "gate_0_passed": false,
     "content_md": "<contenido íntegro del .md>"
   }
   ```
3. **Re-inyectar en el dashboard**: ejecutar `bash: node scripts/consolidate-sprint.js output/<sprint>/tmp/manifest.json`.
4. El template HTML renderizará el nuevo estado del tab Specs automáticamente (tab siempre visible; contenido cambia según el array).

`content_md` se embebe para que el dashboard pueda ofrecer descarga directa del .md sin acceso al filesystem (el usuario está en el navegador).

---

## Output al PM

Al completar la generación (del lote o de una HU):

```
══════════════════════════════════════════════════════════════
  ✅ SPECS GENERADOS · Sprint-144
══════════════════════════════════════════════════════════════

  📄 3 specs generados (BORRADOR):
     · US-01-v1.spec.md  → specs/Sprint-144/US-01-v1.spec.md
     · US-02-v1.spec.md  → specs/Sprint-144/US-02-v1.spec.md
     · US-03-v1.spec.md  → specs/Sprint-144/US-03-v1.spec.md

  📊 Gate 0 automático:
     · 2/3 pasaron estructural
     · 1/3 con notas CoE (US-02: menciona "docker-compose" — revisar)

  Dashboard actualizado: output/Sprint-144/index.html → tab 📄 Specs

  Próximo paso:
    · Revisa cada spec desde el dashboard (tab Specs → botón descarga .md)
    · Itera con: /generar-specs Sprint-144 --iterar <hu-id>
    · Aprueba manualmente con confirmación del PM (estado: APROBADO)
══════════════════════════════════════════════════════════════

[RR·CKPT] Specs listos · <N> BORRADORES · 0 APROBADOS
```

Al finalizar, ejecutar `bash: node scripts/next-step.js <sprint-id>` para que el PM vea automáticamente el siguiente paso (revisar specs, iterar, o cerrar el sprint si todos están APROBADO). El script ya detecta `historias[].specs[]` y distingue casos 7 (sin specs), 7.5 (borrador), 8 (todo completo).

---

## Reglas ASDD del skill

1. **Sin HU aprobada → sin spec** — Precondición P2.2 bloqueante.
2. **Inmutabilidad versiones** — Cada iteración es archivo nuevo.
3. **Gate 0 obligatorio** para pasar a APROBADO.
4. **Embed en data.json** — obligatorio para habilitar descarga desde dashboard.
5. **Consolidar tras generar** — el dashboard debe reflejar el estado actual al instante.
6. **Máximo 5 iteraciones** por spec.
7. **Trazabilidad** — cada spec traza a data.json y a tareas del task-estimator.
