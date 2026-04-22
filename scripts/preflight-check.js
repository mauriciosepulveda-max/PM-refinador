#!/usr/bin/env node
/**
 * preflight-check.js — Requirement Refinator
 *
 * Chequeos que detectan fallos del framework antes de ejecutar /refinar-sprint.
 * Portable a Windows (cmd.exe/PowerShell/Git Bash), macOS y Linux.
 *
 * Diseñado para correr como:
 *   - Primer paso de Fase -1 del orchestrator (defensa runtime)
 *   - Pre-commit hook local (defensa desarrollador)
 *   - Verificación manual: `node scripts/preflight-check.js`
 *
 * Exit codes: 0=OK, 1=fallos encontrados, 2=error de ejecución
 *
 * Los chequeos NO dependen de jq, ajv ni dependencias externas. Solo Node ≥ 18.
 */

'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function resolveRoot() {
  // Preferir raíz del repo; si no hay git, usar cwd (comportamiento del .sh original).
  const r = spawnSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8', shell: false });
  if (r.status === 0 && r.stdout) return r.stdout.trim();
  return process.cwd();
}

const ROOT = resolveRoot();
try { process.chdir(ROOT); }
catch (e) { console.error('✗ no puedo cambiar a ' + ROOT + ': ' + e.message); process.exit(2); }

let errors = 0;
let warnings = 0;

// ─────────────────────────────────────────────────────────────────────────────
// 1/4 · Merge markers en archivos críticos
// ─────────────────────────────────────────────────────────────────────────────
console.log('[preflight] 1/4 · Merge markers en archivos críticos...');

const MARKER_RE = /^(<{7}|={7}|>{7})(?:\s|$)/m;

function walk(dir, skipDirs) {
  const out = [];
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch (_) { return out; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (skipDirs && skipDirs.some(s => full.includes(s))) continue;
      out.push(...walk(full, skipDirs));
    } else if (e.isFile()) {
      out.push(full);
    }
  }
  return out;
}

const markerScanPaths = [
  'CLAUDE.md',
  'templates/core/',
  '.claude/agents/',
  '.claude/skills/',
];
const markerFiles = [];
for (const p of markerScanPaths) {
  if (!fs.existsSync(p)) continue;
  const stat = fs.statSync(p);
  const files = stat.isDirectory()
    ? walk(p, [path.sep + '_legacy' + path.sep, '/_legacy/'])
    : [p];
  for (const f of files) {
    let content;
    try { content = fs.readFileSync(f, 'utf8'); } catch (_) { continue; }
    if (MARKER_RE.test(content)) markerFiles.push(f);
  }
}

if (markerFiles.length > 0) {
  console.log('  ✗ Merge markers sin resolver en:');
  for (const f of markerFiles) console.log('    ' + f);
  errors += 1;
} else {
  console.log('  ✓ sin merge markers');
}

// ─────────────────────────────────────────────────────────────────────────────
// 2/4 · Skills del proyecto registrados
// ─────────────────────────────────────────────────────────────────────────────
console.log('[preflight] 2/4 · Skills del proyecto registrados...');

const REQUIRED_SKILLS = ['refinar-sprint', 'refinar-hu', 'iterar-refinamiento', 'generar-informe', 'generar-specs'];
let missingSk = 0;
for (const s of REQUIRED_SKILLS) {
  const skillPath = path.join('.claude', 'skills', s, 'SKILL.md');
  if (!fs.existsSync(skillPath)) {
    console.log('  ✗ skill faltante: ' + skillPath);
    missingSk += 1;
  }
}
if (missingSk === 0) {
  console.log('  ✓ 5/5 skills registradas en .claude/skills/<name>/');
} else {
  errors += missingSk;
  console.log('  ℹ El runtime de Claude Code descubre skills en .claude/skills/<name>/ (no en subnamespaces).');
}

// ─────────────────────────────────────────────────────────────────────────────
// 3/4 · Agentes del proyecto registrados
// ─────────────────────────────────────────────────────────────────────────────
console.log('[preflight] 3/4 · Agentes del proyecto registrados...');

const REQUIRED_AGENTS = ['orchestrator', 'hu-full-analyzer', 'report-builder', 'client-report-generator', 'spec-writer'];
let missingAg = 0;
for (const a of REQUIRED_AGENTS) {
  const agentPath = path.join('.claude', 'agents', a + '.md');
  if (!fs.existsSync(agentPath)) {
    console.log('  ✗ agente faltante: ' + agentPath);
    missingAg += 1;
  }
}
if (missingAg === 0) {
  console.log('  ✓ 5/5 agentes registrados en .claude/agents/');
} else {
  errors += missingAg;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4/4 · Sintaxis JS del template (todos los <script> compilan)
// ─────────────────────────────────────────────────────────────────────────────
console.log('[preflight] 4/4 · Template JS syntax...');

const templatePath = path.join('templates', 'core', 'sprint-dashboard.html');
if (!fs.existsSync(templatePath)) {
  console.log('  ✗ ' + templatePath + ' ausente');
  errors += 1;
} else {
  try {
    const html = fs.readFileSync(templatePath, 'utf8');
    const matches = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)];
    const scripts = matches.map(m => m[1]).join(';\n');
    // eslint-disable-next-line no-new-func
    new Function(scripts);
    console.log('  ✓ template JS válido — todos los <script> compilan');
  } catch (e) {
    console.log('  ✗ template JS rompe: ' + e.message);
    errors += 1;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Resumen
// ─────────────────────────────────────────────────────────────────────────────
console.log('');
if (errors > 0) {
  console.log('[preflight] ✗ FALLÓ · ' + errors + ' fallo(s), ' + warnings + ' warning(s)');
  console.log('           Corrige antes de commit o antes de ejecutar /refinar-sprint.');
  process.exit(1);
}
if (warnings > 0) {
  console.log('[preflight] ✓ OK con ' + warnings + ' warning(s) (revísalos cuando puedas)');
} else {
  console.log('[preflight] ✓ TODOS los chequeos pasaron');
}
process.exit(0);
