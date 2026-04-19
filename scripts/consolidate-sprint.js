#!/usr/bin/env node
/**
 * consolidate-sprint.js
 *
 * Consolidador del Requirement Refinator. Lee N archivos con JSON de HU
 * (ya sea en formato crudo JSON o en formato tool-result con envoltura
 * [{type:"text", text:"```json\\n{...}\\n```"}]) y construye:
 *   - output/<sprint-id>/data.json
 *   - output/<sprint-id>/index.html (inyectando en templates/core/sprint-dashboard.html)
 *
 * Uso:
 *   node scripts/consolidate-sprint.js <manifest.json>
 *
 * manifest.json:
 *   {
 *     "sprint_id": "Sprint-144",
 *     "sprint_config": { ... },
 *     "config": { "proyecto_nombre": "...", "sprint_actual": 144 },
 *     "template_path": "templates/core/sprint-dashboard.html",
 *     "output_dir":    "output/Sprint-144",
 *     "hus": [
 *       {"hu_id": "HU-1425", "source": "/abs/path/to/tool-result-or-raw.json"},
 *       ...
 *     ]
 *   }
 */

'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function die(msg, code) { console.error('✗ ' + msg); process.exit(code || 1); }

function checkpointSave(sprintId, phase, data) {
  // Best-effort — si checkpoint.js falla no bloqueamos el flujo.
  try {
    const dataArg = data ? ` --data='${JSON.stringify(data).replace(/'/g, "'\\''")}'` : '';
    execSync(`node scripts/checkpoint.js save ${sprintId} ${phase}${dataArg}`, { stdio: 'ignore' });
  } catch (_) { /* silent */ }
}
function checkpointClear(sprintId) {
  try { execSync(`node scripts/checkpoint.js clear ${sprintId}`, { stdio: 'ignore' }); }
  catch (_) { /* silent */ }
}

function extractHuJson(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8').trim();
  // Try parse as direct JSON first
  try {
    const parsed = JSON.parse(raw);
    // Case A: direct HU JSON (has hu_id at top)
    if (parsed && typeof parsed === 'object' && parsed.hu_id) return parsed;
    // Case B: tool-result envelope [{type:"text", text:"```json\n{...}\n```"}]
    if (Array.isArray(parsed) && parsed[0] && parsed[0].type === 'text' && typeof parsed[0].text === 'string') {
      let t = parsed[0].text.trim();
      // strip leading ```json / ``` and trailing ```
      t = t.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
      return JSON.parse(t);
    }
    throw new Error('formato desconocido');
  } catch (e) {
    die(`no pude extraer JSON de ${filePath}: ${e.message}`);
  }
}

function avg(arr) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function round2(n) { return Math.round(n * 100) / 100; }

// Algunos analyzers emiten calificacion_iso como objeto de diagnóstico
// (ej. {formula, calculo, calificacion_iso: 4.1, ...} o {score_final: 3.5, ...}).
// El schema exige number. Normalizamos aquí para no romper el render del template
// (h.calificacion_iso.toFixed(1) falla si el valor es objeto).
function coerceCalificacionIso(v) {
  if (typeof v === 'number' && !isNaN(v)) return v;
  if (v && typeof v === 'object') {
    const keys = ['calificacion_iso', 'score_final', 'score', 'valor', 'value', 'result', 'final'];
    for (const k of keys) {
      if (typeof v[k] === 'number' && !isNaN(v[k])) return v[k];
    }
    for (const k of Object.keys(v)) {
      if (typeof v[k] === 'number' && v[k] >= 0 && v[k] <= 5) return v[k];
    }
  }
  return 0;
}

// Busca el primer número válido entre varias claves candidatas.
function firstNumber(obj, keys) {
  if (!obj || typeof obj !== 'object') return null;
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'number' && !isNaN(v)) return v;
    if (typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v))) return Number(v);
  }
  return null;
}

// Normaliza una tarea que pudo llegar con aliases (id→tarea_id, perfil→tipo,
// pert objeto → campos planos O/P/Pe/E, estimacion_horas → estimacion_pert).
// Sin esta normalización, el template no puede calcular horas ni distribución.
function normalizeTarea(t) {
  if (!t || typeof t !== 'object') return t;
  const out = { ...t };
  if (!out.tarea_id && out.id) out.tarea_id = out.id;
  if (!out.tipo && out.perfil) out.tipo = out.perfil;
  if (!out.tipo) out.tipo = 'DEV';
  out.tipo = String(out.tipo).toUpperCase().trim();
  // Extraer PERT desde out.pert (objeto) si los campos planos no existen
  const pertObj = (out.pert && typeof out.pert === 'object') ? out.pert : null;
  const estPertObj = (out.estimacion_pert && typeof out.estimacion_pert === 'object') ? out.estimacion_pert : null;
  const src = pertObj || estPertObj || {};
  const O  = firstNumber(src, ['optimista', 'optimista_O', 'O', 'o']);
  const P  = firstNumber(src, ['probable', 'probable_P', 'P', 'p', 'masProbable']);
  const Pe = firstNumber(src, ['pesimista', 'pesimista_Pe', 'Pe', 'pe']);
  const Ex = firstNumber(src, ['esperado', 'esperado_E', 'E', 'e', 'pert', 'valor']);
  if (out.estimacion_o == null && O != null) out.estimacion_o = O;
  if (out.estimacion_p == null && P != null) out.estimacion_p = P;
  if (out.estimacion_pe == null && Pe != null) out.estimacion_pe = Pe;
  // estimacion_pert: preferencia orden → número directo > horas > PERT calculado > E extraído
  let pertNum = null;
  if (typeof out.estimacion_pert === 'number') pertNum = out.estimacion_pert;
  else if (typeof out.estimacion_horas === 'number') pertNum = out.estimacion_horas;
  else if (typeof out.horas === 'number') pertNum = out.horas;
  else if (Ex != null) pertNum = Ex;
  else if (O != null && P != null && Pe != null) pertNum = (O + 4 * P + Pe) / 6;
  out.estimacion_pert = pertNum != null ? Math.round(pertNum * 100) / 100 : 0;
  // descripcion puede venir vacía pero haber titulo
  if (!out.descripcion && out.titulo) out.descripcion = out.titulo;
  return out;
}

// Normaliza TODA la HU para que cumpla el shape que espera el template:
//   - tareas[] (alias: tareas_tecnicas)
//   - estimacion_total_horas (alias: estimacion_pert_total / estimacion_total, o
//     cualquier objeto con horas_esperadas/total_horas/etc., o suma de tareas)
//   - distribucion_por_tipo calculada de las tareas si falta
// Toda normalización es loggeable para diagnóstico.
function normalizeHu(hu) {
  const notes = [];
  // 1) Array de tareas
  if (!Array.isArray(hu.tareas) && Array.isArray(hu.tareas_tecnicas)) {
    hu.tareas = hu.tareas_tecnicas;
    notes.push('tareas_tecnicas→tareas');
  }
  if (Array.isArray(hu.tareas)) {
    hu.tareas = hu.tareas.map(normalizeTarea);
  } else {
    hu.tareas = [];
  }
  // 2) estimacion_total_horas
  const totalKeys = ['horas_esperadas', 'total_horas', 'horas_total', 'horas_total_esperadas', 'horas_dev_esperadas', 'esperado', 'total'];
  if (typeof hu.estimacion_total_horas !== 'number' || isNaN(hu.estimacion_total_horas)) {
    let total = null;
    const candidates = [hu.estimacion_total_horas, hu.estimacion_pert_total, hu.estimacion_total, hu.horas_totales];
    for (const c of candidates) {
      if (typeof c === 'number' && !isNaN(c)) { total = c; break; }
      if (c && typeof c === 'object') {
        const n = firstNumber(c, totalKeys);
        if (n != null) { total = n; break; }
      }
    }
    if (total == null && hu.tareas.length) {
      total = hu.tareas.reduce((a, t) => a + (Number(t.estimacion_pert) || 0), 0);
      notes.push('total=Σtareas');
    }
    hu.estimacion_total_horas = total != null ? Math.round(total * 100) / 100 : 0;
    if (total != null) notes.push('estimacion_total_horas normalizado');
  }
  // 3) distribucion_por_tipo
  const validTipos = ['DEV', 'FE', 'QA', 'DB', 'DEVOPS', 'UX'];
  const distNecesita = !hu.distribucion_por_tipo || typeof hu.distribucion_por_tipo !== 'object' ||
    !validTipos.some(t => typeof hu.distribucion_por_tipo[t] === 'number');
  if (distNecesita && hu.tareas.length) {
    const dist = { DEV: 0, FE: 0, QA: 0, DB: 0, DEVOPS: 0, UX: 0 };
    hu.tareas.forEach(t => {
      const tipo = validTipos.includes(t.tipo) ? t.tipo : 'DEV';
      dist[tipo] += Number(t.estimacion_pert) || 0;
    });
    Object.keys(dist).forEach(k => { dist[k] = Math.round(dist[k] * 100) / 100; });
    hu.distribucion_por_tipo = dist;
    notes.push('distribucion_por_tipo calculada');
  }
  return { hu, notes };
}

function classifyLevel(c) {
  if (c >= 4.5) return 'Excelente';
  if (c >= 3.5) return 'Buena';
  if (c >= 2.5) return 'Aceptable';
  if (c >= 1.5) return 'Deficiente';
  return 'Crítica';
}

function computeMetrics(historias) {
  const cals = historias.map(h => Number(h.calificacion_iso) || 0);
  const iso29148 = historias.map(h => (Number(h.iso29148_score_norm) || 0) * 100);
  const invest   = historias.map(h => (Number(h.invest_score_norm) || 0) * 100);
  const iso25010 = historias.map(h => (Number(h.iso25010_score_norm) || 0) * 100);
  const horas    = historias.map(h => Number(h.estimacion_total_horas) || 0);
  const riesgosCrit = historias.reduce((acc, h) => acc + ((h.riesgos || []).filter(r =>
    String(r.nivel_riesgo_label || r.severidad || '').toLowerCase().match(/(alta|crit|inacept)/)).length), 0);
  const preguntas = historias.reduce((acc, h) => acc + ((h.preguntas_clarificacion || []).length), 0);
  const dist = { Excelente: 0, Buena: 0, Aceptable: 0, Deficiente: 0, 'Crítica': 0 };
  for (const c of cals) dist[classifyLevel(c)] = (dist[classifyLevel(c)] || 0) + 1;
  return {
    calificacion_iso_promedio: round2(avg(cals)),
    iso29148_avg: round2(avg(iso29148)),
    invest_avg:   round2(avg(invest)),
    iso25010_avg: round2(avg(iso25010)),
    total_horas:  round2(horas.reduce((a, b) => a + b, 0)),
    total_riesgos_criticos: riesgosCrit,
    total_preguntas: preguntas,
    distribucion_calificaciones: dist,
  };
}

function main() {
  const manifestPath = process.argv[2];
  if (!manifestPath) die('falta manifest.json como argumento');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  // Cargar data.json previa (si existe) para preservar campos persistentes
  // como historias[].specs[] que NO vienen del análisis sino del flujo /generar-specs.
  // Esto evita que una regeneración del dashboard borre los specs ya creados.
  let prevHistorias = [];
  const prevDataPath = path.join(manifest.output_dir, 'data.json');
  if (fs.existsSync(prevDataPath)) {
    try {
      const prev = JSON.parse(fs.readFileSync(prevDataPath, 'utf8'));
      prevHistorias = Array.isArray(prev.historias) ? prev.historias : [];
    } catch (_) { /* sin previa válida; sigue sin merge */ }
  }
  const prevByHu = {};
  for (const h of prevHistorias) { if (h && h.hu_id) prevByHu[h.hu_id] = h; }

  const historias = [];
  for (const h of manifest.hus) {
    if (!fs.existsSync(h.source)) die(`fuente no existe: ${h.source}`);
    const hu = extractHuJson(h.source);
    if (!hu.hu_id) hu.hu_id = h.hu_id; // fallback
    // Sanitizar campos numéricos que a veces vienen como objeto de diagnóstico
    const originalCal = hu.calificacion_iso;
    hu.calificacion_iso = coerceCalificacionIso(originalCal);
    if (originalCal !== hu.calificacion_iso && typeof originalCal === 'object') {
      console.log(`    ⚠ ${hu.hu_id}: calificacion_iso era objeto → normalizado a ${hu.calificacion_iso}`);
    }
    // Normalizar tareas + total horas + distribucion (aliases: tareas_tecnicas, id/perfil, pert objeto, estimacion_pert_total)
    const { notes } = normalizeHu(hu);
    if (notes.length) {
      console.log(`    ⚠ ${hu.hu_id}: ${notes.join(', ')}`);
    }
    // Preservar specs[] de la versión previa de esta misma HU
    const prev = prevByHu[hu.hu_id];
    if (prev && Array.isArray(prev.specs) && prev.specs.length > 0 && !Array.isArray(hu.specs)) {
      hu.specs = prev.specs;
    }
    historias.push(hu);
    const specCount = (hu.specs && hu.specs.length) || 0;
    console.log(`  ✓ ${hu.hu_id} (${(fs.readFileSync(h.source).length / 1024).toFixed(1)} KB)${specCount?' · '+specCount+' spec(s) preservado(s)':''}`);
  }

  const metricas = computeMetrics(historias);

  const data = {
    meta: {
      generado: new Date().toISOString(),
      version: '3.0',
      sprint_id: manifest.sprint_id,
    },
    config: manifest.config || { proyecto_nombre: 'Proyecto', sprint_actual: 1 },
    sprint_config: manifest.sprint_config,
    metricas_sprint: metricas,
    iteracion_anterior: null,
    historias,
  };

  fs.mkdirSync(manifest.output_dir, { recursive: true });
  const dataPath = path.join(manifest.output_dir, 'data.json');
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
  console.log(`[RR·CKPT] Fase 3 ✓ · data.json consolidado (${(fs.statSync(dataPath).size / 1024).toFixed(1)} KB)`);
  checkpointSave(manifest.sprint_id, 'consolidated', { data_path: dataPath });

  // ── Inyección del JSON en el template HTML ──
  // CONTRATO (regla A5 de la retrospectiva — NO MODIFICAR sin test de regresión):
  //   Pasar el JSON como FUNCIÓN de reemplazo, nunca como string directo.
  //   `String.prototype.replace(pat, str)` interpreta $& $' $` $$ $n como back-references;
  //   los montos en COP llevan "$" que corrompen el JSON inyectado → "Cargando datos…" infinito.
  //   `String.prototype.replace(pat, () => str)` NO interpreta y es seguro.
  const tmpl = fs.readFileSync(manifest.template_path, 'utf8');
  const marker = '/*__SPRINT_DATA__*/null';
  if (tmpl.indexOf(marker) === -1) die(`template sin marcador ${marker}`);
  const jsonStr = JSON.stringify(data);
  const injected = tmpl.replace(marker, () => jsonStr);
  const htmlPath = path.join(manifest.output_dir, 'index.html');
  fs.writeFileSync(htmlPath, injected);
  console.log(`[RR·CKPT] Fase 4 ✓ · index.html generado (${(fs.statSync(htmlPath).size / 1024).toFixed(1)} KB) → ${htmlPath}`);

  // ── Post-write validation (G3.1 + G3.2 de la retrospectiva) ──
  // Si el HTML generado tiene errores de sintaxis JS o JSON inválido, se elimina el archivo
  // y se aborta el flujo con un mensaje claro. Esto evita entregar al PM un HTML roto.
  const writtenHtml = fs.readFileSync(htmlPath, 'utf8');
  // (G3.1) Todos los <script> del HTML deben compilar como JS válido
  const scripts = [...writtenHtml.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).join(';\n');
  try {
    // eslint-disable-next-line no-new-func
    new Function(scripts);
  } catch (e) {
    try { fs.unlinkSync(htmlPath); } catch (_) {}
    die(`[RR·CKPT] Fase 4 ✗ · HTML generado tiene error de sintaxis JS: ${e.message}. index.html fue eliminado para no entregar un artefacto roto. Revisa templates/core/sprint-dashboard.html.`);
  }
  // (G3.2) El bloque window.__SPRINT_DATA__ debe ser JSON parseable
  const mData = writtenHtml.match(/window\.__SPRINT_DATA__ = ({[\s\S]*?});\s*<\/script>/);
  if (!mData) {
    try { fs.unlinkSync(htmlPath); } catch (_) {}
    die('[RR·CKPT] Fase 4 ✗ · No se encontró el bloque `window.__SPRINT_DATA__ = {...};` en el HTML generado. Verifica que el template tenga el marcador correcto.');
  }
  try {
    JSON.parse(mData[1]);
  } catch (e) {
    try { fs.unlinkSync(htmlPath); } catch (_) {}
    die(`[RR·CKPT] Fase 4 ✗ · JSON inyectado es inválido: ${e.message}. Causa típica: caracteres especiales ("$", "</script>") no escapados. index.html fue eliminado.`);
  }
  console.log(`[RR·CKPT] Fase 4 ✓ · post-write validation OK (JS parsea, JSON evaluable)`);
  checkpointSave(manifest.sprint_id, 'injected', { html_path: htmlPath });

  // Reporte
  console.log('');
  console.log('══════════════════════════════════════════════════════════════');
  console.log(`  ANÁLISIS DE ${manifest.sprint_id} COMPLETADO`);
  console.log('══════════════════════════════════════════════════════════════');
  console.log(`  ${historias.length} historias analizadas`);
  console.log(`  Calificación ISO promedio: ${metricas.calificacion_iso_promedio.toFixed(1)} / 5.0`);
  console.log('');
  console.log(`  Distribución:`);
  for (const [nivel, n] of Object.entries(metricas.distribucion_calificaciones)) {
    console.log(`    ${nivel.padEnd(12)}: ${n} HUs`);
  }
  console.log('');
  console.log(`  ${metricas.total_horas} horas estimadas totales`);
  console.log(`  ${metricas.total_riesgos_criticos} riesgos críticos`);
  console.log(`  ${metricas.total_preguntas} preguntas de clarificación`);
  console.log('');
  console.log(`  Dashboard: ${htmlPath}`);
  console.log('══════════════════════════════════════════════════════════════');
  console.log('[RR·CKPT] Fase 5 · listo');
  // Éxito completo: limpiar checkpoint para no confundir corridas futuras.
  checkpointClear(manifest.sprint_id);

  // Emitir siguiente paso sugerido al PM (U2 de Ola 2)
  try {
    execSync(`node scripts/next-step.js ${manifest.sprint_id}`, { stdio: 'inherit' });
  } catch (_) { /* next-step es informativo, no bloqueamos si falla */ }
}

// Exports para tests de regresión
module.exports = {
  normalizeHu,
  normalizeTarea,
  coerceCalificacionIso,
  firstNumber,
  computeMetrics,
  classifyLevel,
};

// Solo ejecutar main() si este archivo es invocado directamente (no require'd)
if (require.main === module) main();
