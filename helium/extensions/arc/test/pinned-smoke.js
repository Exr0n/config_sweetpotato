// Isolated real-browser test; never attach this to a user's live profile.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const puppeteer = require('puppeteer-core');
const source = path.resolve(__dirname, '..');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'arc-pins-profile-'));
const A = 'https://example.org/#arc-pin-a', B = 'https://example.org/#arc-pin-b';
let browser;
let previousTarget;
const errors = [];
let closing = false;
const timer = setTimeout(() => { console.error('pinned smoke timeout'); process.exit(2); }, 90000);
const pause = ms => new Promise(r => setTimeout(r, ms));
async function connectWorker() {
  console.log('connecting worker');
  const target = await browser.waitForTarget(t => t!==previousTarget && t.type()==='service_worker' && t.url().endsWith('/background.js'), {timeout:15000});
  previousTarget=target;
  const cdp = await target.createCDPSession();
  await cdp.send('Runtime.enable');
  cdp.on('Runtime.exceptionThrown', e=>{ if(!closing) errors.push(e.exceptionDetails.exception?.description || e.exceptionDetails.text); });
  cdp.on('Runtime.consoleAPICalled', e=> { if(!closing && (e.type==='warning'||e.type==='error')) errors.push(e.args.map(a=>a.value||a.description).join(' ')); });
  return async (fn,...args) => {
    const out = await cdp.send('Runtime.evaluate',{expression:`(${fn})(...${JSON.stringify(args)})`,awaitPromise:true,returnByValue:true});
    if(out.exceptionDetails) throw Error(out.exceptionDetails.exception?.description||out.exceptionDetails.text);
    return out.result.value;
  };
}
async function launch() {
  previousTarget=null;
  browser = await puppeteer.launch({
    executablePath:process.env.CHROME_PATH, headless:true, userDataDir:profile,
    ignoreDefaultArgs:['--disable-extensions'],
    args:[`--disable-extensions-except=${source}`,`--load-extension=${source}`,'--no-first-run','--no-default-browser-check','--restore-last-session']
  });
  return connectWorker();
}
async function until(fn,label) {
  const end=Date.now()+10000;
  let last;
  while(Date.now()<end) { last=await fn(); if(last) return last; await pause(60); }
  throw Error('Timed out '+label+' '+JSON.stringify(last));
}
async function main() {
 try {
  let ev=await launch();
  const state=()=>ev(async()=>{
    await sharedPins.idle();
    const ws=await chrome.windows.getAll({populate:true,windowTypes:['normal']});
    const local=await chrome.storage.local.get('arc:pinnedTabs');
    const session=await chrome.storage.session.get('arc:pinnedInstances');
    return {urls:local['arc:pinnedTabs'],instances:session['arc:pinnedInstances'],windows:ws.filter(w=>!w.incognito).map(w=>({id:w.id,tabs:w.tabs.map(t=>({id:t.id,url:t.url||t.pendingUrl,pinned:t.pinned,discarded:t.discarded,index:t.index,active:t.active}))}))};
  });
  const expect=async (urls,count) => until(async()=>{
    const s=await state();
    const pins=s.windows.map(w=>w.tabs.filter(t=>t.pinned).map(t=>s.instances[t.id]?.url));
    return s.windows.length===count&&JSON.stringify(s.urls)===JSON.stringify(urls)&&pins.every(p=>JSON.stringify(p)===JSON.stringify(urls)) ? s : false;
  },JSON.stringify(urls)+' in '+count+' windows');
  const first = await ev(async(A,B)=>{
    const [w]=await chrome.windows.getAll({windowTypes:['normal']});
    const a=await chrome.tabs.create({windowId:w.id,url:A,active:false});
    const b=await chrome.tabs.create({windowId:w.id,url:B,active:false});
    return {windowId:w.id,a:a.id,b:b.id};
  },A,B);
  await ev(id=>chrome.tabs.update(id,{pinned:true}),first.a);
  await expect([A],1);
  const second=await ev(()=>chrome.windows.create({url:'about:blank',focused:false,type:'normal'}));
  let s; try { s=await expect([A],2); } catch(e) { console.error(JSON.stringify(await state(),null,2),errors); throw e; }
  await until(async()=>{s=await state();return s.windows.find(w=>w.id===second.id).tabs.find(t=>t.pinned)?.discarded;},'replica discarded after commit');
  const replica=s.windows.find(w=>w.id===second.id).tabs.find(t=>t.pinned);
  assert.ok(replica.discarded&&!replica.active,'replica is discarded and inactive');
  console.log('PASS pin propagates, new-window copy is discarded');
  await ev(id=>chrome.tabs.update(id,{pinned:true}),first.b);
  await expect([A,B],2);
  await ev(id=>chrome.tabs.move(id,{index:0}),first.b);
  await expect([B,A],2);
  console.log('PASS native pin/reorder synchronizes across existing windows');
  await ev(id=>chrome.tabs.update(id,{url:'https://example.org/#arc-navigation'}),first.a);
  s=await expect([B,A],2);
  assert.equal(s.windows[0].tabs.filter(t=>t.pinned).length,2);
  console.log('PASS pinned navigation retains original canonical URL');
  await ev(id=>chrome.tabs.update(id,{pinned:false}),first.b);
  s=await expect([A],2);
  assert.ok(s.windows.find(w=>w.id===first.windowId).tabs.some(t=>t.id===first.b&&!t.pinned),'source page kept');
  
  assert.ok(s.windows.find(w=>w.id===second.id).tabs.some(t=>!t.pinned&&t.url===B),'peer page kept');
  console.log('PASS unpin propagates without closing pages');
  const popup=await ev(()=>chrome.windows.create({url:'about:blank',type:'popup',focused:false}));
  await ev(async id=>{await sharedPins.idle(); const tabs=await chrome.tabs.query({windowId:id}); if(tabs.some(t=>t.pinned)) throw Error('popup got a pin');},popup.id);
  await ev(id=>chrome.windows.remove(id),popup.id);
  console.log('PASS popup excluded');
  // Close and relaunch ONLY this isolated test browser. local storage survives,
  // session storage does not; session-restore pins must not grow duplicates.

  closing=true;
  await browser.close(); browser=null;
  closing=false;
  ev=await launch();
  await expect([A],2);
  console.log('PASS full browser restart/session restore has no duplicate pins');
  const before=await state();
  await pause(600);
  const after=await state();
  assert.deepEqual(after.windows.map(w=>w.tabs.map(t=>t.id)),before.windows.map(w=>w.tabs.map(t=>t.id)));
  assert.deepEqual(errors,[]);
  console.log('PASS quiet fixed point, no worker warnings/errors');
  console.log('7/7 shared-pin e2e checks passed');
 } finally {
  clearTimeout(timer);
  if(browser) await browser.close();
  fs.rmSync(profile,{recursive:true,force:true});
 }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
