// Arc - Background Service Worker
importScripts('search.js', 'pinned-tabs.js');
const sharedPins = self.ArcPinnedTabs.start(chrome);

const { rank, isLikelyUrl, toNavigableUrl, getHost, parseQuery, SCOPES } = self.ArcSearch;

const PALETTE_URL = chrome.runtime.getURL('palette.html');
const EXTENSION_ORIGIN = chrome.runtime.getURL('');
const NEW_TAB_URLS = new Set([
  '',
  'about:blank',
  'chrome://newtab',
  'chrome://new-tab-page',
  'chrome://new-tab-page-third-party',
  'edge://newtab'
]);

const LIMITS = { tabs: 10, bookmarks: 10, actions: 5, closed: 5, history: 6, recents: 5, favorites: 8, homeClosed: 3 };

const SEARCH_ENGINES = {
  google: 'https://www.google.com/search?q=',
  duckduckgo: 'https://duckduckgo.com/?q=',
  bing: 'https://www.bing.com/search?q=',
  brave: 'https://search.brave.com/search?q=',
  ecosia: 'https://www.ecosia.org/search?q=',
  perplexity: 'https://www.perplexity.ai/search?q=',
  chatgpt: 'https://chatgpt.com/?q=',
  gemini: 'https://gemini.google.com/app?q=',
  claude: 'https://claude.ai/new?q='
};

const ACTIONS = [
  { id: 'save-workspace', type: 'action', title: 'Save Workspace', description: 'Save this window’s tabs as a named workspace', icon: '▣', keywords: ['save', 'workspace', 'session'] },
  { id: 'browse-workspaces', type: 'action', title: 'Open Workspace', description: 'Browse your saved workspaces', icon: '▣', keywords: ['open', 'workspace', 'restore', 'session'] },
  {
    id: 'cleanup',
    type: 'action',
    title: 'Cleanup',
    description: 'Close tabs without a matching bookmark, keep one per site',
    icon: '✨',
    keywords: ['cleanup', 'clean', 'tidy', 'organize', 'dedupe', 'close'],
    hasSettings: false
  },
  {
    id: 'reset',
    type: 'action',
    title: 'Reset',
    description: 'Close all tabs and open your home page',
    icon: '💫',
    keywords: ['reset', 'close all', 'fresh', 'clear', 'start over', 'home'],
    hasSettings: true
  },
  {
    id: 'settings',
    type: 'action',
    title: 'Settings',
    description: 'Search engine, theme, shortcuts and reset URL',
    icon: '⚙️',
    keywords: ['settings', 'config', 'configure', 'preferences', 'options', 'search engine', 'theme', 'shortcuts'],
    hasSettings: true
  },
  { id: 'open-bookmarks', type: 'action', title: 'Open Bookmarks', description: 'Chrome bookmark manager', icon: '📚', keywords: ['open', 'bookmarks', 'bookmark manager'], chromeUrl: 'chrome://bookmarks' },
  { id: 'open-extensions', type: 'action', title: 'Open Extensions', description: 'Chrome extensions page', icon: '🧩', keywords: ['open', 'extensions', 'plugins', 'addons'], chromeUrl: 'chrome://extensions' },
  { id: 'open-history', type: 'action', title: 'Open History', description: 'Chrome browsing history', icon: '🕐', keywords: ['open', 'history', 'past', 'visited'], chromeUrl: 'chrome://history' },
  { id: 'open-downloads', type: 'action', title: 'Open Downloads', description: 'Chrome downloads page', icon: '📥', keywords: ['open', 'downloads', 'files'], chromeUrl: 'chrome://downloads' },
  { id: 'open-chrome-settings', type: 'action', title: 'Open Chrome Settings', description: 'Chrome settings page', icon: '🔧', keywords: ['open', 'chrome settings', 'preferences'], chromeUrl: 'chrome://settings' },
  { id: 'open-passwords', type: 'action', title: 'Open Passwords', description: 'Chrome password manager', icon: '🔑', keywords: ['open', 'passwords', 'password manager', 'keys'], chromeUrl: 'chrome://password-manager/passwords' },
  { id: 'open-shortcuts', type: 'action', title: 'Configure Shortcuts', description: 'Change the Arc keyboard shortcuts', icon: '⌨️', keywords: ['shortcuts', 'keyboard', 'keys', 'hotkeys', 'bind'], chromeUrl: 'chrome://extensions/shortcuts' },
  { id: 'reload-extension', type: 'action', title: 'Reload Extension', description: 'Reload Arc (for development)', icon: '🔄', keywords: ['reload', 'refresh', 'restart', 'dev', 'extension'] }
];

// ---------------------------------------------------------------------------
// MRU (most recently used) tab order
// Persisted in chrome.storage.session so it survives the service worker being
// suspended. Seeded from Tab.lastAccessed when the browser starts.
// ---------------------------------------------------------------------------

let mruIds = null;
let mruLoading = null;

function loadMru() {
  if (!mruLoading) {
    mruLoading = (async () => {
      const { mru } = await chrome.storage.session.get('mru');
      if (Array.isArray(mru) && mru.length) {
        mruIds = mru;
        return;
      }
      const tabs = await chrome.tabs.query({});
      tabs.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
      mruIds = tabs.map(t => t.id);
      saveMru();
    })();
  }
  return mruLoading;
}

function saveMru() {
  chrome.storage.session.set({ mru: mruIds.slice(0, 300) });
}

async function touchMru(tabId) {
  await loadMru();
  mruIds = [tabId, ...mruIds.filter(id => id !== tabId)];
  saveMru();
}

async function forgetMru(tabId) {
  await loadMru();
  mruIds = mruIds.filter(id => id !== tabId);
  saveMru();
}

chrome.tabs.onActivated.addListener(({ tabId }) => touchMru(tabId));
chrome.tabs.onRemoved.addListener(tabId => forgetMru(tabId));
chrome.tabs.onReplaced.addListener(async (addedTabId, removedTabId) => {
  await loadMru();
  mruIds = mruIds.map(id => (id === removedTabId ? addedTabId : id));
  saveMru();
});

function toTabResult(tab, mruIndex) {
  const url = tab.url || tab.pendingUrl || '';
  return {
    type: 'tab',
    id: tab.id,
    windowId: tab.windowId,
    title: tab.title || getHost(url) || 'Untitled',
    url,
    host: getHost(url),
    active: !!tab.active,
    pinned: !!tab.pinned,
    audible: !!tab.audible,
    muted: !!tab.mutedInfo?.muted,
    mruIndex
  };
}

// Tabs of one window, most recently used first (the active tab is always first).
async function getMruTabs(windowId) {
  await loadMru();
  const query = windowId != null ? { windowId } : { lastFocusedWindow: true };
  const tabs = await chrome.tabs.query(query);
  const order = new Map(mruIds.map((id, i) => [id, i]));
  tabs.sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1;
    const ai = order.has(a.id) ? order.get(a.id) : Infinity;
    const bi = order.has(b.id) ? order.get(b.id) : Infinity;
    if (ai !== bi) return ai - bi;
    return (b.lastAccessed || 0) - (a.lastAccessed || 0);
  });
  return tabs.map(toTabResult);
}

// ---------------------------------------------------------------------------
// Bookmarks (cached, invalidated on any bookmark change)
// ---------------------------------------------------------------------------

let bookmarkCache = null;

function invalidateBookmarks() {
  bookmarkCache = null;
}

for (const event of ['onCreated', 'onRemoved', 'onChanged', 'onMoved', 'onChildrenReordered', 'onImportEnded']) {
  chrome.bookmarks[event]?.addListener(invalidateBookmarks);
}

function toBookmarkResult(node, folder) {
  const host = getHost(node.url);
  const title = node.title && node.title.trim() ? node.title.trim() : host || node.url;
  return { type: 'bookmark', id: node.id, title, url: node.url, host, folder };
}

async function getBookmarks() {
  if (bookmarkCache) return bookmarkCache;
  const tree = await chrome.bookmarks.getTree();
  const all = [];
  const seen = new Set();
  const favorites = [];

  const walk = (nodes, folder) => {
    for (const node of nodes) {
      if (node.url) {
        if (seen.has(node.url)) continue;
        seen.add(node.url);
        all.push(toBookmarkResult(node, folder));
      } else if (node.children) {
        walk(node.children, node.title || folder);
      }
    }
  };

  const roots = tree[0]?.children || [];
  const bar = roots.find(n => n.folderType === 'bookmarks-bar') || roots.find(n => n.id === '1') || roots[0];
  for (const node of bar?.children || []) {
    if (node.url) favorites.push(toBookmarkResult(node, bar.title));
  }
  walk(tree, '');

  bookmarkCache = { all, favorites };
  return bookmarkCache;
}

// ---------------------------------------------------------------------------
// Recently closed tabs and browsing history
// ---------------------------------------------------------------------------

function isSearchableUrl(url) {
  return /^(https?|file):/i.test(url) && !url.startsWith(EXTENSION_ORIGIN) && !isBlankTab(url);
}

// Tabs the user closed recently, newest first. Tabs inside a closed window are
// listed individually so any of them can be brought back on its own.
async function getRecentlyClosed() {
  if (!chrome.sessions) return [];
  let sessions;
  try {
    sessions = await chrome.sessions.getRecentlyClosed({ maxResults: 25 });
  } catch {
    return [];
  }
  const items = [];
  const seen = new Set();
  for (const session of sessions) {
    const tabs = session.tab ? [session.tab] : session.window?.tabs || [];
    for (const tab of tabs) {
      const url = tab.url || '';
      if (!tab.sessionId || !isSearchableUrl(url) || seen.has(url)) continue;
      seen.add(url);
      items.push({
        type: 'closed',
        id: tab.sessionId,
        title: (tab.title || '').trim() || getHost(url) || url,
        url,
        host: getHost(url),
        closedAt: (session.lastModified || 0) * 1000,
        closedIndex: items.length
      });
    }
  }
  return items;
}

async function getHistory(query) {
  if (!chrome.history) return [];
  let entries;
  try {
    // startTime defaults to the last 24 hours; we want everything.
    entries = await chrome.history.search({ text: query, maxResults: 80, startTime: 0 });
  } catch {
    return [];
  }
  return entries
    .filter(entry => isSearchableUrl(entry.url || ''))
    .map(entry => ({
      type: 'history',
      id: entry.id,
      title: (entry.title || '').trim() || getHost(entry.url) || entry.url,
      url: entry.url,
      host: getHost(entry.url),
      visitCount: entry.visitCount || 0,
      lastVisitTime: entry.lastVisitTime || 0
    }));
}

// Often-visited and recently visited pages float up.
function historyBoost(entry) {
  const age = Date.now() - entry.lastVisitTime;
  const recency = age < 86400000 ? 4 : age < 7 * 86400000 ? 2 : 0;
  return Math.min(8, Math.log2(entry.visitCount + 1) * 1.5) + recency;
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

async function handleSearch({ query }, ctx) {
  const { scope, query: q } = parseQuery(query);
  if (!scope && /^@\w*$/.test(q)) {
    return { groups: [{ label: 'Search in', items: SCOPES.filter(s => s.startsWith(q.slice(1).toLowerCase())).map(s => ({
      type: 'scope', id: s, title: `@${s}`, description: `Search ${s === 'closed' ? 'recently closed tabs' : s}`, icon: '@'
    })) }] };
  }
  if (scope) {
    let items;
    switch (scope) {
      case 'tabs': items = await getMruTabs(ctx.windowId); break;
      case 'bookmarks': items = (await getBookmarks()).all; break;
      case 'history': items = await getHistory(q); break;
      case 'closed': items = await getRecentlyClosed(); break;
      case 'actions': items = ACTIONS; break;
      case 'workspaces': items = await getWorkspaces(); break;
    }
    const matches = q ? rank(items, q, { limit: 9, boost: scope === 'history' ? historyBoost : undefined }) : items.slice(0, 9);
    if (scope === 'workspaces' && !q) matches.unshift(ACTIONS.find(a => a.id === 'save-workspace'));
    return { groups: [{ label: scope === 'closed' ? 'Recently closed' : scope[0].toUpperCase() + scope.slice(1), items: matches.slice(0, 9) }] };
  }
  if (!q) return { groups: [] };

  const [tabs, { all: bookmarks }, closed, history, workspaces] = await Promise.all([
    getMruTabs(ctx.windowId),
    getBookmarks(),
    getRecentlyClosed(),
    getHistory(q),
    getWorkspaces()
  ]);

  const tabItems = rank(tabs, q, {
    limit: LIMITS.tabs,
    boost: tab => Math.max(0, 6 - tab.mruIndex) // recently used tabs float up
  });
  const bookmarkItems = rank(bookmarks, q, { limit: LIMITS.bookmarks });
  const actionItems = rank(ACTIONS, q, { limit: LIMITS.actions });
  const closedItems = rank(closed, q, {
    limit: LIMITS.closed,
    boost: tab => Math.max(0, 5 - tab.closedIndex) // the tab closed last is the likely one
  });

  // History only adds pages that are not already on screen as a tab, bookmark or
  // closed tab. Open tabs of any window count, since the tab list covers them.
  const shown = new Set(
    [...tabs, ...bookmarkItems, ...closedItems].map(item => normalizeUrl(item.url))
  );
  const historyItems = rank(
    history.filter(entry => !shown.has(normalizeUrl(entry.url))),
    q,
    { limit: LIMITS.history, boost: historyBoost }
  );

  return {
    groups: [
      { id: 'workspaces', label: 'Workspaces', items: rank(workspaces, q, { limit: 9 }) },
      { id: 'tabs', label: 'Tabs', items: tabItems },
      { id: 'bookmarks', label: 'Bookmarks', items: bookmarkItems },
      { id: 'actions', label: 'Actions', items: actionItems },
      { id: 'closed', label: 'Recently closed', items: closedItems },
      { id: 'history', label: 'History', items: historyItems }
    ].filter(g => g.items.length)
  };
}

// Shown when the palette opens with an empty query.
async function handleHome(_msg, ctx) {
  const [tabs, { favorites }, closed] = await Promise.all([getMruTabs(ctx.windowId), getBookmarks(), getRecentlyClosed()]);
  const recents = tabs
    .filter(t => !t.active && t.id !== ctx.tabId && !isBlankTab(t.url))
    .slice(0, LIMITS.recents);
  return {
    groups: [
      { id: 'recent', label: 'Recent tabs', items: recents },
      { id: 'favorites', label: 'Favorites', items: favorites.slice(0, LIMITS.favorites) },
      { id: 'closed', label: 'Recently closed', items: closed.slice(0, LIMITS.homeClosed) }
    ].filter(g => g.items.length)
  };
}

// ---------------------------------------------------------------------------
// Opening things
// ---------------------------------------------------------------------------

async function createTab(url, ctx) {
  const props = { url };
  if (ctx.windowId != null) props.windowId = ctx.windowId;
  if (ctx.tabId != null && ctx.windowId != null) props.openerTabId = ctx.tabId; // places the tab next to the current one
  try {
    return await chrome.tabs.create(props);
  } catch {
    return chrome.tabs.create({ url });
  }
}

async function navigateTo(url, disposition, ctx) {
  if (disposition === 'currentTab' && ctx.tabId != null) {
    try {
      await chrome.tabs.update(ctx.tabId, { url });
      return;
    } catch {
      // fall through to a new tab
    }
  }
  await createTab(url, ctx);
}

async function handleOpen({ result, disposition = 'newTab', closeSource = false }, ctx) {
  if (!result) return { success: false };
  if (result.type === 'tab') {
    await chrome.tabs.update(result.id, { active: true });
    if (result.windowId != null && result.windowId !== ctx.windowId) {
      await chrome.windows.update(result.windowId, { focused: true });
    }
    if (closeSource && ctx.tabId != null && ctx.tabId !== result.id) {
      chrome.tabs.remove(ctx.tabId).catch(() => {});
    }
    return { success: true };
  }
  if (result.type === 'closed') return restoreClosed(result, disposition, closeSource, ctx);
  await navigateTo(result.url, disposition, ctx);
  return { success: true };
}

// Bring back a closed tab with its history intact. Chrome puts it in the window it
// came from when that window still exists, so focus follows it. If the session
// entry is gone (another restore, or Chrome pruned it) fall back to a fresh tab.
async function restoreClosed(result, disposition, closeSource, ctx) {
  let restored = null;
  try {
    restored = await chrome.sessions.restore(result.id);
  } catch {
    restored = null;
  }
  const tab = restored?.tab || restored?.window?.tabs?.find(t => t.active) || restored?.window?.tabs?.[0];
  if (!tab) {
    await navigateTo(result.url, disposition, ctx);
    return { success: true, restored: false };
  }
  await chrome.tabs.update(tab.id, { active: true }).catch(() => {});
  if (tab.windowId != null && tab.windowId !== ctx.windowId) {
    await chrome.windows.update(tab.windowId, { focused: true }).catch(() => {});
  }
  if (closeSource && ctx.tabId != null && ctx.tabId !== tab.id) {
    chrome.tabs.remove(ctx.tabId).catch(() => {});
  }
  return { success: true, restored: true };
}

async function handleNavigate({ query, disposition = 'newTab' }, ctx) {
  if (parseQuery(query).scope || /^@\w*$/.test((query || '').trim())) return { success: false };
  const q = (query || '').trim();
  if (!q) return { success: false };
  let url;
  if (isLikelyUrl(q)) {
    url = toNavigableUrl(q);
  } else {
    const { searchEngine = 'google' } = await chrome.storage.sync.get('searchEngine');
    url = (SEARCH_ENGINES[searchEngine] || SEARCH_ENGINES.google) + encodeURIComponent(q);
  }
  await navigateTo(url, disposition, ctx);
  return { success: true, url };
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

const WORKSPACE_PREFIX = 'workspace:';

async function getWorkspaces() {
  const stored = await chrome.storage.local.get(null);
  return Object.entries(stored)
    .filter(([key, value]) => key.startsWith(WORKSPACE_PREFIX) && Array.isArray(value?.tabs))
    .map(([key, value]) => ({
      type: 'workspace', id: key.slice(WORKSPACE_PREFIX.length), title: value.name,
      description: `${value.tabs.length} tab${value.tabs.length === 1 ? '' : 's'} · Opens in a new window`,
      icon: '▣', keywords: ['open', 'workspace', 'restore', 'session'], updatedAt: value.updatedAt
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

async function readWorkspace(id) {
  const key = WORKSPACE_PREFIX + id;
  const workspace = (await chrome.storage.local.get(key))[key];
  if (!workspace?.tabs?.length) throw new Error('This workspace no longer exists.');
  return workspace;
}

async function saveWorkspace({ id, name, operation = 'save' }, ctx) {
  const existing = id ? await readWorkspace(id) : null;
  if (operation === 'delete') {
    if (!existing) throw new Error('Choose a workspace to delete.');
    await chrome.storage.local.remove(WORKSPACE_PREFIX + id);
    return { success: true };
  }
  if (!['save', 'rename', 'replace'].includes(operation)) throw new Error('Unknown workspace action.');
  if (operation !== 'save' && !existing) throw new Error('Choose a workspace first.');
  const title = String(name ?? existing?.name ?? '').trim();
  if (!title || title.length > 80) throw new Error('Enter a workspace name between 1 and 80 characters.');
  const others = await getWorkspaces();
  if (others.some(w => w.id !== id && w.title.toLowerCase() === title.toLowerCase())) {
    throw new Error('A workspace with that name already exists. Choose another name.');
  }
  let workspace = { ...existing, name: title, updatedAt: Date.now() };
  if (operation !== 'rename') {
    const tabs = await chrome.tabs.query(ctx.windowId != null ? { windowId: ctx.windowId } : { lastFocusedWindow: true });
    workspace.incognito = !!tabs[0]?.incognito;
    workspace.tabs = tabs.sort((a, b) => a.index - b.index)
      .filter(tab => {
        const url = tab.pendingUrl || tab.url || '';
        return /^(https?|file|ftp|chrome|edge):/i.test(url) && !isBlankTab(url);
      })
      .map(tab => ({ url: tab.pendingUrl || tab.url, title: tab.title || '', pinned: !!tab.pinned, muted: !!tab.mutedInfo?.muted, active: !!tab.active }));
    if (!workspace.tabs.length) throw new Error('This window has no tabs to save.');
  }
  const workspaceId = id || crypto.randomUUID();
  await chrome.storage.local.set({ [WORKSPACE_PREFIX + workspaceId]: workspace });
  return { success: true, id: workspaceId, count: workspace.tabs.length };
}

// Serialize edits so simultaneous palettes cannot overwrite each other's saves.
let workspaceEdits = Promise.resolve();
function handleWorkspaceEdit(message, ctx) {
  const edit = workspaceEdits.then(() => saveWorkspace(message, ctx));
  workspaceEdits = edit.catch(() => {});
  return edit;
}

function openWorkspace(message) {
  return sharedPins.withPausedSync(() => restoreWorkspace(message));
}

async function restoreWorkspace({ id }) {
  const workspace = await readWorkspace(id);
  const opened = await chrome.windows.create({ url: workspace.tabs.map(t => t.url), focused: false, incognito: !!workspace.incognito });
  const tabs = opened.tabs || await chrome.tabs.query({ windowId: opened.id });
  // Pin from left to right, retaining the saved order of pinned tabs.
  for (const [index, tab] of tabs.entries()) {
    const saved = workspace.tabs[index];
    await chrome.tabs.update(tab.id, { pinned: !!saved.pinned, muted: !!saved.muted });
  }
  const activeIndex = Math.max(0, workspace.tabs.findIndex(t => t.active));
  await chrome.tabs.update(tabs[activeIndex].id, { active: true });
  await chrome.windows.update(opened.id, { focused: true });
  return { success: true };
}

async function getResultActions({ result }) {
  const actions = [];
  const add = (id, title, description, icon = '↗') => actions.push({ type: 'action', id, title, description, icon, resultAction: true });
  if (result?.type === 'workspace') {
    await readWorkspace(result.id);
    add('workspace-open', 'Open workspace', 'Restore these tabs in a new window', '▣');
    add('workspace-rename', 'Rename workspace', 'Give this workspace a new name', '✎');
    add('workspace-replace', 'Replace with current tabs', 'Update the saved workspace using this window', '↻');
    add('workspace-delete', 'Delete workspace', 'Remove the saved workspace; open tabs stay open', '×');
  } else if (result?.type === 'tab') {
    const tab = await chrome.tabs.get(result.id);
    add(tab.pinned ? 'unpin' : 'pin', tab.pinned ? 'Unpin tab' : 'Pin tab',
      tab.pinned ? 'Return this tab to normal size beside your unpinned tabs' : 'Keep this tab as a compact icon at the left of the tab bar', '⌖');
    add(tab.mutedInfo?.muted ? 'unmute' : 'mute', tab.mutedInfo?.muted ? 'Unmute tab' : 'Mute tab',
      tab.mutedInfo?.muted ? 'Allow this tab to play sound again' : 'Silence all sound from this tab', '♪');
    add('duplicate', 'Duplicate tab', 'Open a copy of this tab');
    add('move-window', 'Move to new window', 'Move this tab into its own window');
    add('copy-url', 'Copy URL', tab.url || tab.pendingUrl, '⧉');
    add('close-tab', 'Close tab', tab.title, '×');
  } else if (['bookmark', 'history', 'closed'].includes(result?.type)) {
    add('new-tab', 'Open in new tab', result.url);
    add('new-window', 'Open in new window', result.url);
    add('copy-url', 'Copy URL', result.url, '⧉');
  }
  return { success: true, actions };
}

async function executeResultAction({ result, actionId }, ctx) {
  if (result?.type === 'tab') {
    const tab = await chrome.tabs.get(result.id);
    switch (actionId) {
      case 'pin': case 'unpin': await chrome.tabs.update(tab.id, { pinned: actionId === 'pin' }); break;
      case 'mute': case 'unmute': await chrome.tabs.update(tab.id, { muted: actionId === 'mute' }); break;
      case 'duplicate': await chrome.tabs.duplicate(tab.id); break;
      case 'move-window': await chrome.windows.create({ tabId: tab.id, incognito: !!tab.incognito }); break;
      case 'close-tab': await chrome.tabs.remove(tab.id); break;
      default: throw new Error('Unknown tab action.');
    }
  } else if (['bookmark', 'history', 'closed'].includes(result?.type)) {
    if (actionId === 'new-tab') await createTab(result.url, ctx);
    else if (actionId === 'new-window') {
      const source = ctx.tabId != null ? await chrome.tabs.get(ctx.tabId) : null;
      await chrome.windows.create({ url: result.url, incognito: !!source?.incognito });
    } else throw new Error('Unknown result action.');
  } else throw new Error('This result has no tab actions.');
  return { success: true };
}

async function executeAction({ actionId }, ctx) {
  const action = ACTIONS.find(a => a.id === actionId);
  if (!action) return { success: false, error: 'Unknown action' };
  if (action.chromeUrl) {
    await createTab(action.chromeUrl, ctx);
    return { success: true, message: `Opened ${action.title}` };
  }
  switch (actionId) {
    case 'cleanup':
      return actionCleanup(ctx);
    case 'reset':
      return actionReset(ctx);
    case 'reload-extension':
      setTimeout(() => chrome.runtime.reload(), 50);
      return { success: true };
    default:
      return { success: true };
  }
}

async function actionReset(ctx) {
  const { resetUrl } = await chrome.storage.sync.get('resetUrl');
  const url = (resetUrl || '').trim() || 'chrome://newtab';
  const query = ctx.windowId != null ? { windowId: ctx.windowId } : { lastFocusedWindow: true };
  const tabs = await chrome.tabs.query(query);
  const created = await chrome.tabs.create(ctx.windowId != null ? { url, windowId: ctx.windowId } : { url });
  const ids = tabs.map(t => t.id).filter(id => id !== created.id);
  if (ids.length) await chrome.tabs.remove(ids);
  return { success: true, message: `Closed ${ids.length} tab${ids.length === 1 ? '' : 's'}` };
}

// Close every tab whose site is not bookmarked, and duplicate tabs of bookmarked
// sites. The current tab is always kept.
async function actionCleanup(ctx) {
  const { all } = await getBookmarks();
  const bookmarkedHosts = new Set(all.map(b => b.host).filter(Boolean));
  const query = ctx.windowId != null ? { windowId: ctx.windowId } : { lastFocusedWindow: true };
  const tabs = await chrome.tabs.query(query);

  const toClose = [];
  const keptHosts = new Set();
  const current = tabs.find(t => t.id === ctx.tabId) || tabs.find(t => t.active);
  if (current) keptHosts.add(getHost(current.url || current.pendingUrl));

  for (const tab of tabs) {
    if (tab.id === current?.id) continue;
    const url = tab.url || tab.pendingUrl || '';
    const host = getHost(url);
    if (!host || !/^https?:/.test(url)) continue; // leave chrome:// and friends alone
    if (!bookmarkedHosts.has(host) || keptHosts.has(host)) toClose.push(tab.id);
    else keptHosts.add(host);
  }

  if (toClose.length) await chrome.tabs.remove(toClose);
  return { success: true, closed: toClose.length, kept: tabs.length - toClose.length };
}

// ---------------------------------------------------------------------------
// Delivering the palette to the active tab
// ---------------------------------------------------------------------------

function normalizeUrl(url) {
  return (url || '').replace(/\/+$/, '');
}

function isBlankTab(url) {
  return NEW_TAB_URLS.has(normalizeUrl(url));
}

function isInjectable(url) {
  if (!/^(https?|file|ftp):/i.test(url)) return false;
  return !/^https:\/\/(chromewebstore\.google\.com|chrome\.google\.com\/webstore)/i.test(url);
}

async function tryMessage(tabId, message) {
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch {
    return undefined;
  }
}

// Sends `message` to the palette in `tab`, injecting it first if needed.
// Resolves with the palette's response, or undefined when the tab cannot host it.
async function deliver(tab, message) {
  const url = tab.url || tab.pendingUrl || '';
  if (url.startsWith(EXTENSION_ORIGIN)) return tryMessage(tab.id, message);
  if (!isInjectable(url)) return undefined;

  const response = await tryMessage(tab.id, message);
  if (response !== undefined) return response;

  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['search.js', 'palette.js'] });
  } catch (error) {
    console.debug('Arc: cannot inject into', url, error?.message);
    return undefined;
  }
  return tryMessage(tab.id, message);
}

// Navigating a blank tab in place would leave keyboard focus in the omnibox
// (Chrome keeps it there for new-tab pages). A freshly created tab with a real
// URL gets focus, so the blank tab is replaced by a new one in the same spot.
async function openPalettePage(tab, from) {
  const url = `${PALETTE_URL}?from=${from}`;
  const index = from === 'newtab' ? tab.index : tab.index + 1;
  await chrome.tabs.create({ url, windowId: tab.windowId, index, active: true });
  if (from === 'newtab') chrome.tabs.remove(tab.id).catch(() => {});
}

async function openPopup(tab) {
  if (!chrome.action?.openPopup) return false;
  try {
    // Configure the popup only while opening the fallback. Leaving a popup set
    // would bypass onClicked and make later toolbar clicks skip the overlay.
    await chrome.action.setPopup({ tabId: tab.id, popup: 'popup.html' });
    await chrome.action.openPopup({ windowId: tab.windowId });
    return true;
  } catch (error) {
    console.debug('Arc: openPopup failed', error?.message);
    return false;
  } finally {
    await chrome.action.setPopup({ tabId: tab.id, popup: '' }).catch(() => {});
  }
}

async function togglePalette(tab) {
  const url = tab.url || tab.pendingUrl || '';
  // Both the shortcut and toolbar click prefer the overlay, even when focus
  // started in the browser chrome rather than the webpage.
  const response = await deliver(tab, { action: 'toggle', force: true });
  if (response?.shown || response?.closed) return;

  // Blank tabs and chrome:// pages cannot host the overlay. The toolbar popup is
  // the one surface that reliably takes keyboard focus away from the omnibox,
  // so prefer it; fall back to a palette tab where openPopup is unavailable.
  if (await openPopup(tab)) return;
  await openPalettePage(tab, isBlankTab(url) ? 'newtab' : 'tab');
}

const SHORTCUT_MODIFIERS = [
  [/ctrl|⌃|control/i, 'Control'],
  [/alt|option|⌥/i, 'Alt'],
  [/command|cmd|⌘/i, 'Meta'],
  [/shift|⇧/i, 'Shift']
];

async function getSwitchShortcut() {
  const fallback = { modifiers: ['Control'], key: 'q', label: 'Ctrl+Q' };
  try {
    const commands = await chrome.commands.getAll();
    const shortcut = commands.find(c => c.name === 'quick-switch')?.shortcut;
    if (!shortcut) return fallback;
    const modifiers = SHORTCUT_MODIFIERS.filter(([re]) => re.test(shortcut.replace(/MacCtrl/i, 'Ctrl'))).map(([, name]) => name);
    const key = (shortcut.match(/([a-z0-9])$/i)?.[1] || 'q').toLowerCase();
    return { modifiers: modifiers.length ? modifiers : fallback.modifiers, key, label: shortcut };
  } catch {
    return fallback;
  }
}

async function quickSwitch(tab) {
  const tabs = await getMruTabs(tab.windowId);
  if (tabs.length < 2) return;
  const previous = tabs.find(t => !t.active) || tabs[1];

  const shortcut = await getSwitchShortcut();
  const response = await deliver(tab, { action: 'quick-switch', tabs, shortcut });
  if (response?.shown) return;

  // No palette available in this tab (chrome:// page, omnibox focused, etc.):
  // behave like a single tap and jump straight to the previous tab.
  await chrome.tabs.update(previous.id, { active: true });
}

async function handleCommand(command, tab) {
  if (!tab?.id) {
    [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  }
  if (!tab?.id) return;
  if (command === 'toggle-palette') await togglePalette(tab);
  else if (command === 'quick-switch') await quickSwitch(tab);
}

chrome.commands.onCommand.addListener((command, tab) => {
  handleCommand(command, tab).catch(error => console.warn('Arc:', command, error));
});

chrome.action.onClicked.addListener(tab => {
  handleCommand('toggle-palette', tab).catch(error => console.warn('Arc: toolbar click', error));
});

// ---------------------------------------------------------------------------
// Messages from the palette UI
// ---------------------------------------------------------------------------

const HANDLERS = {
  resultActions: getResultActions,
  executeResultAction,
  editWorkspace: handleWorkspaceEdit,
  openWorkspace,
  search: handleSearch,
  home: handleHome,
  open: handleOpen,
  navigate: handleNavigate,
  executeAction,
  mruTabs: (_msg, ctx) => getMruTabs(ctx.windowId),
  getCommands: () => chrome.commands.getAll(),
  openShortcuts: (_msg, ctx) => createTab('chrome://extensions/shortcuts', ctx),
  closeSelf: async ({ replaceWith }, ctx) => {
    if (ctx.tabId == null) return { success: false };
    if (replaceWith) await chrome.tabs.update(ctx.tabId, { url: replaceWith });
    else await chrome.tabs.remove(ctx.tabId);
    return { success: true };
  },
  reload: () => {
    setTimeout(() => chrome.runtime.reload(), 50);
    return { success: true };
  }
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handler = HANDLERS[message?.action];
  if (!handler) return false;
  const ctx = {
    tabId: message.ctx?.tabId ?? sender.tab?.id,
    windowId: message.ctx?.windowId ?? sender.tab?.windowId
  };
  Promise.resolve()
    .then(() => handler(message, ctx))
    .then(result => sendResponse(result ?? null))
    .catch(error => {
      console.warn('Arc:', message.action, error);
      sendResponse({ success: false, error: String(error?.message || error) });
    });
  return true;
});

// Warm the caches so the first palette open is instant.
loadMru();
getBookmarks().catch(() => {});
