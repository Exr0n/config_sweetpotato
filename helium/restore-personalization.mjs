// Restore reviewed extension settings through Helium's own storage API.
// Helium must already be running with loopback-only CDP. Never quits the browser.
import {readFileSync, mkdirSync, writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';

const endpoint = new URL(process.env.HELIUM_CDP_URL || 'http://127.0.0.1:49371');
if (endpoint.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname))
  throw new Error('CDP endpoint must be loopback-only');
const DR = 'eimadpbcbfnmbkopoojfekhnkhdbieeh';
const TM = 'dhdgffkkebhmkfjojejmpbldmpobfkfo';
const root = new URL('../tampermonkey/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', root)));
const records = JSON.parse(readFileSync(new URL('storage-records.json', root)));
const verifyOnly = process.argv.includes('--verify-only');
const backupDir = homedir() + '/.local/state/helium-setup/' + new Date().toISOString().replaceAll(':','-');
const pause = ms => new Promise(r => setTimeout(r, ms));
for (const s of manifest.scripts) {
  if (!/^[a-z0-9-]+\.user\.js$/.test(s.file)) throw new Error('Unsafe userscript path');
  const source = readFileSync(new URL(s.file, root), 'utf8');
  if (createHash('sha256').update(source).digest('hex') !== s.sha256 ||
      records['!extdb.@source#'+s.uuid]?.value !== source ||
      records['!extdb.@meta#'+s.uuid]?.value.enabled !== s.enabled)
    throw new Error('Userscript manifest/storage mismatch: ' + s.name);
}
for (const k of Object.keys(records))
  if (!/^!extdb\.@(meta|source|re|st|uid)#[0-9a-f-]{36}$/.test(k))
    throw new Error('Refusing non-script storage key');
async function http(path, method='GET') {
  const r = await fetch(new URL(path, endpoint), {method, signal:AbortSignal.timeout(10000)});
  if (!r.ok) throw new Error('CDP HTTP ' + r.status);
  return path.startsWith('/json/close/') ? r.text() : r.json();
}
async function connect(target) {
  const url = new URL(target.webSocketDebuggerUrl);
  if (!['127.0.0.1','localhost','[::1]'].includes(url.hostname)) throw new Error('Nonlocal debugger');
  const ws = new WebSocket(url);
  await new Promise((resolve,reject) => {
    const timer = setTimeout(() => {ws.close();reject(new Error('CDP connect timeout'));},10000);
    ws.onopen=()=>{clearTimeout(timer);resolve();};
    ws.onerror=()=>{clearTimeout(timer);reject(new Error('CDP connect failed'));};
  });
  let seq=0;const pending=new Map();
  ws.onmessage=e=>{
    const m=JSON.parse(e.data);const p=pending.get(m.id);if(!p)return;
    clearTimeout(p.timer);pending.delete(m.id);m.error?p.reject(new Error(m.error.message)):p.resolve(m.result);
  };
  ws.onclose=()=>{for(const p of pending.values()){clearTimeout(p.timer);p.reject(new Error('CDP closed'));}pending.clear();};
  const send=(method,params={})=>new Promise((resolve,reject)=>{
    const id=++seq;
    const timer=setTimeout(()=>{pending.delete(id);reject(new Error('CDP timeout: '+method));},15000);
    pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));
  });
  return {close:()=>ws.close(),send,async eval(expression){
    const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
    if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result?.value;
  }};
}
async function extension(id,path,fn) {
  const tab=await http('/json/new?'+encodeURIComponent('chrome-extension://'+id+'/'+path),'PUT');
  let c;
  try{
    c=await connect(tab);
    for(let i=0;i<50;i++){
      if(await c.eval('typeof chrome !== "undefined" && !!chrome.storage?.local'))break;
      if(i===49)throw new Error('Extension page unavailable: '+id);
      await pause(100);
    }
    return await fn(c);
  }finally{c?.close();await http('/json/close/'+tab.id).catch(()=>{});}
}
function backup(name,data) {
  mkdirSync(backupDir,{recursive:true,mode:0o700});
  writeFileSync(backupDir+'/'+name+'.json',JSON.stringify(data,null,2),{mode:0o600,flag:'wx'});
}
const automation={enabled:true,mode:'system',behavior:'OnOff'};
await extension(DR,'ui/popup/index.html',async c=>{
  if(!verifyOnly){
    backup('dark-reader',await c.eval('Promise.all([chrome.storage.local.get(null),chrome.storage.sync.get(null)])'));
    // Use Dark Reader's UI protocol so its in-memory state updates too.
    await c.eval('chrome.runtime.sendMessage({type:"ui-bg-change-settings",data:'+JSON.stringify({enabled:true,automation})+'}).catch(()=>{})');
  }
  let state;
  for(let i=0;i<80;i++){
    state=await c.eval('chrome.runtime.sendMessage({type:"ui-bg-get-data"}).then(r=>r.data)');
    if(isDeepStrictEqual(state?.settings?.automation,automation) && state.settings.enabled)break;
    if(verifyOnly || i===79)throw new Error('Dark Reader did not confirm system automation');
    await pause(100);
  }
  // Read persisted settings as well, not only UI memory.
  let stored;
  for(let i=0;i<80;i++){
    stored=await c.eval('(async()=>{const l=await chrome.storage.local.get(null);return l.syncSettings===false?l:await chrome.storage.sync.get(null)})()');
    if(isDeepStrictEqual(stored.automation,automation) && stored.enabled)break;
    if(verifyOnly || i===79)throw new Error('Dark Reader settings not persisted');
    await pause(100);
  }
  console.log(JSON.stringify({darkReader:{enabled:stored.enabled,automation:stored.automation,isEnabled:state.isEnabled}}));
});
let changed=false;
await extension(TM,'options.html',async c=>{
  const current=await c.eval('chrome.storage.local.get(null)');
  if(!verifyOnly){
    backup('tampermonkey',current);
    const additions={};
    for(const s of manifest.scripts){
      const old=current['!extdb.@source#'+s.uuid];
      if(old && old.value!==records['!extdb.@source#'+s.uuid].value)
        throw new Error('Existing script differs; refusing overwrite: '+s.name);
      // An already installed script owns its current enabled state and GM storage.
      if(!old)for(const [k,v] of Object.entries(records))if(k.endsWith('#'+s.uuid))additions[k]=v;
    }
    changed=Object.keys(additions).length>0;
    if(changed)await c.eval('chrome.storage.local.set('+JSON.stringify(additions)+')');
  }
  const after=await c.eval('chrome.storage.local.get(null)');
  for(const s of manifest.scripts)
    if(after['!extdb.@source#'+s.uuid]?.value!==records['!extdb.@source#'+s.uuid].value ||
       after['!extdb.@meta#'+s.uuid]?.value.enabled!==s.enabled)
      throw new Error('Script readback failed: '+s.name);
  console.log(JSON.stringify({tampermonkey:manifest.scripts.map(({name,enabled})=>({name,enabled})),changed}));
  if(changed)await c.eval('setTimeout(()=>chrome.runtime.reload(),100);true');
});
if(!verifyOnly)console.log('Backups: '+backupDir);
