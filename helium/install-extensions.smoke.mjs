import {mkdtempSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {spawn,execFileSync} from 'node:child_process';
const server=createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta charset="utf-8"><title>Isolated MRU test</title><body>Test</body>')});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const site='http://127.0.0.1:'+server.address().port;
const dir=mkdtempSync(join(tmpdir(),'helium-shortcut-smoke-'));
const ids=['kfjmdhmfemlhdgilboknjknpfnhnlodp','ialfjajikhdldpgcfglgndennidgkhik'];
const py=`import urllib.request,struct,zipfile,io,pathlib
root=pathlib.Path(${JSON.stringify(dir)})
for id in ${JSON.stringify(ids)}:
 b=urllib.request.urlopen('https://clients2.google.com/service/update2/crx?response=redirect&prodversion=156.0.0.0&acceptformat=crx3&x=id%3D'+id+'%26uc').read()
 n=12+struct.unpack('<I',b[8:12])[0]
 zipfile.ZipFile(io.BytesIO(b[n:])).extractall(root/id)
`;
execFileSync('python3',['-c',py],{timeout:60000});
const browser=spawn('/Applications/Helium.app/Contents/MacOS/Helium',['--headless=new','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+join(dir,'profile'),'--disable-extensions-except='+ids.map(id=>join(dir,id)).join(','),'--load-extension='+ids.map(id=>join(dir,id)).join(','),'about:blank'],{stdio:['ignore','ignore','pipe']});
let stderr='';browser.stderr.on('data',d=>stderr+=d);let ws;let seq=0;const pending=new Map();
const wait=ms=>new Promise(r=>setTimeout(r,ms));
try{
 let port;
 for(let i=0;i<200;i++){try{port=readFileSync(join(dir,'profile/DevToolsActivePort'),'utf8').split('\n')[0];break}catch{}await wait(100)}
 if(!port)throw Error('No isolated CDP '+stderr);
 const version=await (await fetch('http://127.0.0.1:'+port+'/json/version')).json();
 ws=new WebSocket(version.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});
 ws.onmessage=e=>{const m=JSON.parse(e.data);const p=pending.get(m.id);if(p){clearTimeout(p.timer);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result)}};
 const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++seq;const timer=setTimeout(()=>{pending.delete(id);reject(Error('timeout '+method))},10000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params,sessionId}))});
 const ev=async(sessionId,expression)=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},sessionId);if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result?.value};
 let targets;
 for(let i=0;i<100;i++){targets=(await send('Target.getTargets')).targetInfos;if(targets.filter(x=>x.type==='service_worker').length>=2)break;await wait(100)}
 const workers=targets.filter(x=>x.type==='service_worker');if(workers.length!==2)throw Error('Expected two extension workers '+JSON.stringify(targets));
 const result={profile:dir,workers:[],checks:[]};
 for(const worker of workers){const {sessionId}=await send('Target.attachToTarget',{targetId:worker.targetId,flatten:true});result.workers.push(await ev(sessionId,'({name:chrome.runtime.getManifest().name,version:chrome.runtime.getManifest().version,id:chrome.runtime.id})'));
 if(worker.url.endsWith('/background.js')&&!worker.url.includes('/src/')){
   // Full background runtime reads tab events and stores MRU in chrome.storage.session.
   const a=await ev(sessionId,'chrome.tabs.create({url:'+JSON.stringify(site+'/#a')+',active:false}).then(t=>t.id)');
   const b=await ev(sessionId,'chrome.tabs.create({url:'+JSON.stringify(site+'/#b')+',active:false}).then(t=>t.id)');
   await ev(sessionId,'chrome.tabs.update('+a+',{active:true})');await wait(300);
   await ev(sessionId,'chrome.tabs.update('+b+',{active:true})');await wait(300);
   const state=await ev(sessionId,'chrome.storage.session.get("mruTabs")');
   if(state.mruTabs.at(-1)!==b||state.mruTabs.at(-2)!==a)throw Error('MRU mismatch '+JSON.stringify(state));
   result.checks.push('Actual MV3 service worker updates MRU order on Chromium tab activation');


 }
 }
 console.log(JSON.stringify(result,null,2));
 writeFileSync(join(dir,'receipt.json'),JSON.stringify(result,null,2));
}finally{ws?.close();browser.kill('SIGTERM');server.close()}
