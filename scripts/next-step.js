#!/usr/bin/env node
/**
 * next-step.js
 *
 * Emite el siguiente paso sugerido al PM según el estado del sprint.
 * Cada skill invoca este script al final de su ejecución para dar guía explícita
 * al PM y reducir la carga cognitiva de recordar "¿qué viene ahora?".
 *
 * Uso:
 *   node scripts/next-step.js <sprint-id> [--state-file=path/to/data.json]
 *
 * Si no se pasa --state-file, usa el default: output/<sprint-id>/data.json
 *
 * Heurística del siguiente paso (en orden de prioridad):
 *   1. No existe output/<sprint>/data.json          → "ejecutar /refinar-sprint <sprint>"
 *   2. Alguna HU rechazada o con feedback           → "/refinar-sprint <sprint> --iteracion"
 *   3. < 100% HUs aprobadas                         → "abrir dashboard y revisar HUs pendientes"
 *   4. 100% aprobadas, sin mediciones EVM           → "registrar mediciones EVM en el dashboard"
 *   5. EVM con EV/BAC < 0.95                        → "continuar midiendo hasta EV ≥ BAC*0.95"
 *   6. Sprint cerrable + sin informe_cliente        → "/generar-informe <sprint>"
 *   7. informe_cliente ok + sin specs               → "/generar-specs <sprint>"
 *   8. Todo completo                                → "sprint cerrado; actualiza contextos para el próximo"
 *
 * Exit code: 0 siempre (es informativo, no falla el flujo).
 */

'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function worktreeInfoBlock(relPath) {
  // Best-effort — si el script no está o falla, no imprimir nada
  try {
    const args = ['node', 'scripts/worktree-info.js'];
    if (relPath) { args.push('--relative-path', relPath); }
    const out = execSync(args.join(' '), { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return out.trimEnd();
  } catch (_) { return ''; }
}

function banner(lines) {
  const maxLen = Math.max(...lines.map(l => l.length), 40);
  const bar = '━'.repeat(Math.min(maxLen + 4, 70));
  console.log(bar);
  lines.forEach(l => console.log('  ' + l));
  console.log(bar);
}

function finish(lines, relPath) {
  banner(lines);
  const wt = worktreeInfoBlock(relPath || null);
  if (wt) console.log(wt);
  process.exit(0);
}

function getArgs() {
  const args = process.argv.slice(2);
  if (!args.length) { console.error('Uso: node scripts/next-step.js <sprint-id> [--state-file=path]'); process.exit(1); }
  const sprintId = args[0];
  let stateFile = path.join('output', sprintId, 'data.json');
  for (const a of args.slice(1)) {
    if (a.startsWith('--state-file=')) stateFile = a.slice('--state-file='.length);
  }
  return { sprintId, stateFile };
}

function main() {
  const { sprintId, stateFile } = getArgs();

  // Caso 1: sin data.json → ejecutar refinar-sprint
  if (!fs.existsSync(stateFile)) {
    banner([
      `📋 Sprint ${sprintId} · estado: sin refinar aún`,
      '',
      '➡ SIGUIENTE PASO:',
      `   /refinar-sprint ${sprintId}`,
      '',
      '   (Requiere que las HUs existan en docs/HUs/' + sprintId + '/ y el contexto en docs/contexto/)',
    ]);
    const wt = worktreeInfoBlock();
    if (wt) console.log(wt);
    process.exit(0);
  }

  let data;
  try {
    data = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  } catch (e) {
    console.error('No pude leer/parsear ' + stateFile + ': ' + e.message);
    process.exit(0);
  }

  const historias = data.historias || [];
  const totalHus = historias.length;
  const aprobadas = historias.filter(h => h.pm_aprobada === true).length;
  const rechazadasOConFeedback = historias.filter(h =>
    h.pm_aprobada === false || (h.pm_feedback && String(h.pm_feedback).trim())
  ).length;

  // EVM state (puede no estar si el PM no abrió el dashboard aún)
  const evm = (data.evm && Array.isArray(data.evm.snapshots)) ? data.evm : { snapshots: [] };
  const snapshots = evm.snapshots || [];
  const bacTotal = (data.metricas_sprint && data.metricas_sprint.total_horas)
    ? data.metricas_sprint.total_horas * 80000
    : 0;
  const lastSnap = snapshots.length ? snapshots[snapshots.length - 1] : null;
  const lastEvPct = (lastSnap && bacTotal > 0) ? (+lastSnap.ev || 0) / bacTotal : 0;

  // Informe y specs (specs viven embebidos en cada HU, no a nivel sprint)
  const hasInforme = !!(data.informe_cliente);
  const huConSpecs = historias.filter(h => Array.isArray(h.specs) && h.specs.length > 0);
  const hasSpecs = huConSpecs.length > 0;
  const huConSpecsAprobados = huConSpecs.filter(h =>
    h.specs.some(s => String(s.estado || '').toUpperCase() === 'APROBADO')
  );
  const allSpecsApproved = hasSpecs && huConSpecs.length === totalHus && huConSpecsAprobados.length === totalHus;

  // Caso 2: HUs rechazadas o con feedback
  if (rechazadasOConFeedback > 0) {
    banner([
      `📋 Sprint ${sprintId} · ${rechazadasOConFeedback} HU(s) requieren re-análisis`,
      '',
      '➡ SIGUIENTE PASO:',
      `   /refinar-sprint ${sprintId} --iteracion`,
      '',
      '   Re-analiza solo las HUs rechazadas o con feedback, preserva las aprobadas.',
    ]);
    process.exit(0);
  }

  // Caso 3: < 100% aprobadas
  if (aprobadas < totalHus) {
    const pct = Math.round((aprobadas / Math.max(1, totalHus)) * 100);
    banner([
      `📋 Sprint ${sprintId} · ${aprobadas}/${totalHus} HUs aprobadas (${pct}%)`,
      '',
      '➡ SIGUIENTE PASO: Revisar HUs en el dashboard',
      `   1. Abrir output/${sprintId}/index.html`,
      '   2. Clic en "Revisar HU" en cada fila pendiente',
      '   3. Aprobar / rechazar / dejar feedback',
      '',
      '   Cuando todas estén decididas, vuelve a ejecutar esta skill para el siguiente paso.',
    ]);
    process.exit(0);
  }

  // Caso 4: 100% aprobadas, sin mediciones EVM
  if (snapshots.length === 0) {
    banner([
      `📋 Sprint ${sprintId} · 100% aprobado · 0 mediciones EVM`,
      '',
      '➡ SIGUIENTE PASO: Registrar avance en el dashboard',
      `   1. Abrir output/${sprintId}/index.html → tab "Avance del Sprint"`,
      '   2. Editar PV/EV/AC por HU según el avance real',
      '   3. Clic en "Registrar medición" para guardar snapshot diario',
      '',
      '   Registra al menos 1 medición para habilitar el cierre del sprint.',
    ]);
    process.exit(0);
  }

  // Caso 5: EVM con EV/BAC < 0.95 (sprint aún en ejecución)
  if (lastEvPct < 0.95) {
    banner([
      `📋 Sprint ${sprintId} · avance ${(lastEvPct * 100).toFixed(1)}% · ${snapshots.length} medición(es)`,
      '',
      '➡ SIGUIENTE PASO: Continuar midiendo hasta EV ≥ 95% del BAC',
      '   Registra mediciones adicionales en el dashboard conforme avance el sprint.',
      `   Cuando EV/BAC ≥ 0.95, este comando sugerirá "/generar-informe ${sprintId}".`,
    ]);
    process.exit(0);
  }

  // Caso 6: Sprint cerrable + sin informe
  if (!hasInforme) {
    banner([
      `📋 Sprint ${sprintId} · ✅ listo para cierre formal`,
      '',
      '➡ SIGUIENTE PASO: Generar informe ejecutivo al cliente',
      `   /generar-informe ${sprintId} --formato ejecutivo`,
      '',
      '   Enriquece data.json con la sección "informe_cliente" y la muestra como tab',
      '   dentro del dashboard. Sin archivos externos.',
    ]);
    process.exit(0);
  }

  // Caso 7: Informe hecho, sin specs
  if (!hasSpecs) {
    finish([
      `📋 Sprint ${sprintId} · informe cliente OK · sin specs ASDD`,
      '',
      '➡ SIGUIENTE PASO: Generar specs ASDD (Agentic Spec-Driven Development)',
      `   /generar-specs ${sprintId}`,
      '',
      '   Genera el contrato ejecutable por HU (5 secciones ASDD: Negocio·Arquitectura·',
      '   Calidad·UX·Restricciones + diagramas Mermaid + Gate 0). Disponibles para',
      '   descarga desde el dashboard → tab 📄 Specs.',
    ], `output/${sprintId}/index.html`);
  }

  // Caso 7.5: Specs en BORRADOR, falta APROBADO de algunos
  if (hasSpecs && !allSpecsApproved) {
    const pendientes = totalHus - huConSpecsAprobados.length;
    finish([
      `📋 Sprint ${sprintId} · ${huConSpecs.length}/${totalHus} HUs con spec · ${huConSpecsAprobados.length}/${totalHus} aprobados`,
      '',
      '➡ SIGUIENTE PASO: Revisar specs e iterar pendientes',
      `   1. Abrir output/${sprintId}/index.html → tab 📄 Specs`,
      '   2. Descargar el .md de cada spec, revisar con el equipo',
      `   3. Iterar con feedback: /generar-specs ${sprintId} --iterar <hu-id>`,
      '   4. Cuando el spec pase Gate 0 + apruebes manualmente → estado: APROBADO',
      '',
      `   Faltan ${pendientes} spec(s) por aprobar para cerrar el sprint.`,
    ], `output/${sprintId}/index.html`);
  }

  // Caso 8: Todo completo
  banner([
    `📋 Sprint ${sprintId} · 🎉 sprint completado`,
    '',
    '➡ SIGUIENTE PASO: Cierre y retrospectiva',
    '   1. Generar Bitácora PMO desde el dashboard (tab Avance → botones PDF/Word)',
    '   2. Compartir con el cliente y con PMO',
    '   3. Actualizar docs/contexto/contexto-funcional.md y contexto-tecnico.md',
    '      con los aprendizajes del sprint antes de arrancar el siguiente.',
    '',
    '   Cuando tengas el siguiente sprint listo: /refinar-sprint <nuevo-sprint-id>',
  ]);
  process.exit(0);
}

main();
