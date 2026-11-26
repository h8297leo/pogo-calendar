#!/usr/bin/env node
// 檢查 site/cal 下所有 .ics：CRLF、行長 ≤ 75 octets、BEGIN/END 成對、UID 不重複、必要欄位。
// 有任何錯誤就以非 0 結束，讓部署中止。
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const CAL = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'site', 'cal');
const enc = new TextEncoder();

async function* walk(dir) {
  for (const d of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, d.name);
    if (d.isDirectory()) yield* walk(p);
    else if (d.name.endsWith('.ics')) yield p;
  }
}

export function validateIcs(text) {
  const errors = [];
  if (/[^\r]\n/.test(text) || text.startsWith('\n')) errors.push('含有非 CRLF 的換行');
  if (!text.endsWith('\r\n')) errors.push('檔案未以 CRLF 結尾');
  const lines = text.split('\r\n');
  if (lines.at(-1) === '') lines.pop();
  lines.forEach((line, i) => {
    if (enc.encode(line).length > 75) errors.push(`第 ${i + 1} 行超過 75 octets`);
  });
  // 先展開折行（以空白開頭的續行接回上一行），再檢查內容，長 UID 才不會只比到第一段
  const logical = [];
  lines.forEach((line, i) => {
    if (line.startsWith(' ') && logical.length) logical.at(-1).text += line.slice(1);
    else logical.push({ text: line, i });
  });
  const stack = [];
  const uids = new Set();
  let cur = null;
  logical.forEach(({ text: line, i }) => {
    const [key] = line.split(':');
    if (key === 'BEGIN') {
      const v = line.slice(6);
      stack.push(v);
      if (v === 'VEVENT') cur = new Set();
    } else if (key === 'END') {
      const v = line.slice(4);
      if (stack.pop() !== v) errors.push(`第 ${i + 1} 行 END:${v} 不成對`);
      if (v === 'VEVENT') {
        for (const req of ['UID', 'DTSTAMP', 'DTSTART', 'SUMMARY']) if (!cur.has(req)) errors.push(`VEVENT 缺 ${req}`);
        cur = null;
      }
    } else if (cur) {
      const name = key.split(';')[0];
      cur.add(name);
      if (name === 'UID') {
        const uid = line.slice(4);
        if (uids.has(uid)) errors.push(`UID 重複：${uid}`);
        uids.add(uid);
      }
    }
  });
  if (stack.length) errors.push(`未關閉的區塊：${stack.join(',')}`);
  if (lines[0] !== 'BEGIN:VCALENDAR') errors.push('第一行不是 BEGIN:VCALENDAR');
  return errors;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let files = 0;
  let bad = 0;
  for await (const f of walk(CAL)) {
    files++;
    const errs = validateIcs(await readFile(f, 'utf8'));
    if (errs.length) {
      bad++;
      console.error(`✘ ${f}\n  - ${errs.slice(0, 5).join('\n  - ')}`);
    }
  }
  if (!files) { console.error('✘ 找不到任何 .ics，請先執行 build'); process.exit(1); }
  console.log(bad ? `✘ ${bad}/${files} 個 ICS 有錯誤` : `✔ ${files} 個 ICS 格式正確`);
  process.exit(bad ? 1 : 0);
}
