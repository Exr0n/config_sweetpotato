const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const search = require('../search.js');

function harness() {
  const local = {};
  const calls = [];
  const toolbarListeners = [];
  const tabs = [
    { id: 1, windowId: 10, index: 0, title: 'Alpha', url: 'https://example.com/a', pinned: true, mutedInfo: { muted: true } },
    { id: 2, windowId: 10, index: 1, title: 'Bravo', url: 'https://example.com/b', active: true },
    { id: 3, windowId: 10, index: 2, title: 'New Tab', url: 'chrome://newtab/' },
    { id: 4, windowId: 10, index: 3, title: 'Arc', url: 'chrome-extension://arc/palette.html' },
    { id: 5, windowId: 20, index: 0, title: 'Other window', url: 'https://other.example.com/' }
  ];
  const event = { addListener() {} };
  const area = data => ({
    async get(key) { return structuredClone(key == null ? data : typeof key === 'string' ? { [key]: data[key] } : { ...key, ...data }); },
    async set(values) { Object.assign(data, structuredClone(values)); },
    async remove(key) { delete data[key]; }
  });
  const chrome = {
    action: {
      onClicked: { addListener(listener) { toolbarListeners.push(listener); } },
      async setPopup(props) { calls.push(['setPopup', props]); },
      async openPopup(props) { calls.push(['openPopup', props]); }
    },
    runtime: { getURL: path => 'chrome-extension://arc/' + path, onMessage: event },
    storage: { local: area(local), session: area({}), sync: area({}) },
    tabs: {
      onActivated: event, onRemoved: event, onReplaced: event,
      async query(query) { return tabs.filter(t => query.windowId == null || t.windowId === query.windowId).map(t => ({ ...t })); },
      async get(id) { const tab = tabs.find(t => t.id === id); if (!tab) throw new Error('Tab is gone'); return { ...tab }; },
      async update(id, props) { calls.push(['update', id, props]); return { id, ...props }; },
      async create(props) { calls.push(['create', props]); return { id: 100 }; },
      async duplicate(id) { calls.push(['duplicate', id]); },
      async remove(id) { calls.push(['remove', id]); }
    },
    windows: {
      async create(props) { calls.push(['window', props]); return { id: 99, tabs: props.url.map((url, i) => ({ id: 100 + i, url })) }; },
      async update(id, props) { calls.push(['focus', id, props]); }
    },
    bookmarks: { async getTree() { return [{ children: [{ id: '1', children: [{ id: 'b', title: 'Bravo Bookmark', url: tabs[1].url }] }] }]; } },
    history: { async search() { return [{ id: 'h', title: 'Bravo History', url: tabs[1].url, visitCount: 3, lastVisitTime: Date.now() }]; } },
    sessions: { async getRecentlyClosed() { return []; } },
    commands: { onCommand: event }
  };
  const context = vm.createContext({ self: { ArcSearch: search, ArcPinnedTabs: { start() { return { withPausedSync: fn => fn() }; } } }, chrome, crypto: webcrypto, importScripts() {}, console, URL, setTimeout });
  vm.runInContext(fs.readFileSync(require.resolve('../background.js'), 'utf8'), context);
  return { context, local, calls, tabs, chrome, toolbarListeners, ctx: { tabId: 2, windowId: 10 } };
}

test('shortcut and toolbar prefer the overlay even when the webpage lacks focus', async () => {
  const { context, chrome, calls, tabs, toolbarListeners } = harness();
  chrome.tabs.sendMessage = async (id, message) => {
    calls.push(['message', id, message]);
    return message.force ? { shown: true } : { shown: false, reason: 'unfocused' };
  };
  await context.handleCommand('toggle-palette', tabs[0]);
  assert.equal(toolbarListeners.length, 1);
  toolbarListeners[0](tabs[0]);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls.filter(c => c[0] === 'message').length, 2);
  assert.ok(calls.every(c => c[0] === 'message' && c[2].force));
  const manifest = JSON.parse(fs.readFileSync(require.resolve('../manifest.json'), 'utf8'));
  assert.equal(manifest.action.default_popup, undefined, 'toolbar clicks must reach the routing handler');
});

test('new tabs and restricted pages use a temporary popup fallback', async () => {
  for (const url of ['chrome://newtab/', 'chrome://settings', 'https://chromewebstore.google.com/detail/example']) {
    const { context, calls } = harness();
    await context.togglePalette({ id: 3, windowId: 10, url });
    assert.deepEqual(calls.map(c => c[0]), ['setPopup', 'openPopup', 'setPopup']);
    assert.equal(calls[0][1].popup, 'popup.html');
    assert.equal(calls[2][1].popup, '', 'subsequent clicks can try the overlay again');
  }
});

test('failed injection uses the popup, and failed popup opening retains the palette-page fallback', async () => {
  const { context, chrome, calls, tabs } = harness();
  chrome.tabs.sendMessage = async () => { throw new Error('No content script'); };
  chrome.scripting = { async executeScript() { throw new Error('Injection unavailable'); } };
  await context.togglePalette(tabs[0]);
  assert.ok(calls.some(c => c[0] === 'openPopup'));
  calls.length = 0;
  chrome.action.openPopup = async () => { throw new Error('Popup unavailable'); };
  await context.togglePalette({ id: 3, windowId: 10, index: 2, url: 'chrome://newtab/' });
  assert.equal(calls.find(c => c[0] === 'create')[1].url, 'chrome-extension://arc/palette.html?from=newtab');
  assert.equal(calls.find(c => c[0] === 'setPopup' && !c[1].popup)[1].tabId, 3);
});

test('scopes isolate sources, include overlapping history and cap results at nine', async () => {
  const { context, ctx, chrome } = harness();
  for (const [query, type] of [['@tabs bravo', 'tab'], ['@bookmarks bravo', 'bookmark'], ['@history bravo', 'history'], ['@actions', 'action']]) {
    const response = await context.handleSearch({ query }, ctx);
    assert.ok(response.groups[0].items.length);
    assert.ok(response.groups[0].items.every(item => item.type === type));
    assert.ok(response.groups[0].items.length <= 9);
  }
  const history = await context.handleSearch({ query: '@history bravo' }, ctx);
  assert.equal(history.groups[0].items[0].id, 'h');
  chrome.tabs.query = () => { throw new Error('Unrelated source should not be fetched'); };
  assert.equal((await context.handleSearch({ query: '@bookmarks bravo' }, ctx)).groups[0].items.length, 1);
  assert.equal((await context.handleSearch({ query: '@wor' }, ctx)).groups[0].items[0].id, 'workspaces');
});

test('scope queries never navigate to the web', async () => {
  const { context, calls, ctx } = harness();
  await context.handleNavigate({ query: '@tabs missing' }, ctx);
  await context.handleNavigate({ query: '@' }, ctx);
  assert.equal(calls.length, 0);
});

test('workspace save captures only this window, preserving order, pins, mute and active tab', async () => {
  const { context, local, ctx } = harness();
  const saved = await context.handleWorkspaceEdit({ name: ' Morning ' }, ctx);
  const workspace = local['workspace:' + saved.id];
  assert.equal(workspace.name, 'Morning');
  assert.deepEqual(workspace.tabs.map(t => t.url), ['https://example.com/a', 'https://example.com/b']);
  assert.equal(workspace.tabs[0].pinned, true);
  assert.equal(workspace.tabs[0].muted, true);
  assert.equal(workspace.tabs[1].active, true);
  const response = await context.handleSearch({ query: 'open morning' }, ctx);
  assert.equal(response.groups[0].items[0].id, saved.id);
});

test('workspace rename, replacement and deletion preserve other saved workspaces', async () => {
  const { context, local, tabs, ctx } = harness();
  const first = await context.handleWorkspaceEdit({ name: 'Morning' }, ctx);
  const second = await context.handleWorkspaceEdit({ name: 'Project' }, ctx);
  await context.handleWorkspaceEdit({ id: first.id, name: 'Evening', operation: 'rename' }, ctx);
  assert.equal(local['workspace:' + first.id].name, 'Evening');
  assert.equal(local['workspace:' + first.id].tabs.length, 2);
  tabs[1].url = 'https://updated.example.com/';
  await context.handleWorkspaceEdit({ id: first.id, operation: 'replace' }, ctx);
  assert.equal(local['workspace:' + first.id].tabs[1].url, tabs[1].url);
  await context.handleWorkspaceEdit({ id: first.id, operation: 'delete' }, ctx);
  assert.equal(local['workspace:' + first.id], undefined);
  assert.ok(local['workspace:' + second.id]);
  await assert.rejects(context.readWorkspace(first.id), /no longer exists/);
});

test('invalid and concurrent duplicate saves do not corrupt stored workspaces', async () => {
  const { context, local, ctx, tabs } = harness();
  await assert.rejects(context.handleWorkspaceEdit({ name: '  ' }, ctx), /name/);
  const saves = await Promise.allSettled([
    context.handleWorkspaceEdit({ name: 'Morning' }, ctx),
    context.handleWorkspaceEdit({ name: 'morning' }, ctx)
  ]);
  assert.equal(saves.filter(s => s.status === 'fulfilled').length, 1);
  assert.equal(Object.keys(local).length, 1);
  tabs.splice(0, tabs.length);
  await assert.rejects(context.handleWorkspaceEdit({ name: 'Empty' }, ctx), /no tabs/);
  assert.equal(Object.keys(local).length, 1);
});

test('workspace restoration creates a window and restores tab properties without closing original tabs', async () => {
  const { context, calls, ctx } = harness();
  const saved = await context.handleWorkspaceEdit({ name: 'Morning' }, ctx);
  await context.openWorkspace({ id: saved.id });
  assert.deepEqual(Array.from(calls[0][1].url), ['https://example.com/a', 'https://example.com/b']);
  assert.equal(calls[1][2].pinned, true);
  assert.equal(calls[1][2].muted, true);
  assert.deepEqual(calls[3].slice(0, 2), ['update', 101]);
  assert.equal(calls[3][2].active, true);
  assert.ok(!calls.some(c => c[0] === 'remove'));
});

test('tab menus use live pin/mute state and actions address only the selected tab', async () => {
  const { context, ctx, calls } = harness();
  const result = { type: 'tab', id: 1, pinned: false, muted: false };
  const menu = await context.getResultActions({ result });
  assert.equal(menu.actions[0].id, 'unpin');
  assert.equal(menu.actions[1].id, 'unmute');
  for (const actionId of ['unpin', 'unmute', 'duplicate', 'close-tab']) {
    await context.executeResultAction({ result, actionId }, ctx);
  }
  assert.ok(calls.every(c => c[1] === 1));
  await assert.rejects(context.executeResultAction({ result: { type: 'tab', id: 999 }, actionId: 'pin' }, ctx), /gone/);
  await assert.rejects(context.executeResultAction({ result, actionId: 'invalid' }, ctx), /Unknown/);
});
