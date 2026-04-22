# Política de versionado y migración del schema

> Contrato: `templates/core/hu-calidad.schema.json` + campo `schema_version` en cada output.

El schema del output de `hu-full-analyzer` es el **contrato operativo** del Requirement Refinator. Los `data.json` de sprints anteriores, los dashboards ya generados y los specs ASDD derivados dependen de su forma. Esta política define cómo evolucionarlo sin romper lo que ya existe.

---

## Dos conceptos distintos

| Campo | Dónde vive | Qué significa |
|---|---|---|
| `schemaVersion` (nivel raíz del schema) | `hu-calidad.schema.json` | Versión del schema mismo. Lo declara el autor del schema al publicarlo. |
| `schema_version` (nivel raíz del output) | Cada JSON producido por `hu-full-analyzer` | Versión del schema contra la que se validó ese output. Lo declara el agente al generarlo. |

**Regla de compatibilidad**: si un output legacy no declara `schema_version`, el consumidor **asume `1.0.0`**. Outputs producidos desde 2026-04-18 en adelante DEBEN declarar el campo explícitamente.

---

## Semver aplicado al schema

Seguimos [semver.org](https://semver.org/) para el campo `schemaVersion`:

| Incremento | Cuándo | Ejemplo de cambio |
|---|---|---|
| **MAJOR** (x.0.0) | Cambios que rompen outputs existentes | Eliminar un campo `required`; renombrar un campo `required`; cambiar el tipo de un campo `required`; cambiar el shape de una estructura anidada consumida por el dashboard |
| **MINOR** (1.x.0) | Cambios que añaden funcionalidad sin romper | Añadir un campo opcional nuevo; añadir un valor nuevo a un `enum` cuando el consumidor hace fallback; añadir un índice/metadato que el dashboard ignora si ausente |
| **PATCH** (1.0.x) | Cambios que aclaran o corrigen sin cambiar contrato | Ajustar `description`, `minLength`, `examples`; corregir una regex de `pattern` que siempre fue incorrecta; mejorar mensajes de error |

**Regla de oro para MAJOR**: si un `data.json` del sprint anterior deja de validar con el schema nuevo, es MAJOR. No hay vuelta.

---

## Flujo de cambio

### Cambio PATCH

1. Editar `hu-calidad.schema.json`.
2. Incrementar `schemaVersion` a `1.0.(n+1)` y añadir entrada al `changelog` del schema.
3. Correr `scripts/validate-hu-json.js` sobre al menos un `output/<sprint>/tmp/<hu_id>.json` real existente y sobre un JSON de output generado contra la fixture (ver "Validación con fixtures" abajo) para verificar retrocompatibilidad estructural.
4. Commit.

### Cambio MINOR

1. Editar `hu-calidad.schema.json` añadiendo el campo/enum opcional.
2. Incrementar `schemaVersion` a `1.(n+1).0`.
3. Actualizar `hu-full-analyzer.md` instruyendo al agente a emitir el campo nuevo cuando aplique.
4. Actualizar `templates/core/sprint-dashboard.html` para que lea el campo nuevo **con fallback seguro** si está ausente (porque outputs legacy no lo tienen).
5. Actualizar `changelog` del schema.
6. Validar estructura con `validate-hu-json.js` sobre outputs reales.
7. Validar **calidad** con `scripts/regression-check.js` contra las fixtures `HU-dryrun` y `HU-malformada` — si añadiste un campo que afecta al score o a la cobertura, ajustar las expectations y documentar el ajuste.
8. Commit.

### Cambio MAJOR

1. Crear branch `schema-v(n+1)`.
2. Editar `hu-calidad.schema.json` haciendo el cambio incompatible.
3. Incrementar `schemaVersion` a `(n+1).0.0`.
4. **Crear script de migración** en `scripts/migrate-schema-v<N>-to-v<N+1>.js` que:
   - Acepte un `data.json` v-anterior, devuelva un `data.json` v-nueva
   - Sea determinista e idempotente
   - Preserve todos los campos no afectados por el breaking change
5. Actualizar `hu-full-analyzer.md` con el nuevo contrato.
6. Actualizar `sprint-dashboard.html` para el nuevo shape (sin fallback a la versión anterior — el dashboard lee siempre la versión actual del schema).
7. Documentar en el `changelog` del schema qué migró y por qué.
8. Correr la migración sobre TODOS los `output/<sprint>/data.json` existentes antes de mergear.
9. Validar con `regression-check.js` contra las fixtures y actualizar expectations si el contrato de output cambió (`expectations_version` bump MAJOR).
10. Merge.

### Validación con fixtures

Para puntos 3/7/9: no se valida "contra la fixture `.md`" (que es el input). El flujo correcto es:

```bash
# 1) Producir un output real del analyzer para la fixture:
/refinar-sprint Sprint-dryrun --dry-run
# (esto deja un JSON en output/Sprint-dryrun/tmp/HU-DRYRUN.json)

# 2) Validar estructura contra el schema actualizado:
node scripts/validate-hu-json.js output/Sprint-dryrun/tmp/HU-DRYRUN.json

# 3) Validar calidad contra las expectations:
node scripts/regression-check.js \
  docs/HUs/_fixtures/Sprint-dryrun/HU-dryrun.expectations.json \
  output/Sprint-dryrun/tmp/HU-DRYRUN.json
```

---

## Detección de outputs legacy (pendiente de implementar)

> **Estado actual (2026-04-18)**: `consolidate-sprint.js` y `sprint-dashboard.html` **no leen `schema_version` todavía**. Esta sección describe el comportamiento objetivo; se implementará en el primer cambio MINOR o MAJOR del schema posterior al 1.0.0. Mientras tanto, todos los outputs se asumen v1.0.0 por compatibilidad legacy.

Cuando estos consumidores se actualicen, deberán:

1. Leer `historia.schema_version` (o `data.schema_version` si migramos a nivel sprint en el futuro).
2. Si ausente → asumir `"1.0.0"` y continuar.
3. Si `< schemaVersion actual` en MAJOR → log de advertencia + invocar migración automática (cuando exista).
4. Si `> schemaVersion actual` → error hard: el consumidor es más viejo que el productor, hay que actualizar el consumidor.

---

## Checklist antes de mergear un cambio de schema

- [ ] `schemaVersion` incrementado según semver
- [ ] Entrada añadida al array `changelog` del schema con `{ version, fecha, resumen }`
- [ ] `node -e "JSON.parse(...)"` sobre el schema pasa
- [ ] `scripts/validate-hu-json.js` contra al menos 1 output real (`output/<sprint>/tmp/<hu>.json` o equivalente) pasa
- [ ] `scripts/regression-check.js` contra las fixtures `HU-dryrun` y `HU-malformada` pasa (ver sección "Validación con fixtures")
- [ ] Si es MAJOR: script de migración existe y se corrió sobre `output/*/data.json`
- [ ] Si es MINOR o MAJOR: `hu-full-analyzer.md` actualizado con el cambio
- [ ] Si es MINOR o MAJOR: `sprint-dashboard.html` actualizado (con fallback si MINOR, sin fallback si MAJOR)
- [ ] Si afectó scoring o cobertura: `expectations_version` en fixtures bumpeado y nota del ajuste en el PR
- [ ] `node scripts/preflight-check.js` pasa
- [ ] Nota en el PR indicando tipo de bump (PATCH/MINOR/MAJOR) y motivo

---

## Histórico

- **2026-04-18 · v1.0.0** — Versión inicial formalizada. Introduce el campo `schema_version` opcional en outputs y el metadato `schemaVersion` en el schema. Outputs anteriores a esta fecha no declaran el campo y se asumen v1.0.0.
