---
name: generar-informe
description: Enriquece data.json con la seccion "informe_cliente" (params + resumen ejecutivo + riesgos en lenguaje de negocio) y re-inyecta el dashboard. El informe queda embebido como una tab dentro de output/<sprint>/index.html. NO genera archivos externos.
argument-hint: "<sprint-id> [--formato ejecutivo|detallado|resumido]"
---

# Skill: generar-informe

Enriquece `output/<sprint-id>/data.json` con la seccion `informe_cliente` y regenera `output/<sprint-id>/index.html`. El informe al cliente es una **vista embebida** dentro del dashboard unico, NO un archivo aparte.

## Regla cardinal (Regla 29)

**`generar-informe` NO crea archivos fuera de `output/<sprint-id>/index.html` ni `output/<sprint-id>/data.json`.**

Nada de `informe-cliente/informe.html`, nada de `informe.md`. Esos archivos son legado y deben eliminarse si existen.

## Activacion

```
/generar-informe Sprint-1
/generar-informe Sprint-1 --formato ejecutivo
```

## Precondiciones (BLOQUEANTES)

1. `output/<sprint-id>/data.json` debe existir.
2. Al menos una HU con `pm_aprobada: true`. Si no, pedir revision HITL primero.
3. Si hay HUs sin revisar, advertir al PM pero continuar (se marcan como "pendientes" en el informe).

## Proceso

1. Leer `output/<sprint-id>/data.json`.
2. Pedir al PM (o usar defaults):
   - Contacto cliente (default: "Equipo de Negocio del cliente")
   - Plazo de respuesta en dias habiles (default: 5)
   - Canal de respuesta (default: "email al Product Owner")
   - Fecha de inicio del sprint (default: "Dia 1")
   - Duracion del sprint en dias habiles (default: 10)
   - Capacidad del equipo (default: 6 personas * 8h/dia = 48h/dia)
3. Delegar al agente `@client-report-generator` con los datos.
4. El agente produce un **JSON** con la siguiente estructura y lo retorna:

```json
{
  "informe_cliente": {
    "generado_en": "ISO8601",
    "formato": "ejecutivo",
    "contacto_cliente": "...",
    "plazo_respuesta_dias": 5,
    "canal_respuesta": "...",
    "sprint": {
      "duracion_dias_habiles": 10,
      "capacidad_personas": 6,
      "horas_dia_persona": 8,
      "capacidad_diaria_h": 48,
      "fecha_inicio": "Dia 1"
    },
    "resumen_ejecutivo": "Parrafo en lenguaje de negocio, sin tecnicismos.",
    "estado_sprint_frase": "Ej: Sprint saludable, 11 funcionalidades confirmadas.",
    "funcionalidades_confirmadas": [
      {
        "hu_id": "HU-XXXX",
        "titulo_negocio": "...",
        "proposito": "...",
        "beneficio": "...",
        "criterios_exito": ["...", "...", "..."],
        "esfuerzo_h": 36.8,
        "nivel_calidad": "Buena"
      }
    ],
    "funcionalidades_pendientes": [],
    "riesgos_negocio": [
      {"tema": "Calidad de datos en sponsors", "descripcion_negocio": "...", "impacto": "Alto"}
    ],
    "gantt_secuenciado": [
      {"hu_id": "HU-XXXX", "titulo": "...", "dia_inicio": 1, "dias": 2, "depende_de": [], "nivel_calidad": "Buena", "riesgos_criticos": 4}
    ],
    "clausula_aprobacion": {
      "texto": "Si no recibimos respuesta en N dias habiles, se entendera como aprobacion tacita...",
      "plazo_dias": 5,
      "canal": "..."
    }
  }
}
```

5. El orquestador (o esta skill) escribe el JSON en `data.json` bajo la clave `informe_cliente`, preservando el resto.
6. Re-inyectar `data.json` en `templates/core/sprint-dashboard.html` y escribir `output/<sprint-id>/index.html`.
7. Limpieza: eliminar `output/<sprint-id>/informe-cliente/` si existe (legado).
8. Reportar al PM:

```
══════════════════════════════════════════════════════════════
  ✅ INFORME CLIENTE · <sprint-id> · enriquecido y embebido
══════════════════════════════════════════════════════════════

  Dashboard: output/<sprint-id>/index.html → tab "Informe Cliente"

  ➡ SIGUIENTE PASO: Generar specs ASDD de las HUs aprobadas
     /generar-specs <sprint-id>

  El spec es el contrato ejecutable que permite a Backend, Frontend
  y QA implementar sin preguntar al PM. Ver marco ASDD en
  .claude/agents/spec-writer.md
══════════════════════════════════════════════════════════════
```

9. Ejecutar `bash: node scripts/next-step.js <sprint-id>` para emitir el banner de "siguiente paso" según el estado real del proyecto (el script detecta si hay specs ya generados, si falta cerrar riesgos, etc.).

## Reglas

- **Lenguaje de negocio puro** en todos los strings del JSON `informe_cliente`. Sin API, endpoint, BD, JWT, Flyway, microservicio.
- **Gantt secuenciado** respetando dependencias: HUs bloqueantes primero, luego paralelo hasta llenar capacidad diaria.
- **Calculo de dias**: `dias_hu = max(1, ceil(horas / capacidad_diaria_h))`.
- **Riesgos agregados** en 5-8 temas de negocio a partir de los riesgos Alta de las HUs.
- **Solo HUs aprobadas** en `funcionalidades_confirmadas`. Las no aprobadas van en `funcionalidades_pendientes`.
- **Agente produce DATA** (Regla 24). Nunca HTML ni CSS.
- **Single HTML** (Regla 27). No escribir archivos externos.
