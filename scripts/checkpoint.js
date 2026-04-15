#!/usr/bin/env node
/**
 * checkpoint.js
 *
 * Persistencia de progreso parcial del pipeline para resumabilidad.
 * Usa `output/<sprint-id>/.checkpoint.json` como estado.
 *
 * Uso:
 *   node scripts/checkpoint.js save <sprint-id> <phase> [--data='<json>']
 *   node scripts/checkpoint.js load <sprint-id>
 *   node scripts/checkpoint.js clear <sprint-id>
 *   node scripts/checkpoint.js list-completed <sprint-id>
 *
 * Fases conocidas:
 *   preflight_ok | fase0_done | analysis_partial | analysis_complete | consolidated | injected | reported
 *
 * La fase `analysis_partial` guarda `hus_completed` (array de hu_id) y `hus_pending` (array).
 *
 * Al completar todo (phase = `reported`), se borra el checkpoint (marca éxito limpio).
 *
 * Invocación desde bash:
 *   node scripts/checkpoint.js save Sprint-144 analysis_partial --data='{"hus_completed":["HU-1"]}'
 *   node scripts/checkpoint.js list-completed Sprint-144   # → "HU-1 HU-2 ..." (stdout)
 *   node scripts/checkpoint.js clear Sprint-144
 *
 * Exit codes:
 *   0 = OK
 *   1 = comando inválido o error de IO
 *   2 = checkpoint no encontrado (solo en `load` y `list-completed`)
 */

'use strict';
const fs = require('fs');
const path = require('path');

function checkpointPath(sprintId) {
  return path.join('output', sprintId, '.checkpoint.json');
}
function tmpDir(sprintId) {
  return path.join('output', sprintId, 'tmp');
}

function parseArgs(argv) {
  const args = argv.slice(2);
  if (args.length < 2) return null;
  const [cmd, sprintId, ...rest] = args;
  let phase = null, data = {};
  if (cmd === 'save') {
    phase = rest[0];
    for (const a of rest.slice(1)) {
      if (a.startsWith('--data=')) {
        try { data = JSON.parse(a.slice('--data='.length)); }
        catch (e) { console.error('--data no es JSON válido: ' + e.message); process.exit(1); }
      }
    }
  }
  return { cmd, sprintId, phase, data };
}

function cmdSave(sprintId, phase, data) {
  if (!phase) { console.error('save requiere <phase>'); process.exit(1); }
  const cp = checkpointPath(sprintId);
  fs.mkdirSync(path.dirname(cp), { recursive: true });
  const payload = {
    sprint_id: sprintId,
    phase,
    timestamp: new Date().toISOString(),
    ...data,
  };
  fs.writeFileSync(cp, JSON.stringify(payload, null, 2));
  console.log(`[checkpoint] saved · ${sprintId} · phase=${phase}`);
}

function cmdLoad(sprintId) {
  const cp = checkpointPath(sprintId);
  if (!fs.existsSync(cp)) {
    console.error(`[checkpoint] not found: ${cp}`);
    process.exit(2);
  }
  const raw = fs.readFileSync(cp, 'utf8');
  console.log(raw);
}

function cmdClear(sprintId) {
  const cp = checkpointPath(sprintId);
  if (fs.existsSync(cp)) {
    fs.unlinkSync(cp);
    console.log(`[checkpoint] cleared · ${cp}`);
  } else {
    console.log(`[checkpoint] nothing to clear at ${cp}`);
  }
}

function cmdListCompleted(sprintId) {
  // Heurística: cualquier <hu_id>.json dentro de tmp/ que parsee como JSON con hu_id
  // es una HU completada. No depende del checkpoint (self-describing).
  const tmp = tmpDir(sprintId);
  if (!fs.existsSync(tmp)) { process.exit(0); }
  const files = fs.readdirSync(tmp).filter(f => f.endsWith('.json') && f !== 'manifest.json');
  const completed = [];
  for (const f of files) {
    try {
      const j = JSON.parse(fs.readFileSync(path.join(tmp, f), 'utf8'));
      if (j && j.hu_id) completed.push(j.hu_id);
    } catch (_) { /* skip invalid */ }
  }
  console.log(completed.join(' '));
}

function main() {
  const parsed = parseArgs(process.argv);
  if (!parsed) {
    console.error('Uso: node scripts/checkpoint.js <save|load|clear|list-completed> <sprint-id> [<phase>] [--data=<json>]');
    process.exit(1);
  }
  const { cmd, sprintId, phase, data } = parsed;
  switch (cmd) {
    case 'save':           cmdSave(sprintId, phase, data); break;
    case 'load':           cmdLoad(sprintId); break;
    case 'clear':          cmdClear(sprintId); break;
    case 'list-completed': cmdListCompleted(sprintId); break;
    default: console.error(`Comando desconocido: ${cmd}`); process.exit(1);
  }
}

main();
