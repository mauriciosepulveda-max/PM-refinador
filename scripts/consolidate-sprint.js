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

function die(msg, code) { console.error('✗ ' + msg); process.exit(code || 1); }

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

  const historias = [];
  for (const h of manifest.hus) {
    if (!fs.existsSync(h.source)) die(`fuente no existe: ${h.source}`);
    const hu = extractHuJson(h.source);
    if (!hu.hu_id) hu.hu_id = h.hu_id; // fallback
    historias.push(hu);
    console.log(`  ✓ ${hu.hu_id} (${(fs.readFileSync(h.source).length / 1024).toFixed(1)} KB)`);
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
}

main();
