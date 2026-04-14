---
name: generar-specs
description: Genera los Specs SDD (Spec-Driven Development) para las HUs aprobadas del sprint. Proceso HITL iterativo con versionamiento. Incluye diagramas Mermaid, contratos de API y lista de tareas. Requiere aprobación del cliente.
argument-hint: "<sprint-id> [--hu US-XX] [--iterar US-XX]"
---

# Skill: generar-specs

Genera especificaciones técnicas SDD para las HUs aprobadas, con proceso HITL de revisión iterativa.

## Activación

```
/generar-specs Sprint-1                     # Genera specs para TODAS las HUs aprobadas
/generar-specs Sprint-1 --hu US-01          # Solo para una HU específica
/generar-specs Sprint-1 --iterar US-01      # Itera sobre un borrador existente con feedback
```

## Precondiciones (BLOQUEANTES)

1. Debe existir `output/<sprint-id>/data.json`
2. La HU objetivo debe tener `pm_aprobada: true`
3. Si el cliente no ha confirmado → preguntar al PM:
   ```
   ⚠️ ¿El cliente ha aprobado el informe del sprint?
   Si → continuar con generación de specs
   No → recomendar ejecutar /generar-informe primero
   ```

## Proceso (por HU)

### Paso 1: Evaluar Definition of Ready
- ¿Tiene narrativa completa (Como/Quiero/Para)? ✓
- ¿Tiene CAs en Gherkin (al menos 2)? ✓
- ¿Tiene preguntas de clarificación SIN responder? ✗ → STOP, listarlas
- ¿Está aprobada por el PM? ✓

### Paso 2: Generar BORRADOR v1
Delegar al agente `@spec-writer` con:
- La HU completa de `data.json`
- El contexto funcional y técnico
- Las dependencias y riesgos identificados

### Paso 3: HITL — Revisión del equipo
```
📝 Spec generado: specs/<sprint-id>/US-XX-v1.spec.md

Opciones:
  a) "Apruebo el spec" → Claude marca como APROBADO
  b) "Necesita cambios: [descripción]" → Claude genera v2
  c) "Tengo preguntas: [preguntas]" → Claude responde y ajusta
  d) "Rechazar y rehacer desde cero" → Claude genera nuevo v1
```

### Paso 4: Iteración (si --iterar)
1. Leer el último spec versionado de la HU
2. Leer el feedback del equipo
3. Generar nueva versión (v(N+1)) preservando las anteriores
4. Repetir hasta aprobación o máximo 5 iteraciones

### Paso 5: Cierre
Cuando el PM confirma que el spec está listo:
1. Actualizar frontmatter: `estado: APROBADO`, `aprobado_por: <nombre>`
2. Reportar al PM

```
══════════════════════════════════════════════════════
  ✅ SPEC APROBADO: US-XX
══════════════════════════════════════════════════════

📄 Archivo final: specs/<sprint-id>/US-XX-v<N>.spec.md
📊 Iteraciones: <N>
👤 Aprobado por: <nombre>

Próximo spec pendiente: US-YY
══════════════════════════════════════════════════════
```

## Nomenclatura

```
specs/
└── Sprint-1/
    ├── US-01-v1.spec.md   ← Borrador inicial
    ├── US-01-v2.spec.md   ← Era iteración con cambios
    ├── US-01-v3.spec.md   ← Versión APROBADA
    ├── US-02-v1.spec.md
    └── US-02-v2.spec.md   ← Versión APROBADA
```

## Reglas SDD (NO NEGOCIABLES)

1. **Sin spec APROBADO → sin implementación** — Recordar siempre al equipo.
2. **Inmutabilidad de versiones** — Cada iteración es un NUEVO archivo. NUNCA sobreescribir.
3. **Mermaid obligatorio** — Todo spec debe incluir al menos 1 diagrama de secuencia.
4. **API contracts primero** — Si hay integración, el contrato es lo primero que se define.
5. **Preguntas antes de borrador** — Si hay ambigüedades críticas, resolverlas ANTES.
6. **Máximo 5 iteraciones** — Si se supera, escalar con lista de puntos sin resolver.
7. **Trazabilidad total** — Toda sección del spec debe poder trazar a una HU y a tareas del task-estimator.
