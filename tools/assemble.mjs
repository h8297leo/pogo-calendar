#!/usr/bin/env node
// 建置所有版本並組出 _site/（GitHub Pages 部署內容）
//
//   _site/
//   ├─ index.html, versions.html, versions.json   ← 根目錄
//   ├─ v1.0.0/ …                                   ← 每個版本的 site/
//   ├─ cal/   ← 正式版（無正式版則為最新測試版）的訂閱檔，網址永遠不變
//   └─ data/  ← 同上，Worker 讀這份 events.json
//
// 用法：node tools/assemble.mjs [-- 傳給 build.mjs 的參數，例如 --input x.json]
import { readFile, writeFile, rm, mkdir, cp } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, '_site');
const passIdx = process.argv.indexOf('--');
const buildArgs = passIdx >= 0 ? process.argv.slice(passIdx + 1) : [];

const versions = JSON.parse(await readFile(join(ROOT, 'versions.json'), 'utf8'));
const semver = (v) => v.replace(/^v/, '').split('.').map(Number);
const cmp = (a, b) => { const x = semver(a), y = semver(b); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; };

const run = (cwd, script, extra = []) =>
  spawnSync(process.execPath, [script, ...extra], { cwd, stdio: 'inherit' }).status === 0;

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

const built = [];
for (const v of versions) {
  const dir = join(ROOT, v.version);
  if (!existsSync(dir)) { console.warn(`⚠ 找不到資料夾 ${v.version}，略過`); continue; }
  console.log(`\n▶ ${v.version}（${v.status}）`);
  const args = buildArgs.map((a) => (existsSync(resolve(ROOT, a)) ? resolve(ROOT, a) : a));
  const ok = run(dir, 'scripts/build.mjs', args) && run(dir, 'scripts/validate-ics.mjs');
  if (!ok) {
    if (v.status === 'archived') { console.warn(`⚠ ${v.version} 建置失敗（已封存，略過）`); continue; }
    console.error(`✘ ${v.version} 建置或 ICS 驗證失敗，中止部署`);
    process.exit(1);
  }
  await cp(join(dir, 'site'), join(OUT, v.version), { recursive: true });
  built.push(v);
}

const stable = built.find((v) => v.status === 'stable');
const latestTest = built.filter((v) => v.status === 'test').sort((a, b) => cmp(b.version, a.version))[0];
const primary = stable || latestTest;
if (!primary) { console.error('✘ 沒有可用的 stable 或 test 版本'); process.exit(1); }

for (const f of ['index.html', 'versions.html', 'versions.json']) await cp(join(ROOT, f), join(OUT, f));
await cp(join(OUT, primary.version, 'cal'), join(OUT, 'cal'), { recursive: true });
await cp(join(OUT, primary.version, 'data'), join(OUT, 'data'), { recursive: true });
await writeFile(join(OUT, '.nojekyll'), '');
console.log(`\n✔ _site 完成。根目錄訂閱檔來自 ${primary.version}（${primary.status}）`);
