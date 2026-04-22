#!/usr/bin/env node
/**
 * init-sprint.js — Requirement Refinator
 *
 * Onboarding asistido para crear un sprint nuevo o ingerir HUs desde una ruta externa.
 * Portable a Windows (cmd.exe/PowerShell/Git Bash), macOS y Linux.
 *
 * Uso:
 *   node scripts/init-sprint.js <sprint-id> --init
 *       Crea docs/HUs/<sprint-id>/ (vacío) y copia las plantillas de contexto
 *       si no existen los archivos reales.
 *
 *   node scripts/init-sprint.js <sprint-id> --ingest <ruta-externa>
 *       Copia todos los archivos .md de <ruta-externa> a docs/HUs/<sprint-id>/.
 *       Si <ruta-externa> contiene docs/contexto/contexto-funcional.md o
 *       contexto-tecnico.md (recursivo hasta 3 niveles), los copia también.
 *       Valida que cada HU tenga al menos título y una sección de narrativa.
 *
 * Exit codes: 0 = OK · 1 = error de uso · 2 = fallo operativo
 */

'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function resolveRoot() {
  const r = spawnSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8', shell: false });
  if (r.status === 0 && r.stdout) return r.stdout.trim();
  return process.cwd();
}

const ROOT = resolveRoot();
try { process.chdir(ROOT); }
catch (e) { console.error('✗ no puedo cambiar a ' + ROOT + ': ' + e.message); process.exit(2); }

function usage() {
  console.log('Uso:');
  console.log('  node scripts/init-sprint.js <sprint-id> --init');
  console.log('  node scripts/init-sprint.js <sprint-id> --ingest <ruta-externa>');
  console.log('');
  console.log('Ejemplos:');
  console.log('  node scripts/init-sprint.js Sprint-145 --init');
  console.log('  node scripts/init-sprint.js Sprint-145 --ingest C:\\Users\\me\\Documents\\otroCliente\\HUs');
  console.log('  node scripts/init-sprint.js Sprint-145 --ingest /Users/me/Documents/otroCliente/HUs');
  process.exit(1);
}

const [, , sprintId, mode, src] = process.argv;
if (!sprintId || !mode) usage();

if (!/^[A-Za-z0-9][A-Za-z0-9_-]+$/.test(sprintId)) {
  console.error(`✗ sprint-id inválido: ${sprintId} (solo alfanumérico, '-' y '_')`);
  process.exit(1);
}

function listMdFiles(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter(e => e.isFile() && e.name.toLowerCase().endsWith('.md'))
      .map(e => path.join(dir, e.name));
  } catch (_) { return []; }
}

function findRecursive(dir, pattern, maxDepth) {
  // pattern: RegExp sobre el basename (case-insensitive ya manejado en la regex)
  const found = [];
  (function walk(d, depth) {
    if (depth > maxDepth) return;
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); }
    catch (_) { return; }
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full, depth + 1);
      else if (e.isFile() && pattern.test(e.name)) found.push(full);
    }
  })(dir, 0);
  return found;
}

function initSprint() {
  const target = path.join('docs', 'HUs', sprintId);
  if (fs.existsSync(target) && fs.statSync(target).isDirectory()) {
    const n = listMdFiles(target).length;
    console.log(`⚠ docs/HUs/${sprintId} ya existe con ${n} archivo(s) .md`);
    console.log(`  Agrega tus HUs o ejecuta: /refinar-sprint ${sprintId}`);
    return;
  }
  fs.mkdirSync(target, { recursive: true });
  console.log(`✓ Creado docs/HUs/${sprintId}/`);

  for (const n of ['contexto-funcional', 'contexto-tecnico']) {
    const real = path.join('docs', 'contexto', n + '.md');
    const tpl = path.join('docs', 'contexto', n + '.template.md');
    if (!fs.existsSync(real)) {
      if (fs.existsSync(tpl)) {
        fs.copyFileSync(tpl, real);
        console.log(`✓ Creado docs/contexto/${n}.md (desde template)`);
      } else {
        console.log(`⚠ No encontré docs/contexto/${n}.template.md — crea docs/contexto/${n}.md manualmente`);
      }
    }
  }

  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  ✅ Sprint ${sprintId} inicializado`);
  console.log('');
  console.log('  ➡ SIGUIENTES PASOS:');
  console.log(`    1. Agrega tus HUs (.md) en docs/HUs/${sprintId}/`);
  console.log('    2. Edita docs/contexto/contexto-{funcional,tecnico}.md con info real');
  console.log(`    3. Ejecuta: /refinar-sprint ${sprintId}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

function ingestSprint() {
  if (!src) { console.error('✗ --ingest requiere <ruta-externa>'); process.exit(1); }
  let srcStat;
  try { srcStat = fs.statSync(src); }
  catch (_) { console.error(`✗ ruta externa no existe: ${src}`); process.exit(2); }
  if (!srcStat.isDirectory()) { console.error(`✗ ruta externa no es directorio: ${src}`); process.exit(2); }

  const target = path.join('docs', 'HUs', sprintId);
  fs.mkdirSync(target, { recursive: true });

  // 1) Copiar .md de primer nivel (no recursivo)
  const mdFiles = listMdFiles(src);
  let count = 0;
  for (const f of mdFiles) {
    fs.copyFileSync(f, path.join(target, path.basename(f)));
    count += 1;
  }
  console.log(`✓ ${count} archivo(s) .md copiados a docs/HUs/${sprintId}/`);

  // 2) Buscar contextos en la ruta externa (recursivo 3 niveles, case-insensitive)
  const reFunc = /contexto.*funcional.*\.md$/i;
  const reTec = /contexto.*(tecnico|técnico).*\.md$/i;
  const ctxFunc = findRecursive(src, reFunc, 3)[0];
  const ctxTec = findRecursive(src, reTec, 3)[0];

  const realFunc = path.join('docs', 'contexto', 'contexto-funcional.md');
  const realTec = path.join('docs', 'contexto', 'contexto-tecnico.md');

  if (ctxFunc && !fs.existsSync(realFunc)) {
    fs.mkdirSync(path.dirname(realFunc), { recursive: true });
    fs.copyFileSync(ctxFunc, realFunc);
    console.log(`✓ contexto-funcional.md importado desde: ${ctxFunc}`);
  }
  if (ctxTec && !fs.existsSync(realTec)) {
    fs.mkdirSync(path.dirname(realTec), { recursive: true });
    fs.copyFileSync(ctxTec, realTec);
    console.log(`✓ contexto-tecnico.md importado desde: ${ctxTec}`);
  }

  // 3) Validar formato mínimo
  let warnings = 0;
  const reNarrativa = /quiero|requerimiento|como .* quiero/i;
  const reCriterios = /criteri[oa] de aceptaci|acceptance criteri/i;
  for (const huPath of listMdFiles(target)) {
    let content;
    try { content = fs.readFileSync(huPath, 'utf8'); } catch (_) { continue; }
    const issues = [];
    if (!reNarrativa.test(content)) issues.push('narrativa');
    if (!reCriterios.test(content)) issues.push('criterios-aceptacion');
    if (issues.length > 0) {
      console.log(`  ⚠ ${path.basename(huPath)} — parece incompleto (falta: ${issues.join(' ')})`);
      warnings += 1;
    }
  }

  if (warnings > 0) {
    console.log('');
    console.log(`ℹ ${warnings} HU(s) con formato incompleto. El análisis las procesará pero generará más preguntas de clarificación.`);
  }

  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  ✅ Sprint ${sprintId} ingerido · ${count} HU(s)`);
  console.log('');
  console.log('  ➡ SIGUIENTE PASO:');
  console.log(`     /refinar-sprint ${sprintId}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

switch (mode) {
  case '--init':   initSprint(); break;
  case '--ingest': ingestSprint(); break;
  default:
    console.error(`✗ modo desconocido: ${mode}`);
    usage();
}
