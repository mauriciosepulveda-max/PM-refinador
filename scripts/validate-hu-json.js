#!/usr/bin/env node
/**
 * validate-hu-json.js
 *
 * Valida un JSON de HU contra templates/core/hu-calidad.schema.json usando Ajv.
 *
 * Uso:
 *   node scripts/validate-hu-json.js <path_al_json>
 *   echo '{"hu_id":"..."}' | node scripts/validate-hu-json.js -
 *
 * Exit codes:
 *   0 = JSON válido contra schema
 *   1 = JSON inválido (imprime errores en stderr como JSON)
 *   2 = Error de entrada (archivo no existe, JSON malformado, schema roto)
 *
 * Dependencia: ajv (si no está instalado, caer a validación mínima hardcoded).
 */

'use strict';

const fs = require('fs');
const path = require('path');

const SCHEMA_PATH = path.join(__dirname, '..', 'templates', 'core', 'hu-calidad.schema.json');

function readInput(argv) {
  const arg = argv[2];
  if (!arg) {
    console.error(JSON.stringify({ ok: false, error: 'missing_arg', hint: 'uso: node scripts/validate-hu-json.js <path|->' }));
    process.exit(2);
  }
  if (arg === '-') {
    return fs.readFileSync(0, 'utf8');
  }
  if (!fs.existsSync(arg)) {
    console.error(JSON.stringify({ ok: false, error: 'file_not_found', path: arg }));
    process.exit(2);
  }
  return fs.readFileSync(arg, 'utf8');
}

function main() {
  // 1) cargar schema
  let schema;
  try {
    schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
  } catch (e) {
    console.error(JSON.stringify({ ok: false, error: 'schema_unreadable', path: SCHEMA_PATH, detail: String(e) }));
    process.exit(2);
  }

  // 2) cargar data
  let dataText = readInput(process.argv);
  let data;
  try {
    data = JSON.parse(dataText);
  } catch (e) {
    console.error(JSON.stringify({ ok: false, error: 'json_parse_error', detail: String(e) }));
    process.exit(1);
  }

  // 3) intentar Ajv (si está instalado)
  let Ajv;
  try {
    Ajv = require('ajv');
  } catch (_e) {
    // fallback: validación minimal hardcoded
    const minimalCheck = minimalValidate(schema, data);
    if (minimalCheck.ok) {
      console.log(JSON.stringify({ ok: true, validator: 'minimal-fallback' }));
      process.exit(0);
    }
    console.error(JSON.stringify({ ok: false, validator: 'minimal-fallback', errors: minimalCheck.errors }));
    process.exit(1);
  }

  const ajv = new Ajv({ allErrors: true, strict: false });
  const validate = ajv.compile(schema);
  const valid = validate(data);
  if (valid) {
    console.log(JSON.stringify({ ok: true, validator: 'ajv' }));
    process.exit(0);
  }
  console.error(JSON.stringify({ ok: false, validator: 'ajv', errors: validate.errors }));
  process.exit(1);
}

function minimalValidate(schema, data) {
  // Fallback cuando Ajv no está instalado.
  // Verifica required de top-level y algunas restricciones críticas.
  const errors = [];
  const required = schema.required || [];
  for (const k of required) {
    if (!(k in data)) errors.push({ path: '/', missing: k });
  }
  if (Array.isArray(data.criteriosAceptacion) && Array.isArray(data.criteriosOriginales)) {
    if (data.criteriosAceptacion.length < data.criteriosOriginales.length) {
      errors.push({ path: '/criteriosAceptacion', rule: 'length_>=_criteriosOriginales' });
    }
  }
  if (Array.isArray(data.tareas)) {
    for (let i = 0; i < data.tareas.length; i++) {
      const t = data.tareas[i];
      if (!t.dod || String(t.dod).trim().length < 15) {
        errors.push({ path: `/tareas/${i}/dod`, rule: 'min_length_15' });
      }
      if (typeof t.estimacion_o !== 'number' || typeof t.estimacion_p !== 'number' || typeof t.estimacion_pe !== 'number') {
        errors.push({ path: `/tareas/${i}`, rule: 'PERT_triple_required' });
      } else if (!(t.estimacion_o <= t.estimacion_p && t.estimacion_p <= t.estimacion_pe)) {
        errors.push({ path: `/tareas/${i}`, rule: 'PERT_coherence_O<=P<=Pe' });
      }
    }
  }
  if (typeof data.calificacion_iso !== 'undefined') {
    const n = Number(data.calificacion_iso);
    if (Number.isNaN(n) || n < 0 || n > 5) {
      errors.push({ path: '/calificacion_iso', rule: 'range_0_to_5' });
    }
  }
  return { ok: errors.length === 0, errors };
}

main();
