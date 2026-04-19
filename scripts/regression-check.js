#!/usr/bin/env node
/**
 * regression-check.js
 *
 * Valida un JSON de output del hu-full-analyzer contra un archivo de
 * expectations (golden) que describe qué debería producir el analyzer para
 * una HU-fixture dada.
 *
 * A diferencia de validate-hu-json.js (que valida estructura contra el schema),
 * este script valida CALIDAD: rangos de scores, coberturas mínimas de CAs,
 * umbrales de preguntas HITL, coherencia PERT, etc. Los rangos toleran la
 * no-determinismo del LLM sin permitir regresiones silenciosas.
 *
 * Uso:
 *   node scripts/regression-check.js <expectations.json> <output.json>
 *
 * Exit codes:
 *   0 = todas las assertions críticas pasan (warnings reportados, no fallan)
 *   1 = al menos 1 assertion critical falló
 *   2 = error de entrada (archivos faltantes, JSON malformado, expectations corrupto)
 *
 * Output: JSON a stdout con { ok, fixture_id, expectations_version, summary: { total, passed, failed_critical, failed_warning }, results: [...] }
 */

'use strict';

const fs = require('fs');

// ── Resolución de paths dentro del objeto ──────────────────────────────
// Soporta: "a.b.c", "a.b.length", "tareas[*].dod" (iterar array), "narrativa_refinada.rol"

function getByPath(obj, path) {
  if (!path) return obj;
  const segments = path.split('.');
  let current = obj;
  for (const seg of segments) {
    if (current === null || current === undefined) return undefined;
    if (seg === 'length') {
      if (Array.isArray(current) || typeof current === 'string') return current.length;
      return undefined;
    }
    const arrayIterMatch = seg.match(/^([^[]+)\[\*\]$/);
    if (arrayIterMatch) {
      const arrName = arrayIterMatch[1];
      const arr = current[arrName];
      if (!Array.isArray(arr)) return undefined;
      return { __iter: arr, __rest: segments.slice(segments.indexOf(seg) + 1) };
    }
    current = current[seg];
  }
  return current;
}

// ── Evaluadores de reglas ──────────────────────────────────────────────

const evaluators = {
  equals(actual, assertion) {
    return { pass: actual === assertion.value, actual, expected: `equals ${JSON.stringify(assertion.value)}` };
  },
  matches(actual, assertion) {
    if (typeof actual !== 'string') return { pass: false, actual, expected: `matches /${assertion.value}/ (not a string)` };
    const re = new RegExp(assertion.value);
    return { pass: re.test(actual), actual, expected: `matches /${assertion.value}/` };
  },
  type(actual, assertion) {
    const expected = assertion.value;
    const got = Array.isArray(actual) ? 'array' : typeof actual;
    return { pass: got === expected, actual: got, expected: `type ${expected}` };
  },
  minLength(actual, assertion) {
    const len = typeof actual === 'string' ? actual.length : (Array.isArray(actual) ? actual.length : -1);
    return { pass: len >= assertion.value, actual: len, expected: `minLength ${assertion.value}` };
  },
  min(actual, assertion) {
    const n = Number(actual);
    return { pass: !Number.isNaN(n) && n >= assertion.value, actual, expected: `>= ${assertion.value}` };
  },
  max(actual, assertion) {
    const n = Number(actual);
    return { pass: !Number.isNaN(n) && n <= assertion.value, actual, expected: `<= ${assertion.value}` };
  },
  between(actual, assertion) {
    const n = Number(actual);
    const ok = !Number.isNaN(n) && n >= assertion.min && n <= assertion.max;
    return { pass: ok, actual, expected: `between [${assertion.min}, ${assertion.max}]` };
  },
  in(actual, assertion) {
    return { pass: assertion.values.includes(actual), actual, expected: `in ${JSON.stringify(assertion.values)}` };
  },
  contains_any(actual, assertion) {
    if (typeof actual !== 'string') return { pass: false, actual, expected: `contains_any (not a string)` };
    const hit = assertion.values.some((v) => actual.includes(v));
    return { pass: hit, actual, expected: `contains_any ${JSON.stringify(assertion.values)}` };
  },
  minArrayLength(actual, assertion) {
    const ok = Array.isArray(actual) && actual.length >= assertion.value;
    return { pass: ok, actual: Array.isArray(actual) ? actual.length : typeof actual, expected: `array with length >= ${assertion.value}` };
  },

  // ── Reglas de iteración sobre arrays (path con [*]) ──
  each_minLength(iterResult, assertion) {
    if (!iterResult || !Array.isArray(iterResult.__iter)) return { pass: false, actual: iterResult, expected: `each_minLength needs array iteration` };
    const failures = [];
    iterResult.__iter.forEach((item, i) => {
      const val = getByPath(item, iterResult.__rest.join('.'));
      const len = typeof val === 'string' ? val.length : -1;
      if (len < assertion.value) failures.push({ index: i, value: val, length: len });
    });
    return { pass: failures.length === 0, actual: `${iterResult.__iter.length} items`, expected: `each minLength ${assertion.value}`, failures };
  },
  each_min(iterResult, assertion) {
    if (!iterResult || !Array.isArray(iterResult.__iter)) return { pass: false, actual: iterResult, expected: `each_min needs array iteration` };
    const failures = [];
    iterResult.__iter.forEach((item, i) => {
      const val = getByPath(item, iterResult.__rest.join('.'));
      const n = Number(val);
      if (Number.isNaN(n) || n < assertion.value) failures.push({ index: i, value: val });
    });
    return { pass: failures.length === 0, actual: `${iterResult.__iter.length} items`, expected: `each >= ${assertion.value}`, failures };
  },
  each_pert_coherent(iterResult, _assertion) {
    if (!iterResult || !Array.isArray(iterResult.__iter)) return { pass: false, actual: iterResult, expected: `each_pert_coherent needs array iteration` };
    const failures = [];
    iterResult.__iter.forEach((item, i) => {
      const o = Number(item.estimacion_o);
      const p = Number(item.estimacion_p);
      const pe = Number(item.estimacion_pe);
      if ([o, p, pe].some(Number.isNaN)) { failures.push({ index: i, reason: 'PERT values not numeric', o, p, pe }); return; }
      if (!(o <= p && p <= pe)) failures.push({ index: i, reason: 'PERT not coherent', o, p, pe });
    });
    return { pass: failures.length === 0, actual: `${iterResult.__iter.length} tareas`, expected: `O <= P <= Pe per task`, failures };
  }
};

// ── Main ───────────────────────────────────────────────────────────────

function main() {
  const [, , expectationsPath, outputPath] = process.argv;
  if (!expectationsPath || !outputPath) {
    console.error(JSON.stringify({ ok: false, error: 'missing_args', hint: 'uso: node scripts/regression-check.js <expectations.json> <output.json>' }));
    process.exit(2);
  }

  let expectations;
  try {
    expectations = JSON.parse(fs.readFileSync(expectationsPath, 'utf8'));
  } catch (e) {
    console.error(JSON.stringify({ ok: false, error: 'expectations_unreadable', path: expectationsPath, detail: String(e) }));
    process.exit(2);
  }

  let output;
  try {
    output = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  } catch (e) {
    console.error(JSON.stringify({ ok: false, error: 'output_unreadable', path: outputPath, detail: String(e) }));
    process.exit(2);
  }

  if (!Array.isArray(expectations.assertions)) {
    console.error(JSON.stringify({ ok: false, error: 'expectations_missing_assertions' }));
    process.exit(2);
  }

  const results = [];
  let criticalFailed = 0;
  let warningFailed = 0;
  let passed = 0;

  for (const assertion of expectations.assertions) {
    const evaluator = evaluators[assertion.rule];
    if (!evaluator) {
      results.push({ ...assertion, pass: false, error: `unknown rule: ${assertion.rule}` });
      if (assertion.severity === 'critical') criticalFailed++;
      else warningFailed++;
      continue;
    }
    const actualVal = getByPath(output, assertion.path);
    const res = evaluator(actualVal, assertion);
    const entry = { path: assertion.path, rule: assertion.rule, severity: assertion.severity || 'warning', pass: res.pass, actual: res.actual, expected: res.expected };
    if (res.failures) entry.failures = res.failures;
    results.push(entry);
    if (res.pass) passed++;
    else if ((assertion.severity || 'warning') === 'critical') criticalFailed++;
    else warningFailed++;
  }

  const summary = {
    total: expectations.assertions.length,
    passed,
    failed_critical: criticalFailed,
    failed_warning: warningFailed
  };

  const report = {
    ok: criticalFailed === 0,
    fixture_id: expectations.fixture_id,
    expectations_version: expectations.expectations_version,
    summary,
    results
  };

  console.log(JSON.stringify(report, null, 2));
  process.exit(criticalFailed === 0 ? 0 : 1);
}

main();
