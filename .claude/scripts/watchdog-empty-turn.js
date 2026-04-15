#!/usr/bin/env node
/**
 * watchdog-empty-turn.js
 *
 * Hook `Stop` del Requirement Refinator: intenta detectar si el último turno
 * del asistente cerró sin tool call ni texto visible, y en ese caso emite una
 * señal en stderr para que el PM lo vea en el transcript del harness.
 *
 * Entrada: Claude Code le pasa al hook un JSON por stdin (formato depende del
 * runtime; aquí somos defensivos).
 *
 * Exit codes:
 *   0 = nada que hacer (o el watchdog no puede inspeccionar el transcript)
 *   2 = emitir bloqueo / llamar atención
 *
 * Diseño: NO rompemos si el formato de entrada no es el esperado. El objetivo
 * es "best-effort"; la protección real anti-tokenburn vive en la regla
 * `[RR·PAUSE]` dentro de CLAUDE.md.
 */

'use strict';

let input = '';
process.stdin.on('data', (c) => { input += c; });
process.stdin.on('end', () => {
  let parsed = null;
  try { parsed = JSON.parse(input); } catch (_e) { /* ignore */ }

  // No transcript accesible → salir limpio.
  if (!parsed || typeof parsed !== 'object') {
    process.exit(0);
  }

  // Heurísticas comunes: buscar un array de mensajes y mirar el último del assistant.
  const messages = parsed.messages || parsed.transcript || parsed.history;
  if (!Array.isArray(messages) || messages.length === 0) {
    process.exit(0);
  }

  // Encontrar el último turno del assistant.
  let last = null;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m && (m.role === 'assistant' || m.type === 'assistant')) { last = m; break; }
  }
  if (!last) process.exit(0);

  // Contenido puede ser string o array de bloques.
  let textLen = 0;
  let toolUseCount = 0;
  const content = last.content;

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
  }

  if (toolUseCount === 0 && textLen < 10) {
    process.stderr.write('[RR·WATCHDOG] ⚠ turno vacío detectado (0 tool calls, <10 chars de texto). ' +
                         'Pedir al asistente que emita [RR·PAUSE] con la causa antes de cerrar turnos.\n');
    process.exit(2);
  }

  process.exit(0);
});

// En algunos runtimes stdin no emite 'end' en seguida; forzar timeout corto.
setTimeout(() => { process.exit(0); }, 1000).unref();
