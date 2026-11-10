#!/usr/bin/env node
// Beeper Desktop chat-search ranking patch: DM with the matched person first,
// then fewest participants, then Beeper's own order (stable sort).
//
// Rewrites one renderer JS file inside app.asar in place-of-copy, without
// extracting the archive (unpacked native modules stay untouched): it shifts
// the offsets of later entries, recomputes that file's per-file integrity
// block hashes, and prints the new header hash for Info.plist
// ElectronAsarIntegrity.
//
// Usage:
//   patch-search.mjs status <app.asar>          -> prints patched | unpatched | nomatch
//   patch-search.mjs patch  <in.asar> <out.asar> -> writes out.asar, prints JSON
//   patch-search.mjs header-hash <app.asar>     -> prints sha256 of the asar header
//
// Runs under any node >= 18, including Beeper's own binary with
// ELECTRON_RUN_AS_NODE=1.

import fs from 'node:fs';
import crypto from 'node:crypto';
import nodePath from 'node:path';
import { fileURLToPath } from 'node:url';

const MARKER = '/*albert-dm-first-search*/';
const MARKER2 = '/*albert-tapback-hover-v6*/';
// Quick-reaction hover bar: for chats whose bridge restricts reactions to a short list (iMessage: the six
// tapbacks), show that list in order, up to 6, instead of the top emoji filtered down to what the chat allows.
const REACT_RE = /u=u\.slice\(0,3\),(\w+)\(u\)/;
// Tapback glyphs: iMessage draws HA HA, !! and ? as bold blue text; Beeper's bundle references tapback PNGs it does not ship.
const ICON_RE = /icon:(\w+)\.jsx\("span",\{children:(\w+)\((\w+)\)\?(\w+)\.jsx\((?:"img"|\w+),\{src:(\w+)\(\3\),alt:\3,width:"16",height:"16"\}\):\3\}\)/;
// Send native tapback names to the iMessage bridge (it treats other strings as emoji reactions, type 2006).
const ADD_RE = /this\.api\.addReaction\(this\.id,(\w+),(\w+),(\w+),(\w+)\.imgURL\)/;
const RM_RE = /this\.api\.removeReaction\(this\.id,(\w+),(\w+),(\w+)\)/;
const TBK = (k) => `((k,th)=>th.roomFeatures&&th.roomFeatures.allowed_reactions&&th.roomFeatures.allowed_reactions.includes("HAHA")?({"\\u2764\\uFE0F":"heart","\\u2764":"heart","\\uD83D\\uDC4D":"like","\\uD83D\\uDC4E":"dislike",HAHA:"laugh","\\u203C\\uFE0F":"emphasize","\\u203C":"emphasize","\\u2753":"question"})[k]||k:k)(${k},this)`;
const BLOCK = 4 * 1024 * 1024;

// Keyed on code shape, not minified names: the thread-search class has
// sortResults(x){return orderBy(x,[n=>this.isNetworkOnlyMatch(n)?1:0, ...],["asc",...])}
const SORT_RE = /sortResults\((\w+)\)\{return ([\w$]+)\(\1,\[([\w$]+)=>this\.isNetworkOnlyMatch\(\3\)\?1:0,([^\]]{0,400})\],\[("asc"[^\]]{0,80})\]\)\}/;

const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');

function readAsar(path) {
  const fd = fs.openSync(path, 'r');
  const sizeBuf = Buffer.alloc(8);
  fs.readSync(fd, sizeBuf, 0, 8, 0);
  const headerPickleSize = sizeBuf.readUInt32LE(4);
  const headerBuf = Buffer.alloc(headerPickleSize);
  fs.readSync(fd, headerBuf, 0, headerPickleSize, 8);
  const strLen = headerBuf.readUInt32LE(4);
  const headerStr = headerBuf.subarray(8, 8 + strLen).toString('utf8');
  fs.closeSync(fd);
  return { headerStr, header: JSON.parse(headerStr), dataStart: 8 + headerPickleSize };
}

function encodeHeader(headerStr) {
  const str = Buffer.from(headerStr, 'utf8');
  const padded = Math.ceil(str.length / 4) * 4;
  const pickle = Buffer.alloc(8 + padded);
  pickle.writeUInt32LE(4 + padded, 0); // payload size
  pickle.writeUInt32LE(str.length, 4);
  str.copy(pickle, 8);
  const size = Buffer.alloc(8);
  size.writeUInt32LE(4, 0);
  size.writeUInt32LE(pickle.length, 4);
  return Buffer.concat([size, pickle]);
}

function* walk(node, prefix = '') {
  for (const [name, child] of Object.entries(node.files || {})) {
    const p = prefix ? `${prefix}/${name}` : name;
    if (child.files) yield* walk(child, p);
    else yield [p, child];
  }
}

function readEntry(path, dataStart, entry) {
  const fd = fs.openSync(path, 'r');
  const buf = Buffer.alloc(entry.size);
  fs.readSync(fd, buf, 0, entry.size, dataStart + Number(entry.offset));
  fs.closeSync(fd);
  return buf;
}

function candidates(header) {
  return [...walk(header)].filter(([p, e]) => /^build\/renderer\/[^/]+\.js$/.test(p) && !e.unpacked && e.size > 100000);
}

function findTarget(path) {
  const a = readAsar(path);
  let patched = null;
  for (const [p, e] of candidates(a.header)) {
    const src = readEntry(path, a.dataStart, e).toString('utf8');
    const h1 = src.includes(MARKER), h2 = src.includes(MARKER2);
    if (h1 && h2) patched = p;
    else if ((h1 || SORT_RE.test(src)) && (h2 || (REACT_RE.test(src) && ICON_RE.test(src) && ADD_RE.test(src) && RM_RE.test(src)))) return { ...a, file: p, entry: e, src, state: 'unpatched' };
  }
  return { ...a, file: patched, state: patched ? 'patched' : 'nomatch' };
}

function patchSource(src) {
  if (!src.includes(MARKER2)) {
    const r = src.match(REACT_RE);
    src = src.replace(ADD_RE, (w, a, b, c, d) => `this.api.addReaction(this.id,${a},${TBK(b)},${c},${d}.imgURL)`);
    src = src.replace(RM_RE, (w, a, b, c) => `this.api.removeReaction(this.id,${a},${TBK(b)},${c})`);
    const ic = src.match(ICON_RE);
    const J = ic[1], V = ic[3];
    const ICO = {"\u2764\uFE0F":"heart","\uD83D\uDC4D":"like","\uD83D\uDC4E":"dislike","HAHA":"haha","\u203C\uFE0F":"emph","\u2753":"question"};
    const uri = n => "data:image/png;base64," + fs.readFileSync(nodePath.join(nodePath.dirname(fileURLToPath(import.meta.url)), "icons", n + ".png")).toString("base64");
    const before = src.slice(0, ic.index);
    const am = [...before.matchAll(/allowedReactions:(\w+),supportsCustomEmojiReactions/g)].pop();
    if (!am) throw new Error('allowedReactions prop not found before the quick-reaction icons');
    const IM = `(${am[1]}&&${am[1]}.includes("HAHA"))`;
    let tb = V;
    for (const [k, n] of Object.entries(ICO)) tb = `(${IM}&&${V}===${JSON.stringify(k)}?${J}.jsx("img",{src:${JSON.stringify(uri(n))},alt:${JSON.stringify(n)},width:"22",height:"22",style:{objectFit:"contain"}}):${tb})`;
    src = src.replace(ic[0], ic[0].replace(/:(\w+)\}\)$/, `:${tb}})`).replace('icon:', 'icon:'));
    src = src.replace(r[0], `u=e?.length&&e.length<=6&&e.includes("HAHA")?e.slice():u.slice(0,3)${MARKER2},${r[1]}(u)`);
  }
  if (src.includes(MARKER)) return src;
  const m = src.match(SORT_RE);
  const [whole, arg, orderBy, v, restKeys, dirs] = m;
  const replacement =
    `sortResults(${arg}){return ${orderBy}(${arg},[${v}=>this.__dmFirst(${v}),${v}=>this.isNetworkOnlyMatch(${v})?1:0,${v}=>this.__pCount(${v}),${restKeys}],["asc","asc","asc",${dirs.replace(/^"asc",/, '')}])}` +
    `${MARKER}__dmFirst(e){try{const t=e.thread,s=e.result&&e.result.score;if(!t||!s)return 1;` +
    `const dm=t.type==="single"||(!!t.isUnion&&Array.isArray(t.memberThreads)&&t.memberThreads.length>0&&t.memberThreads.every(m=>m.type==="single"));` +
    `return dm&&((s.title&&s.title.hits>0)||(s.participants&&s.participants.hits>0))?0:1}catch(_){return 1}}` +
    `__pCount(e){try{const t=e.thread;let c=(t.rawActiveParticipants||[]).length;` +
    `if(!c&&Array.isArray(t.memberThreads))for(const m of t.memberThreads)c=Math.max(c,(m.rawActiveParticipants||[]).length);` +
    `return c>0?c:1e9}catch(_){return 1e9}}`;
  return src.replace(whole, replacement);
}

function integrityOf(buf) {
  const blocks = [];
  for (let i = 0; i < buf.length; i += BLOCK) blocks.push(sha256(buf.subarray(i, i + BLOCK)));
  return { algorithm: 'SHA256', hash: sha256(buf), blockSize: BLOCK, blocks };
}

const [cmd, a1, a2] = process.argv.slice(2);
if (cmd === 'header-hash') {
  console.log(sha256(readAsar(a1).headerStr));
} else if (cmd === 'status') {
  console.log(findTarget(a1).state);
} else if (cmd === 'patch') {
  const t = findTarget(a1);
  if (t.state !== 'unpatched') {
    console.log(JSON.stringify({ status: t.state, file: t.file }));
    process.exit(t.state === 'patched' ? 0 : 3);
  }
  const newBuf = Buffer.from(patchSource(t.src), 'utf8');
  if (!newBuf.includes(MARKER)) throw new Error('patch did not apply');
  const oldOff = Number(t.entry.offset), oldSize = t.entry.size, delta = newBuf.length - oldSize;
  for (const [, e] of walk(t.header)) if (!e.unpacked && e.offset !== undefined && Number(e.offset) > oldOff) e.offset = String(Number(e.offset) + delta);
  t.entry.size = newBuf.length;
  t.entry.integrity = integrityOf(newBuf);
  const headerStr = JSON.stringify(t.header);
  const inFd = fs.openSync(a1, 'r');
  const total = fs.fstatSync(inFd).size;
  const out = fs.openSync(a2, 'w');
  fs.writeSync(out, encodeHeader(headerStr));
  const copy = (from, len) => {
    const chunk = Buffer.alloc(BLOCK);
    let done = 0;
    while (done < len) {
      const n = fs.readSync(inFd, chunk, 0, Math.min(BLOCK, len - done), from + done);
      fs.writeSync(out, chunk, 0, n);
      done += n;
    }
  };
  copy(t.dataStart, oldOff);
  fs.writeSync(out, newBuf);
  copy(t.dataStart + oldOff + oldSize, total - (t.dataStart + oldOff + oldSize));
  fs.closeSync(out); fs.closeSync(inFd);
  // self-check: re-read and verify every in-asar file still hashes to its integrity entry
  const v = readAsar(a2);
  let checked = 0;
  for (const [p, e] of walk(v.header)) {
    if (e.unpacked || !e.integrity) continue;
    if (sha256(readEntry(a2, v.dataStart, e)) !== e.integrity.hash) throw new Error(`integrity mismatch after rewrite: ${p}`);
    checked++;
  }
  console.log(JSON.stringify({ status: 'patched-now', file: t.file, delta, checked, headerHash: sha256(v.headerStr) }));
} else {
  console.error('usage: patch-search.mjs status|patch|header-hash ...');
  process.exit(2);
}
