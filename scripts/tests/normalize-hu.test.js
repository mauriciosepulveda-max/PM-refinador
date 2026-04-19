#!/usr/bin/env node
/**
 * Test de regresión para la normalización de HUs en consolidate-sprint.js.
 *
 * Cubre los bugs detectados en Sprint-X (abril 2026):
 *   1) calificacion_iso viene como objeto de diagnóstico en vez de número.
 *   2) tareas viene con alias `tareas_tecnicas`.
 *   3) tareas individuales usan aliases (id, perfil, pert objeto, estimacion_horas).
 *   4) estimacion_total_horas viene como objeto con varias claves posibles.
 *   5) distribucion_por_tipo no viene y debe calcularse de las tareas.
 *
 * Ejecución:
 *   node scripts/tests/normalize-hu.test.js
 *
 * Exit 0 = todos los casos pasaron · Exit 1 = al menos 1 falló.
 */
'use strict';

const path = require('path');
const {
  normalizeHu,
  normalizeTarea,
  coerceCalificacionIso,
  firstNumber,
} = require(path.join('..', 'consolidate-sprint.js'));

let pass = 0, fail = 0;
const failures = [];

function assertEq(actual, expected, label) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { pass++; }
  else {
    fail++;
    failures.push(`  ✗ ${label}\n      esperado: ${JSON.stringify(expected)}\n      recibido: ${JSON.stringify(actual)}`);
  }
}

function assertApprox(actual, expected, tol, label) {
  const ok = typeof actual === 'number' && typeof expected === 'number' && Math.abs(actual - expected) <= tol;
  if (ok) pass++;
  else {
    fail++;
    failures.push(`  ✗ ${label}\n      esperado ~ ${expected} (±${tol})\n      recibido: ${actual}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// CASO 1 — calificacion_iso como objeto de diagnóstico
// ═══════════════════════════════════════════════════════════════════════
console.log('[1] coerceCalificacionIso');
assertEq(coerceCalificacionIso(3.5), 3.5, 'número directo pasa intacto');
assertEq(coerceCalificacionIso({ calificacion_iso: 4.1, formula: 'x' }), 4.1, 'objeto con key calificacion_iso');
assertEq(coerceCalificacionIso({ score_final: 3.5, interpretacion: 'x' }), 3.5, 'objeto con score_final');
assertEq(coerceCalificacionIso({ score: 2.8 }), 2.8, 'objeto con score');
assertEq(coerceCalificacionIso({ detalle: { foo: 1 }, valor: 4.2 }), 4.2, 'objeto con valor');
assertEq(coerceCalificacionIso(null), 0, 'null → 0');
assertEq(coerceCalificacionIso('abc'), 0, 'string inválido → 0');

// ═══════════════════════════════════════════════════════════════════════
// CASO 2 — tareas_tecnicas + aliases en cada tarea
// ═══════════════════════════════════════════════════════════════════════
console.log('[2] normalizeTarea: aliases');
const t1 = normalizeTarea({
  id: 'T-01',
  titulo: 'Configurar sponsor',
  perfil: 'DEV',
  descripcion: 'Coordinar con Líder Técnico',
  pert: { optimista: 0.5, probable: 1, pesimista: 3, esperado: 1.25 },
});
assertEq(t1.tarea_id, 'T-01', 'id → tarea_id');
assertEq(t1.tipo, 'DEV', 'perfil → tipo');
assertEq(t1.estimacion_o, 0.5, 'pert.optimista → estimacion_o');
assertEq(t1.estimacion_p, 1, 'pert.probable → estimacion_p');
assertEq(t1.estimacion_pe, 3, 'pert.pesimista → estimacion_pe');
assertEq(t1.estimacion_pert, 1.25, 'pert.esperado → estimacion_pert');

console.log('[3] normalizeTarea: pert con sufijos _O/_P/_Pe/_E');
const t2 = normalizeTarea({
  id: 'T-02',
  perfil: 'QA',
  descripcion: 'Pruebas',
  estimacion_pert: { optimista_O: 2, probable_P: 4, pesimista_Pe: 8, esperado_E: 4.33 },
});
assertEq(t2.estimacion_o, 2, 'optimista_O');
assertEq(t2.estimacion_p, 4, 'probable_P');
assertEq(t2.estimacion_pe, 8, 'pesimista_Pe');
assertEq(t2.estimacion_pert, 4.33, 'esperado_E');

console.log('[4] normalizeTarea: pert sin esperado, calcula E');
const t3 = normalizeTarea({
  id: 'T-03',
  perfil: 'DEV',
  descripcion: 'Algo',
  pert: { optimista: 3, probable: 5, pesimista: 8 },
});
assertApprox(t3.estimacion_pert, (3 + 4 * 5 + 8) / 6, 0.01, 'calcula E=(O+4P+Pe)/6');

console.log('[5] normalizeTarea: estimacion_horas como número');
const t4 = normalizeTarea({
  id: 'T-04',
  perfil: 'DEV',
  descripcion: 'Tarea con horas directas',
  pert: { optimista: 2, probable: 3, pesimista: 5 },
  estimacion_horas: 3.2,
});
assertEq(t4.estimacion_pert, 3.2, 'estimacion_horas → estimacion_pert');

console.log('[6] normalizeTarea: tipo default DEV si no viene');
const t5 = normalizeTarea({ id: 'T-05', descripcion: 'Sin perfil' });
assertEq(t5.tipo, 'DEV', 'tipo default DEV');

// ═══════════════════════════════════════════════════════════════════════
// CASO 3 — HU completa con todos los aliases (shape real del Sprint-X)
// ═══════════════════════════════════════════════════════════════════════
console.log('[7] normalizeHu: HU completa con tareas_tecnicas + estimacion_pert_total objeto');
const huRaw = {
  hu_id: 'HU-TEST-01',
  tareas_tecnicas: [
    { id: 'T-01', perfil: 'DEV', descripcion: 'Config',  pert: { optimista: 1, probable: 2, pesimista: 4, esperado: 2.17 } },
    { id: 'T-02', perfil: 'DEV', descripcion: 'Impl',    pert: { optimista: 2, probable: 4, pesimista: 6, esperado: 4 } },
    { id: 'T-03', perfil: 'QA',  descripcion: 'Pruebas', pert: { optimista: 1, probable: 2, pesimista: 3, esperado: 2 } },
  ],
  estimacion_pert_total: {
    horas_esperadas: 8.17,
    horas_optimistas: 4,
    horas_pesimistas: 13,
  },
};
const { hu: huNorm, notes } = normalizeHu(huRaw);
assertEq(Array.isArray(huNorm.tareas), true, 'tareas[] es array');
assertEq(huNorm.tareas.length, 3, '3 tareas normalizadas');
assertEq(huNorm.tareas[0].tarea_id, 'T-01', 'primera tarea tiene tarea_id');
assertEq(huNorm.tareas[0].tipo, 'DEV', 'primera tarea tiene tipo DEV');
assertApprox(huNorm.estimacion_total_horas, 8.17, 0.01, 'estimacion_total_horas extraído del objeto');
assertEq(typeof huNorm.distribucion_por_tipo, 'object', 'distribucion_por_tipo existe');
assertApprox(huNorm.distribucion_por_tipo.DEV, 2.17 + 4, 0.01, 'DEV suma = 6.17');
assertApprox(huNorm.distribucion_por_tipo.QA, 2, 0.01, 'QA suma = 2');
assertEq(notes.includes('tareas_tecnicas→tareas'), true, 'note tareas_tecnicas→tareas');
assertEq(notes.includes('distribucion_por_tipo calculada'), true, 'note distribucion calculada');

// ═══════════════════════════════════════════════════════════════════════
// CASO 4 — HU canónica (shape correcto): NO debe romperse
// ═══════════════════════════════════════════════════════════════════════
console.log('[8] normalizeHu: shape canónico pasa sin alterar total/tareas');
const huCanon = {
  hu_id: 'HU-CANON',
  tareas: [
    { tarea_id: 'T-01', tipo: 'DEV', descripcion: 'x', estimacion_o: 2, estimacion_p: 4, estimacion_pe: 8, estimacion_pert: 4.33 },
    { tarea_id: 'T-02', tipo: 'QA',  descripcion: 'y', estimacion_o: 1, estimacion_p: 2, estimacion_pe: 3, estimacion_pert: 2 },
  ],
  estimacion_total_horas: 6.33,
  distribucion_por_tipo: { DEV: 4.33, FE: 0, QA: 2, DB: 0, DEVOPS: 0, UX: 0 },
};
const { hu: huCanonNorm } = normalizeHu(JSON.parse(JSON.stringify(huCanon)));
assertEq(huCanonNorm.estimacion_total_horas, 6.33, 'total canónico intacto');
assertEq(huCanonNorm.tareas.length, 2, 'tareas canónicas intactas');
assertEq(huCanonNorm.distribucion_por_tipo.DEV, 4.33, 'distribucion canónica intacta');

// ═══════════════════════════════════════════════════════════════════════
// CASO 5 — HU sin tareas ni total (peor caso): no debe crashear
// ═══════════════════════════════════════════════════════════════════════
console.log('[9] normalizeHu: HU vacía produce defaults seguros (0, [])');
const huEmpty = { hu_id: 'HU-EMPTY' };
const { hu: huEmptyNorm } = normalizeHu(huEmpty);
assertEq(huEmptyNorm.estimacion_total_horas, 0, 'total=0 si no hay datos');
assertEq(huEmptyNorm.tareas.length, 0, 'tareas=[] si no hay datos');

// ═══════════════════════════════════════════════════════════════════════
// CASO 6 — HU con tareas pero sin total: total se calcula de la suma
// ═══════════════════════════════════════════════════════════════════════
console.log('[10] normalizeHu: total=Σ(estimacion_pert) cuando el campo falta');
const huNoTotal = {
  hu_id: 'HU-NO-TOTAL',
  tareas_tecnicas: [
    { id: 'T-01', perfil: 'DEV', descripcion: 'x', estimacion_horas: 3 },
    { id: 'T-02', perfil: 'QA',  descripcion: 'y', estimacion_horas: 2 },
  ],
};
const { hu: huNoTotalNorm, notes: notesNoTotal } = normalizeHu(huNoTotal);
assertEq(huNoTotalNorm.estimacion_total_horas, 5, 'total=3+2=5');
assertEq(notesNoTotal.includes('total=Σtareas'), true, 'note total=Σtareas');

// ═══════════════════════════════════════════════════════════════════════
// Reporte
// ═══════════════════════════════════════════════════════════════════════
console.log('');
console.log('═══════════════════════════════════════════════════════════════════════');
console.log(`  Tests: ${pass} passed, ${fail} failed`);
console.log('═══════════════════════════════════════════════════════════════════════');
if (fail > 0) {
  console.log('');
  console.log('FALLOS:');
  failures.forEach(f => console.log(f));
  process.exit(1);
}
process.exit(0);
