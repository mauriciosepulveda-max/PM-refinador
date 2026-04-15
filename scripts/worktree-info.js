#!/usr/bin/env node
/**
 * worktree-info.js — Requirement Refinator V3 (Ola 3 · U5)
 *
 * Detecta si el CWD está dentro de un git worktree del patrón
 * .claude/worktrees/<name>/ y emite un bloque informativo con:
 *   - Ruta del worktree (donde se generaron los archivos)
 *   - Ruta del repo principal (a donde típicamente los esperas ver)
 *
 * Evita la confusión del PM que clona el repo y no encuentra output/<sprint>/
 * porque los scripts escribieron al worktree.
 *
 * Uso:
 *   node scripts/worktree-info.js [--json] [--relative-path <path>]
 *
 * Si --relative-path se pasa, resuelve ambas rutas absolutas uniéndolo
 * al worktree root y al main repo root (útil para mostrar la ubicación
 * del dashboard en ambos lados).
 *
 * Exit codes: 0 = en worktree · 1 = no en worktree (no error)
 */

'use strict';
const fs = require('fs');
const path = require('path');

function detectWorktree() {
  const cwd = process.cwd();
  // Patrón esperado: <main_repo>/.claude/worktrees/<worktree_name>[/...]
  const marker = '/.claude/worktrees/';
  const idx = cwd.indexOf(marker);
  if (idx === -1) return null;
  const mainRepo = cwd.slice(0, idx);
  const rest = cwd.slice(idx + marker.length);
  const wtName = rest.split(path.sep)[0];
  const wtRoot = path.join(mainRepo, '.claude', 'worktrees', wtName);
  if (!fs.existsSync(wtRoot)) return null;
  return { mainRepo, wtRoot, wtName };
}

function main() {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const relIdx = args.indexOf('--relative-path');
  const relPath = relIdx >= 0 ? args[relIdx + 1] : null;

  const info = detectWorktree();
  if (!info) {
    if (json) console.log(JSON.stringify({ in_worktree: false }));
    process.exit(1);
  }

  const worktreeFull = relPath ? path.join(info.wtRoot, relPath) : info.wtRoot;
  const mainFull = relPath ? path.join(info.mainRepo, relPath) : info.mainRepo;

  if (json) {
    console.log(JSON.stringify({
      in_worktree: true,
      worktree_name: info.wtName,
      worktree_root: info.wtRoot,
      main_repo: info.mainRepo,
      worktree_path: worktreeFull,
      main_path: mainFull,
    }));
    process.exit(0);
  }

  console.log('  ℹ Estás trabajando en un git worktree:');
  console.log('     • Worktree:    ' + worktreeFull);
  console.log('     • Repo principal: ' + mainFull + '  (copia sincronizada, si aplica)');
  process.exit(0);
}

main();
