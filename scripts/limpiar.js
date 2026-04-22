#!/usr/bin/env node
/**
 * limpiar.js — Deja tu repo en estado "listo para empezar"
 *
 * Portable a Windows (cmd.exe/PowerShell/Git Bash), macOS y Linux.
 * Reemplazo del antiguo scripts/limpiar.sh (que hardcodeaba ~/Documents/PM-refinador).
 *
 * Uso:
 *    node scripts/limpiar.js
 *
 * Qué hace (en orden, todo automático):
 *   1. Se ancla a la raíz del repo (git rev-parse --show-toplevel) — funciona
 *      desde cualquier directorio del clone, sin depender de $HOME.
 *   2. Borra cualquier worktree/rama de sesión anterior (claude/*, feature/*)
 *   3. Te deja parado en "main"
 *   4. Baja los cambios más recientes de GitHub
 *   5. Reporta si todo quedó bien
 *
 * Seguro de ejecutar siempre que quieras. Solo toca ramas y worktrees de
 * sesiones generadas por Claude Code, nunca tu trabajo principal.
 *
 * Exit codes: 0 = OK · 1 = no es un repo git válido
 */

'use strict';
const { spawnSync } = require('child_process');
const path = require('path');

function git(args, opts) {
  return spawnSync('git', args, { encoding: 'utf8', shell: false, ...(opts || {}) });
}

// 1. Anclar a la raíz del repo PRINCIPAL (no a una worktree).
//    El primer entry de `git worktree list --porcelain` es siempre el main worktree.
//    Esto permite correr el script desde dentro de una worktree de Claude Code y
//    aun así "volver a casa" para limpiar.
const probe = git(['worktree', 'list', '--porcelain']);
if (probe.status !== 0 || !probe.stdout) {
  console.error('✗ No estás dentro de un repositorio git.');
  console.error('  Ejecuta `cd <ruta-del-repo>` antes de correr este script.');
  process.exit(1);
}
const mainEntry = probe.stdout.split(/\r?\n\r?\n/)[0] || '';
const mainLine = mainEntry.split(/\r?\n/).find(l => l.startsWith('worktree '));
if (!mainLine) {
  console.error('✗ No pude identificar el repositorio principal desde git worktree list.');
  process.exit(1);
}
const REPO_ROOT = mainLine.slice('worktree '.length).trim();
try { process.chdir(REPO_ROOT); }
catch (e) { console.error('✗ no puedo cambiar a ' + REPO_ROOT + ': ' + e.message); process.exit(1); }

console.log('🧹 Limpiando tu espacio de trabajo...');
console.log('');

// 2. Si no estamos en main, salir a main
const curBranch = git(['branch', '--show-current']).stdout.trim();
if (curBranch !== 'main') {
  git(['checkout', 'main'], { stdio: 'ignore' });
}

// 3. Remover worktrees de sesiones (excepto el principal)
const wtRaw = git(['worktree', 'list', '--porcelain']).stdout || '';
const blocks = wtRaw.split(/\r?\n\r?\n/);
const sessionWorktrees = [];
for (const block of blocks) {
  let wtPath = null;
  let branchRef = null;
  for (const line of block.split(/\r?\n/)) {
    if (line.startsWith('worktree ')) wtPath = line.slice('worktree '.length).trim();
    else if (line.startsWith('branch ')) branchRef = line.slice('branch '.length).trim();
  }
  if (!wtPath || !branchRef) continue;
  const m = branchRef.match(/^refs\/heads\/(claude|feature)\//);
  if (m && path.resolve(wtPath) !== path.resolve(REPO_ROOT)) {
    sessionWorktrees.push(wtPath);
  }
}

for (const wt of sessionWorktrees) {
  console.log(`  · Quitando worktree viejo: ${path.basename(wt)}`);
  git(['worktree', 'remove', '--force', wt], { stdio: 'ignore' });
}
git(['worktree', 'prune'], { stdio: 'ignore' });

// 4. Borrar ramas locales de sesión (claude/*, feature/*)
const branchRaw = git(['branch', '--list']).stdout || '';
const sessionBranches = [];
for (const raw of branchRaw.split(/\r?\n/)) {
  const line = raw.replace(/^[\s*+]+/, '').trim();
  if (!line) continue;
  if (/^(claude|feature)\//.test(line)) sessionBranches.push(line);
}
let deleted = 0;
for (const b of sessionBranches) {
  const r = git(['branch', '-D', b], { stdio: 'ignore' });
  if (r.status === 0) deleted += 1;
}
if (deleted > 0) console.log(`  · ${deleted} rama(s) de sesión borrada(s)`);

// 5. Sincronizar con GitHub
console.log('  · Bajando últimos cambios de GitHub...');
git(['fetch', '--prune'], { stdio: 'ignore' });
git(['pull', '--ff-only'], { stdio: 'ignore' });

// 6. Reporte final
console.log('');
const finalBranch = git(['branch', '--show-current']).stdout.trim();
const allBranches = (git(['branch', '--list']).stdout || '')
  .split(/\r?\n/)
  .map(l => l.trim())
  .filter(Boolean);
const branchCount = allBranches.length;
const lastCommit = (git(['log', '-1', '--oneline']).stdout || '').trim();

if (finalBranch === 'main' && branchCount === 1) {
  console.log('✅ LISTO. Tu espacio está limpio.');
  console.log('');
  console.log('   📍 Estás en: main');
  console.log(`   📝 Último cambio: ${lastCommit}`);
  console.log('');
  console.log('   Ya puedes abrir Claude Code y empezar a trabajar tranquilo.');
} else {
  console.log('⚠ Casi listo, pero hay algo raro. Muestra esto si pides ayuda:');
  console.log('');
  console.log(`   Rama actual: ${finalBranch}`);
  console.log(`   Ramas totales: ${branchCount}`);
  for (const b of allBranches) console.log('   ' + b);
}
