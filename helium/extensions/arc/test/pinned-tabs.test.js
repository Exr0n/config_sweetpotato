const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('../pinned-tabs.js');
function harness(initial, data = { local: {}, session: {} }) {
  let next = 100;
  const calls = [];
  const ws = structuredClone(initial);
  const event = () => {
    const listeners = [];
    return { addListener: fn => listeners.push(fn), emit: (...args) => listeners.forEach(fn => fn(...structuredClone(args))) };
  };
  const area = data => ({
    async get(k) { return structuredClone(Array.isArray(k) ? Object.fromEntries(k.map(key=>[key,data[key]])) : { [k]: data[k] }); },
    async set(v) { Object.assign(data, structuredClone(v)); }
  });
  const find = id => ws.flatMap(w => w.tabs).find(t => t.id === id);
  const reindex = w => w.tabs.forEach((t, i) => { t.index = i; t.windowId = w.id; });
  ws.forEach(reindex);
  const chrome = {
    storage: { local: area(data.local), session: area(data.session) },
    windows: { onCreated: event(), async getAll() { return structuredClone(ws); } },
    tabs: Object.fromEntries(['onUpdated','onCreated','onMoved','onRemoved','onAttached','onDetached','onReplaced'].map(k => [k,event()]))
  };
  Object.assign(chrome.tabs, {
    async get(id) { if (!find(id)) throw Error('gone'); return structuredClone(find(id)); },
    async query(q) { return structuredClone(ws.flatMap(w=>w.tabs).filter(t=>(q.windowId == null || t.windowId === q.windowId) && (q.pinned == null || !!t.pinned === q.pinned))); },
    async create(p) {
      calls.push(['create',p]);
      const w = ws.find(w=>w.id===p.windowId);
      const t = { id: next++, ...p };
      w.tabs.splice(p.index ?? w.tabs.length,0,t); reindex(w);
      chrome.tabs.onCreated.emit(t); return structuredClone(t);
    },
    async discard(id) { calls.push(['discard',id]); find(id).discarded = true; return structuredClone(find(id)); },
    async update(id,p) {
      calls.push(['update',id,p]); const t=find(id); Object.assign(t,p);
      const w=ws.find(w=>w.id===t.windowId);
      w.tabs.sort((a,b)=>Number(!!b.pinned)-Number(!!a.pinned)); reindex(w);
      chrome.tabs.onUpdated.emit(id,p,t); return structuredClone(t);
    },
    async move(id,p) {
      calls.push(['move',id,p]); const t=find(id); const w=ws.find(w=>w.id===t.windowId);
      const fromIndex=t.index; w.tabs.splice(fromIndex,1); w.tabs.splice(p.index,0,t); reindex(w);
      chrome.tabs.onMoved.emit(id,{windowId:w.id,fromIndex,toIndex:t.index}); return structuredClone(t);
    }
  });
  const pins = () => ws.filter(w=>w.type==='normal'&&!w.incognito).map(w=>w.tabs.filter(t=>t.pinned).map(t=>t.url));
  const controller = start(chrome);
  return {chrome,ws,calls,data,pins,controller, find, async window(w) { w=structuredClone(w); ws.push(w); reindex(w); chrome.windows.onCreated.emit(w); await controller.idle(); } };
}
const tab = (id,url,pinned=true)=>({id,url,pinned});
const win = (id,tabs,extra={})=>({id,type:'normal',tabs,...extra});
const A='https://example.org/a', B='https://example.org/b', C='https://example.org/c';

test('focused-window union seeds ordered pins, keeps unpinned and duplicate pages', async()=>{
  const h=harness([win(1,[tab(1,B),tab(2,A),tab(3,A),tab(4,C,false)]),win(2,[tab(5,A),tab(6,C)],{focused:true})]);
  await h.controller.idle();
  assert.deepEqual(h.data.local['arc:pinnedTabs'],[A,C,B]);
  assert.deepEqual(h.pins(),[[A,C,B],[A,C,B]]);
  assert.ok(h.find(3)); assert.ok(h.find(4)); assert.equal(h.find(4).pinned,false);
  assert.equal(h.ws[0].tabs.filter(t=>t.url===A&&t.pinned).length,1);
});
test('new normal windows get inactive discarded pins, popup/incognito are untouched',async()=>{
  const h=harness([win(1,[tab(1,A)])]); await h.controller.idle();
  await h.window(win(2,[tab(2,B,false)]));
  await h.window(win(3,[tab(3,B,false)],{type:'popup'}));
  await h.window(win(4,[tab(4,B,false)],{incognito:true}));
  assert.deepEqual(h.pins(),[[A],[A]]);
  assert.ok(h.calls.filter(c=>c[0]==='create').every(c=>c[1].active===false));
  assert.equal(h.calls.filter(c=>c[0]==='discard').length,1);
  assert.equal(h.ws[2].tabs.length,1); assert.equal(h.ws[3].tabs.length,1);
});
test('pin and unpin propagate without closing pages',async()=>{
  const h=harness([win(1,[tab(1,A),tab(2,B,false)]),win(2,[tab(3,C,false)])]); await h.controller.idle();
  await h.chrome.tabs.update(2,{pinned:true}); await h.controller.idle();
  assert.deepEqual(h.pins(),[[A,B],[A,B]]);
  await h.chrome.tabs.update(2,{pinned:false}); await h.controller.idle();
  assert.deepEqual(h.pins(),[[A],[A]]);
  assert.equal(h.find(2).pinned,false);
  assert.equal(h.ws[1].tabs.find(t=>t.url===B).pinned,false);
});
test('reorder propagates and reaches a quiet fixed point',async()=>{
  const h=harness([win(1,[tab(1,A),tab(2,B),tab(3,C)]),win(2,[tab(4,C,false)])]); await h.controller.idle();
  await h.chrome.tabs.move(3,{index:0}); await h.controller.idle();
  assert.deepEqual(h.pins(),[[C,A,B],[C,A,B]]);
  const count=h.calls.length; await h.controller.idle(); assert.equal(h.calls.length,count);
  assert.ok(count<20);
});
test('navigation keeps pin-time identity across worker restart',async()=>{
  const h=harness([win(1,[tab(1,A)]),win(2,[tab(2,B,false)])]); await h.controller.idle();
  await h.chrome.tabs.update(1,{url:C}); await h.controller.idle();
  assert.deepEqual(h.data.local['arc:pinnedTabs'],[A]);
  const again=harness(h.ws,h.data); await again.controller.idle();
  assert.equal(again.find(1).url,C);
  assert.deepEqual(again.data.local['arc:pinnedTabs'],[A]);
  assert.equal(again.ws[0].tabs.filter(t=>t.pinned).length,1);
});
test('browser restore with new tab ids deduplicates copies, preserves all pages',async()=>{
  const data={local:{'arc:pinnedTabs':[A,B]},session:{}};
  const h=harness([win(1,[tab(11,A),tab(12,A),tab(13,B)]),win(2,[tab(21,B)])],data);
  await h.controller.idle();
  assert.deepEqual(h.pins(),[[A,B],[A,B]]);
  assert.ok(h.find(11)&&h.find(12));
  assert.equal(h.calls.filter(c=>c[0]==='create').length,1);
});
test('simultaneous pin/unpin and new-window events retain latest user intent',async()=>{
  const h=harness([win(1,[tab(1,A),tab(2,B,false)]),win(2,[tab(3,C,false)])]); await h.controller.idle();
  await Promise.all([h.chrome.tabs.update(2,{pinned:true}),h.chrome.tabs.update(2,{pinned:false}),h.window(win(4,[tab(4,C,false)]))]);
  await h.controller.idle(); assert.deepEqual(h.pins(),[[A],[A],[A]]);
});
test('popup pin does not leak into canonical list',async()=>{
  const h=harness([win(1,[tab(1,A)]),win(2,[tab(2,B,false)],{type:'popup'})]); await h.controller.idle();
  await h.chrome.tabs.update(2,{pinned:true}); await h.controller.idle();
  assert.deepEqual(h.data.local['arc:pinnedTabs'],[A]);
});
test('deterministic mutation sequence converges without duplicate pins or storms',async()=>{
  const h=harness([win(1,[tab(1,A),tab(2,B,false),tab(3,C,false)]),win(2,[tab(4,C,false)])]); await h.controller.idle();
  let seed=1337;
  for(let i=0;i<80;i++){
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    const w=h.ws[seed%2]; const t=w.tabs[(seed>>>4)%w.tabs.length];
    if(seed%3===0 && t.pinned) await h.chrome.tabs.move(t.id,{index:(seed>>>8)%Math.max(1,w.tabs.filter(t=>t.pinned).length)});
    else await h.chrome.tabs.update(t.id,{pinned:!t.pinned});
    await h.controller.idle();
    const ids=h.data.session['arc:pinnedInstances'];
    const orders=h.ws.map(w=>w.tabs.filter(t=>t.pinned).map(t=>ids[t.id].url));
    assert.deepEqual(orders[0],orders[1]);
    assert.equal(new Set(orders[0]).size,orders[0].length);
  }
  assert.ok(h.calls.length<1500);
});

test('full browser restart retains canonical identity of a navigated pin',async()=>{
  const h=harness([win(1,[tab(1,A)]),win(2,[tab(2,B,false)])]); await h.controller.idle();
  await h.chrome.tabs.update(1,{url:C}); await h.controller.idle();
  const data={local:structuredClone(h.data.local),session:{}};
  const restored=harness([win(11,[tab(11,C)]),win(12,[tab(12,A)])],data);
  await restored.controller.idle();
  assert.deepEqual(data.local['arc:pinnedTabs'],[A]);
  assert.equal(restored.ws[0].tabs.length,1);
  assert.equal(restored.ws[0].tabs[0].url,C);
});
