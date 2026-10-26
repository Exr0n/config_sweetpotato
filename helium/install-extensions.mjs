// Install the curated Helium extension set over CDP.
// 1. osascript -e 'quit app "Helium"'; open -a Helium --args --remote-debugging-port=9222
// 2. node ~/.config/helium/install-extensions.mjs
// Each extension's Web Store page opens and "Add to Helium" is clicked; the native
// "Add <name>?" confirm dialog is outside CDP's reach, so click "Add extension" yourself.
import {existsSync} from 'node:fs';
import {homedir} from 'node:os';

const EXTENSIONS = {
  dhdgffkkebhmkfjojejmpbldmpobfkfo: 'Tampermonkey',
  eimadpbcbfnmbkopoojfekhnkhdbieeh: 'Dark Reader',
  ekhagklcjbdpajgpjgmbionohlpdbjgc: 'Zotero Connector',
  pejdijmoenmkgeppbflobdenhhabjlaj: 'iCloud Passwords',
  ghbmnnjooekpmoecnnnilnnbdlolhkhi: 'Google Docs Offline',
  khncfooichmfjbepaaaebmommgaepoid: 'Unhook',
  nglaklhklhcoonedhgnpgddginnjdadi: 'ActivityWatch Web Watcher',
  joggkdfebigddmaagckekihhfncdobff: 'Le Git Graph',
  mmigpkdeeckdeaakmagplioebnoiacdh: 'Claude: Continue from Here',
};
const EXT_DIR = `${homedir()}/Library/Application Support/net.imput.helium/Default/Extensions`;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function clickAdd(id) {
  const tab = await (await fetch(`http://localhost:9222/json/new?https://chromewebstore.google.com/detail/${id}`, {method: 'PUT'})).json();
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);
  let n = 0; const pending = {};
  ws.onmessage = e => { const m = JSON.parse(e.data); if (pending[m.id]) { pending[m.id](m.result); delete pending[m.id]; } };
  const send = (method, params = {}) => new Promise(r => { const i = ++n; pending[i] = r; ws.send(JSON.stringify({id: i, method, params})); });
  await send('Page.bringToFront');
  let box = null;
  for (let i = 0; i < 40 && !box; i++) {
    await sleep(500);
    box = (await send('Runtime.evaluate', {returnByValue: true, expression: `(() => {
      const b = [...document.querySelectorAll('button')].find(b => /^(Add to|Remove from)/i.test(b.innerText.trim()));
      if (!b) return null; b.scrollIntoView({block: 'center'}); const r = b.getBoundingClientRect();
      return {x: r.x + r.width / 2, y: r.y + r.height / 2, text: b.innerText.trim()}; })()`})).result.value;
  }
  if (!box) return 'no "Add" button found';
  if (/^Remove/i.test(box.text)) return 'already installed';
  await sleep(300);
  for (const type of ['mousePressed', 'mouseReleased'])
    await send('Input.dispatchMouseEvent', {type, x: box.x, y: box.y, button: 'left', clickCount: 1});
  ws.close();
  return 'clicked; confirm the dialog';
}

for (const [id, name] of Object.entries(EXTENSIONS)) {
  if (existsSync(`${EXT_DIR}/${id}`)) { console.log(`${name}: already installed`); continue; }
  console.log(`${name}: ${await clickAdd(id)}`);
  for (let i = 0; i < 30 && !existsSync(`${EXT_DIR}/${id}`); i++) await sleep(1000);
  console.log(`  ${existsSync(`${EXT_DIR}/${id}`) ? 'installed' : 'not installed (dialog declined or still open)'}`);
}
