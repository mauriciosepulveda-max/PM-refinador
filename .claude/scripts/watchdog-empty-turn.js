#!/usr/bin/env node
/**
 * watchdog-empty-turn.js
 *
 * Hook `Stop` del Requirement Refinator: detecta si el último turno del
 * asistente cerró sin tool call ni texto útil, y en ese caso emite una señal
 * en stderr + exit 2 para que el PM lo vea en el transcript del harness.
 *
 * Contrato de entrada (Claude Code Stop hook):
 *   {
 *     "session_id": "<uuid>",
 *     "transcript_path": "/abs/path/to/transcript.jsonl",
 *     "hook_event_name": "Stop",
 *     "stop_hook_active": false
 *   }
 *
 * Exit codes:
 *   0 = turno válido (o no inspeccionable de forma segura)
 *   2 = turno vacío detectado → stderr con señal, el harness muestra al PM
 *
 * Diseño defensivo: cualquier fallo al parsear input, leer el JSONL o
 * encontrar el último turno → exit 0 (no bloquear). La detección solo
 * dispara cuando tenemos evidencia clara de turno vacío.
 */

'use strict';

const fs = require('fs');

let input = '';
process.stdin.on('data', (c) => { input += c; });
process.stdin.on('end', () => {
  let parsed = null;
  try { parsed = JSON.parse(input); } catch (_e) { process.exit(0); }
  if (!parsed || typeof parsed !== 'object') process.exit(0);

  // Evitar recursión: si el hook ya corrió en este turno, salir.
  if (parsed.stop_hook_active === true) process.exit(0);

  const transcriptPath = parsed.transcript_path;
  if (typeof transcriptPath !== 'string' || transcriptPath.length === 0) {
    // Formato no reconocido → no podemos inspeccionar, salir limpio.
    process.exit(0);
  }

  let raw;
  try {
    raw = fs.readFileSync(transcriptPath, 'utf8');
  } catch (_e) {
    process.exit(0);
  }

  const lines = raw.split('\n').filter((l) => l.trim().length > 0);
  if (lines.length === 0) process.exit(0);

  // Buscar la última entrada del assistant en el JSONL (recorrido inverso).
  let lastAssistant = null;
  for (let i = lines.length - 1; i >= 0; i--) {
    let entry;
    try { entry = JSON.parse(lines[i]); } catch (_e) { continue; }
    if (!entry || typeof entry !== 'object') continue;
    const isAssistant =
      entry.type === 'assistant' ||
      entry.role === 'assistant' ||
      (entry.message && entry.message.role === 'assistant');
    if (isAssistant) { lastAssistant = entry; break; }
  }
  if (!lastAssistant) process.exit(0);

  // El contenido puede venir en entry.content, entry.message.content o similar.
  const content =
    (lastAssistant.message && lastAssistant.message.content) ||
    lastAssistant.content ||
    null;

  let textLen = 0;
  let toolUseCount = 0;

  const countBlock = (b) => {
    if (!b) return;
    if (typeof b === 'string') { textLen += b.length; return; }
    if (b.type === 'text' && typeof b.text === 'string') { textLen += b.text.length; return; }
    if (b.type === 'tool_use' || b.type === 'tool_call') { toolUseCount += 1; return; }
  };

  if (typeof content === 'string') {
    textLen += content.length;
  } else if (Array.isArray(content)) {
    for (const b of content) countBlock(b);
  } else if (content && typeof content === 'object') {
    countBlock(content);
  } else {
    // Sin contenido parseable → no bloqueamos.
    process.exit(0);
  }

  if (toolUseCount === 0 && textLen < 10) {
    process.stderr.write(
      '[RR·WATCHDOG] ⚠ turno vacío detectado (0 tool calls, <10 chars de texto). ' +
      'El asistente DEBE emitir [RR·PAUSE] con la causa antes de cerrar turnos sin acción.\n'
    );
    process.exit(2);
  }

  process.exit(0);
});

// Timeout defensivo si stdin no cierra.
setTimeout(() => { process.exit(0); }, 2000).unref();
