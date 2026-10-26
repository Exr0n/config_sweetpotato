// Arc - Palette UI
//
// One script, three homes:
//   overlay - injected into web pages on demand and rendered inside a closed shadow
//             root, so page CSS cannot touch it and it cannot touch the page
//   page    - palette.html, used when the active tab is a blank new tab (or a tab
//             that cannot host content scripts)
//   popup   - popup.html, the toolbar popup and the fallback for chrome:// pages
(() => {
  'use strict';

  const IS_EXTENSION_PAGE = location.protocol === 'chrome-extension:';
  const MODE = IS_EXTENSION_PAGE ? document.body?.dataset.mode || 'page' : 'overlay';
  const PAGE_FROM = IS_EXTENSION_PAGE ? new URLSearchParams(location.search).get('from') || '' : '';
  const FAVICON_BASE = chrome.runtime.getURL('/_favicon/');
  const { parseQuery } = globalThis.ArcSearch;

  // The isolated world survives an extension reload but its chrome.* bindings do not.
  // Tear down any instance a previous version of this script left behind.
  if (globalThis.__arc?.destroy) {
    try { globalThis.__arc.destroy(); } catch { /* ignore */ }
  }

  const DEFAULT_SETTINGS = { searchEngine: 'google', resetUrl: '', theme: 'dark' };
  const SEARCH_ENGINES = [
    ['google', 'Google'],
    ['duckduckgo', 'DuckDuckGo'],
    ['bing', 'Bing'],
    ['brave', 'Brave Search'],
    ['ecosia', 'Ecosia'],
    ['perplexity', 'Perplexity'],
    ['chatgpt', 'ChatGPT'],
    ['gemini', 'Gemini'],
    ['claude', 'Claude']
  ];
  const THEMES = [
    ['dark', 'Dark'],
    ['light', 'Light'],
    ['system', 'Match system']
  ];
  const MODIFIER_KEYS = new Set(['Control', 'Alt', 'Meta', 'Shift', 'CapsLock']);
  const BLANK_TAB_URLS = new Set(['', 'about:blank', 'chrome://newtab', 'chrome://new-tab-page', 'chrome://new-tab-page-third-party', 'edge://newtab']);

  function isBlankTabUrl(url) {
    return BLANK_TAB_URLS.has((url || '').replace(/\/+$/, ''));
  }
  const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform);
  // Hold this key and the first nine results show a number; tap it to jump there.
  // Super/Windows is owned by the OS, so it is Ctrl everywhere but the Mac.
  const JUMP_MODIFIER = IS_MAC ? 'Meta' : 'Control';
  const JUMP_GLYPH = IS_MAC ? '⌘' : 'ctrl';
  const JUMP_COUNT = 9;
  const WORKSPACE_SHORTCUT = IS_MAC ? '⌥W' : 'Alt+W';

  const TEMPLATE = `
    <div class="arc-root">
      <div class="arc-backdrop"></div>
      <div class="arc-panel" role="dialog" aria-label="Arc command palette">
        <div class="arc-search">
          <svg class="arc-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="M20 20l-3.5-3.5"></path></svg>
          <input class="arc-input" type="text" placeholder="Search anything, or type @ to choose a scope" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" aria-label="Search tabs, bookmarks, history, actions and workspaces">
          <button class="arc-clear" type="button" aria-label="Clear search" tabindex="-1"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"></path></svg></button>
        </div>
        <div class="arc-banner" hidden></div>
        <div class="arc-results" role="listbox" tabindex="-1"></div>
        <div class="arc-footer"></div>
      </div>
    </div>
    <div class="arc-toast" role="status" aria-live="polite"></div>
  `;

  const state = {
    open: false,
    view: 'list', // list | switch | settings | resetUrl | resultActions | workspaceForm
    returnTo: null,
    actionTarget: null,
    busy: false,
    query: '',
    groups: [],
    items: [],
    selected: 0,
    keyboardMode: true,
    numbered: false, // the jump modifier is held: rows show their number
    seq: 0,
    missingShortcuts: [],
    settings: { ...DEFAULT_SETTINGS },
    ctx: null, // { tabId, windowId } - only needed by the popup, which has no sender.tab
    blankSource: false, // popup opened over a blank tab: behave like the new-tab palette
    restoreFocus: null,
    switchActive: false,
    switchTabs: null,
    switchShortcut: null,
    toastTimer: null
  };

  const dom = {};
  const cleanups = [];
  let stylesReady = null;
  let settingsReady = null;
  let commandsCache = null;

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function listen(target, type, fn, options) {
    target.addEventListener(type, fn, options);
    cleanups.push(() => target.removeEventListener(type, fn, options));
  }

  function debounce(fn, ms) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), ms);
    };
  }

  function tokenize(query) {
    return query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  }

  function faviconFor(url) {
    return `${FAVICON_BASE}?pageUrl=${encodeURIComponent(url)}&size=32`;
  }

  async function send(message) {
    try {
      return await chrome.runtime.sendMessage(state.ctx ? { ...message, ctx: state.ctx } : message);
    } catch (error) {
      if (/context invalidated/i.test(String(error))) {
        destroy();
        if (MODE !== 'overlay') location.reload();
      }
      return null;
    }
  }

  function loadSettings(force = false) {
    if (!settingsReady || force) {
      settingsReady = chrome.storage.sync
        .get(DEFAULT_SETTINGS)
        .then(stored => {
          state.settings = { ...DEFAULT_SETTINGS, ...stored };
          applyTheme();
        })
        .catch(() => {});
    }
    return settingsReady;
  }

  async function saveSetting(key, value) {
    state.settings[key] = value;
    await chrome.storage.sync.set({ [key]: value });
    applyTheme();
    toast('Saved');
  }

  const colorScheme = matchMedia('(prefers-color-scheme: dark)');

  function applyTheme() {
    if (!dom.scope) return;
    const theme = state.settings.theme;
    dom.scope.dataset.theme = theme === 'system' ? (colorScheme.matches ? 'dark' : 'light') : theme;
  }

  async function getCommands(force = false) {
    if (!commandsCache || force) commandsCache = await send({ action: 'getCommands' });
    return commandsCache || [];
  }

  async function checkShortcuts() {
    const commands = await getCommands();
    const missing = [];
    if (!commands.find(c => c.name === 'toggle-palette')?.shortcut) missing.push('Command palette');
    if (!commands.find(c => c.name === 'quick-switch')?.shortcut) missing.push('Quick tab switch');
    state.missingShortcuts = missing;
  }

  // ---------------------------------------------------------------------------
  // Mounting
  // ---------------------------------------------------------------------------

  function ensureStyles() {
    if (MODE !== 'overlay') return Promise.resolve();
    if (!stylesReady) {
      stylesReady = fetch(chrome.runtime.getURL('styles.css'))
        .then(r => r.text())
        .then(css => { dom.style.textContent = css; })
        .catch(() => {});
    }
    return stylesReady;
  }

  function mount() {
    if (dom.scope) return;

    let scope;
    if (MODE === 'overlay') {
      dom.host = document.createElement('arc-palette');
      dom.host.style.cssText = 'all:initial;display:block;position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647';
      const shadow = dom.host.attachShadow({ mode: 'open' });
      dom.style = document.createElement('style');
      scope = document.createElement('div');
      shadow.append(dom.style, scope);
      (document.documentElement || document.body).append(dom.host);
    } else {
      scope = document.body;
    }

    scope.classList.add('arc-scope', 'is-keyboard');
    scope.dataset.mode = MODE;
    scope.innerHTML = TEMPLATE;

    dom.scope = scope;
    dom.root = scope.querySelector('.arc-root');
    dom.backdrop = scope.querySelector('.arc-backdrop');
    dom.panel = scope.querySelector('.arc-panel');
    dom.input = scope.querySelector('.arc-input');
    dom.clear = scope.querySelector('.arc-clear');
    dom.banner = scope.querySelector('.arc-banner');
    dom.results = scope.querySelector('.arc-results');
    dom.footer = scope.querySelector('.arc-footer');
    dom.toast = scope.querySelector('.arc-toast');

    listen(dom.input, 'input', onInput);
    listen(dom.clear, 'click', () => clearQuery());
    listen(dom.backdrop, 'click', () => (state.view === 'switch' ? cancelSwitch() : dismiss()));
    listen(dom.results, 'click', onResultsClick);
    listen(dom.results, 'mouseover', onResultsHover);
    listen(dom.banner, 'click', openShortcuts);
    listen(scope, 'mousemove', onMouseMove);

    // Keep keystrokes inside the palette: pages must not see them as hotkeys.
    listen(scope, 'keydown', event => {
      onKeyDown(event);
      event.stopPropagation();
    });
    listen(scope, 'keyup', event => {
      if (!event.getModifierState(JUMP_MODIFIER)) setNumbered(false);
      event.stopPropagation();
    });
    listen(window, 'blur', () => setNumbered(false));
    listen(scope, 'keypress', event => event.stopPropagation());

    colorScheme.addEventListener('change', applyTheme);
    cleanups.push(() => colorScheme.removeEventListener('change', applyTheme));
    // Settings changed in another tab or the popup apply here too.
    const onStorage = (changes, area) => {
      if (area !== 'sync') return;
      for (const [key, { newValue }] of Object.entries(changes)) {
        if (key in DEFAULT_SETTINGS) state.settings[key] = newValue ?? DEFAULT_SETTINGS[key];
      }
      applyTheme();
    };
    chrome.storage.onChanged.addListener(onStorage);
    cleanups.push(() => { try { chrome.storage.onChanged.removeListener(onStorage); } catch { /* context gone */ } });
    applyTheme();
  }

  // ---------------------------------------------------------------------------
  // Open / close
  // ---------------------------------------------------------------------------

  function focusInput() {
    dom.input.focus({ preventScroll: true });
  }

  async function open() {
    mount();
    await Promise.all([ensureStyles(), loadSettings()]);
    if (state.open && state.view === 'list') {
      focusInput();
      return;
    }
    endSwitch();
    if (MODE === 'overlay') state.restoreFocus = document.activeElement;
    state.open = true;
    state.view = 'list';
    state.returnTo = null;
    state.actionTarget = null;
    dom.input.readOnly = false;
    dom.root.classList.add('is-open');
    setKeyboardMode(true);
    dom.input.value = '';
    state.query = '';
    updateClearButton();
    focusInput();
    checkShortcuts().then(renderBanner);
    showHome();
  }

  function close() {
    if (!state.open) return;
    state.open = false;
    endSwitch();
    setNumbered(false);
    dom.root.classList.remove('is-open');
    dom.input.blur();
    if (MODE === 'overlay' && state.restoreFocus && typeof state.restoreFocus.focus === 'function') {
      try { state.restoreFocus.focus({ preventScroll: true }); } catch { /* ignore */ }
    }
    state.restoreFocus = null;
    state.view = 'list';
    state.query = '';
    state.items = [];
    state.seq++;
    dom.input.value = '';
    dom.results.replaceChildren();
  }

  // What "close the palette" means depends on where it lives.
  function dismiss() {
    if (MODE === 'popup') {
      window.close();
    } else if (MODE === 'page') {
      // Opened from a blank tab: turn back into one. Otherwise just close.
      send({ action: 'closeSelf', replaceWith: PAGE_FROM === 'newtab' ? 'chrome://newtab' : null });
    } else {
      close();
    }
  }

  // Called after a result has been opened or an action has run.
  function finish() {
    if (MODE === 'overlay') {
      close();
    } else if (MODE === 'popup') {
      setTimeout(() => window.close(), state.toastTimer ? 1400 : 0);
    } else {
      clearQuery();
    }
  }

  function toggle(force = false) {
    if (state.open) {
      if (MODE === 'page') dismiss();
      else close();
      return { shown: false, closed: true };
    }
    if (!force && MODE === 'overlay' && !document.hasFocus()) {
      return { shown: false, reason: 'unfocused' };
    }
    if (MODE === 'overlay') window.focus();
    open();
    return { shown: true };
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  function highlightInto(node, text, tokens) {
    node.textContent = '';
    if (!text) return;
    if (!tokens.length) {
      node.textContent = text;
      return;
    }
    const lower = text.toLowerCase();
    const ranges = [];
    for (const token of tokens) {
      let index = lower.indexOf(token);
      while (index !== -1) {
        ranges.push([index, index + token.length]);
        index = lower.indexOf(token, index + 1);
      }
    }
    if (!ranges.length) {
      node.textContent = text;
      return;
    }
    ranges.sort((a, b) => a[0] - b[0]);
    const merged = [];
    for (const range of ranges) {
      const last = merged[merged.length - 1];
      if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
      else merged.push([...range]);
    }
    const fragment = document.createDocumentFragment();
    let position = 0;
    for (const [start, end] of merged) {
      if (start > position) fragment.append(text.slice(position, start));
      fragment.append(el('mark', 'arc-mark', text.slice(start, end)));
      position = end;
    }
    if (position < text.length) fragment.append(text.slice(position));
    node.append(fragment);
  }

  function subtitleFor(item) {
    if (['action', 'workspace', 'scope'].includes(item.type)) return item.description;
    if (!item.host || item.title === item.host) return item.url;
    return item.host;
  }

  function genericIcon() {
    const icon = el('span', 'arc-icon arc-icon-generic');
    icon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"></path></svg>';
    return icon;
  }

  function createRow(item, index, tokens) {
    const row = el('div', 'arc-row');
    row.dataset.index = index;
    row.setAttribute('role', 'option');

    if (index < JUMP_COUNT) {
      row.classList.add('has-num');
      row.append(el('kbd', 'arc-num', `${IS_MAC ? JUMP_GLYPH : ''}${index + 1}`));
    }

    if (['action', 'workspace', 'scope'].includes(item.type)) {
      row.append(el('span', 'arc-icon', item.icon));
    } else if (item.url) {
      const img = el('img', 'arc-favicon');
      img.alt = '';
      img.src = faviconFor(item.url);
      img.addEventListener('error', () => img.replaceWith(genericIcon()), { once: true });
      row.append(img);
    } else {
      row.append(genericIcon());
    }

    const text = el('div', 'arc-text');
    const title = el('div', 'arc-title');
    highlightInto(title, item.title, tokens);
    const subtitle = el('div', 'arc-subtitle');
    highlightInto(subtitle, subtitleFor(item), tokens);
    text.append(title, subtitle);
    row.append(text);

    if (item.type === 'tab') {
      if (item.audible) row.append(el('span', 'arc-flag', '🔊'));
      row.append(el('span', 'arc-badge arc-badge-tab', item.active ? 'Current' : 'Tab'));
    } else if (item.type === 'bookmark') {
      row.append(el('span', 'arc-badge arc-badge-bookmark', '★'));
    } else if (item.type === 'closed') {
      row.append(el('span', 'arc-badge arc-badge-closed', 'Closed'));
    } else if (item.type === 'history') {
      row.append(el('span', 'arc-badge arc-badge-history', 'History'));
    } else if (item.type === 'workspace') {
      row.append(el('span', 'arc-badge arc-badge-action', 'Workspace'));
    } else if (item.type === 'scope') {
      row.append(el('span', 'arc-badge', 'Scope'));
    } else {
      row.append(el('span', 'arc-badge arc-badge-action', 'Action'));
    }
    if (state.view === 'list' && hasResultActions(item)) {
      const more = el('button', 'arc-row-actions', '›');
      more.type = 'button';
      more.tabIndex = -1;
      more.title = 'Actions (→)';
      more.setAttribute('aria-label', `Actions for ${item.title}`);
      row.append(more);
    }
    return row;
  }

  function renderGroups(groups, tokens = []) {
    if (state.view === 'list') state.groups = groups;
    state.items = [];
    const limit = state.view === 'switch' ? Infinity : JUMP_COUNT;
    const fragment = document.createDocumentFragment();
    if (state.view === 'resultActions') {
      fragment.append(settingsHeader(state.actionTarget.title, 'Actions for this result', () => backToResults()));
    }
    for (const group of groups) {
      if (state.items.length >= limit) break;
      if (!group.items?.length) continue;
      if (group.label) fragment.append(el('div', 'arc-group-label', group.label));
      for (const item of group.items.slice(0, limit - state.items.length)) {
        const index = state.items.push(item) - 1;
        fragment.append(createRow(item, index, tokens));
      }
    }
    if (!state.items.length && state.query) {
      fragment.append(el('div', 'arc-empty', isScopedSearch()
        ? 'No matches in this scope. Try another search or press Esc to clear.'
        : 'No matches. Press Enter to open as a URL or search the web.'));
    }
    dom.results.replaceChildren(fragment);
    dom.results.hidden = !dom.results.childElementCount;
    select(0);
  }

  function select(index, { scroll = true } = {}) {
    const count = state.items.length;
    state.selected = count ? Math.max(0, Math.min(index, count - 1)) : 0;
    const previous = dom.results.querySelector('.arc-row.is-selected');
    const next = dom.results.querySelector(`.arc-row[data-index="${state.selected}"]`);
    if (previous && previous !== next) {
      previous.classList.remove('is-selected');
      previous.removeAttribute('aria-selected');
    }
    if (next) {
      next.classList.add('is-selected');
      next.setAttribute('aria-selected', 'true');
      if (scroll) next.scrollIntoView({ block: 'nearest' });
    }
    renderFooter();
  }

  function move(delta, { wrap = false } = {}) {
    const count = state.items.length;
    if (!count) return;
    let index = state.selected + delta;
    if (wrap) index = (index + count) % count;
    setKeyboardMode(true);
    select(index);
  }

  function renderBanner() {
    if (!dom.banner) return;
    const show = state.view === 'list' && state.missingShortcuts.length > 0;
    dom.banner.hidden = !show;
    if (!show) return;
    dom.banner.replaceChildren(
      el('span', 'arc-banner-icon', '⚠️'),
      (() => {
        const text = el('div', 'arc-banner-text');
        text.append(
          el('div', 'arc-banner-title', 'Keyboard shortcuts are not set'),
          el('div', 'arc-banner-desc', `${state.missingShortcuts.join(' and ')} — click to configure`)
        );
        return text;
      })()
    );
  }

  function hint(key, label) {
    const span = el('span', 'arc-hint');
    span.append(el('kbd', null, key), ` ${label}`);
    return span;
  }

  function renderFooter() {
    const parts = [];
    if (state.view === 'switch') {
      const label = state.switchShortcut?.label || 'Ctrl+Q';
      const modifier = state.switchShortcut?.modifiers?.[0] === 'Alt' ? (IS_MAC ? 'option' : 'alt')
        : state.switchShortcut?.modifiers?.[0] === 'Meta' ? '⌘' : 'ctrl';
      parts.push(hint(label, 'next'), hint('⇧ ' + label, 'previous'), hint(modifier, 'release to switch'));
    } else if (state.view === 'settings') {
      parts.push(hint('esc', 'back'));
    } else if (state.view === 'resetUrl') {
      parts.push(hint('↵', 'save'), hint('esc', 'cancel'));
    } else if (state.view === 'workspaceForm') {
      parts.push(hint('↵', 'confirm'), hint('esc', 'cancel'));
    } else if (state.view === 'resultActions') {
      parts.push(hint('↑↓', 'navigate'), hint('↵', 'run'), hint('← / esc', 'back'));
    } else {
      const item = state.items[state.selected];
      if (state.numbered && state.items.length) parts.push(hint(`${JUMP_GLYPH}1-${Math.min(JUMP_COUNT, state.items.length)}`, 'jump'));
      else if (state.items.length > 1) parts.push(hint('↑↓', 'navigate'));
      if (item) {
        parts.push(hint('↵', item.type === 'tab' ? 'switch' : item.type === 'action' ? 'run' : item.type === 'closed' ? 'reopen' : 'open'));
        if (opensUrl(item) && MODE === 'overlay') parts.push(hint('⇧↵', 'open here'));
        if (opensUrl(item) && replacesSource()) parts.push(hint('⇧↵', 'new tab'));
        if (item.type === 'action' && item.hasSettings) parts.push(hint('⇥', 'settings'));
        if (hasResultActions(item)) parts.push(hint('→', 'actions'));
      } else if (state.query && !isScopedSearch()) {
        parts.push(hint('↵', 'open or search'));
      } else if (!state.query && state.missingShortcuts.length) {
        parts.push(hint('↵', 'set up shortcuts'));
      }
      parts.push(hint('esc', state.query ? 'clear' : MODE === 'page' ? 'back' : 'close'));
      if (!state.query) {
        const scopes = el('button', 'arc-footer-button');
        scopes.append(hint('@', 'scopes'));
        scopes.type = 'button';
        scopes.addEventListener('click', () => setQuery('@'));
        const workspaces = el('button', 'arc-footer-button');
        workspaces.append(hint(WORKSPACE_SHORTCUT, 'workspaces'));
        workspaces.type = 'button';
        workspaces.setAttribute('aria-keyshortcuts', 'Alt+W');
        workspaces.title = `Open workspaces (${WORKSPACE_SHORTCUT})`;
        workspaces.addEventListener('click', () => setQuery('@workspaces '));
        parts.push(scopes, workspaces);
      }
    }
    dom.footer.replaceChildren(...parts);
  }

  function updateClearButton() {
    dom.clear.classList.toggle('is-visible', dom.input.value.length > 0);
  }

  function setKeyboardMode(enabled) {
    if (state.keyboardMode === enabled) return;
    state.keyboardMode = enabled;
    dom.scope.classList.toggle('is-keyboard', enabled);
  }

  function setNumbered(enabled) {
    if (state.numbered === enabled || !dom.scope) return;
    state.numbered = enabled;
    dom.scope.classList.toggle('is-numbered', enabled);
    if (state.view === 'list') renderFooter();
  }

  function toast(message) {
    dom.toast.textContent = message;
    dom.toast.classList.add('is-visible');
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => {
      dom.toast.classList.remove('is-visible');
      state.toastTimer = null;
    }, 2200);
  }

  // ---------------------------------------------------------------------------
  // Views: home / search
  // ---------------------------------------------------------------------------

  async function showHome() {
    state.view = 'list';
    const seq = ++state.seq;
    const response = await send({ action: 'home' });
    if (seq !== state.seq || !state.open || state.query) return;
    renderGroups(response?.groups || []);
  }

  async function runSearch() {
    if (!state.open || state.view !== 'list') return;
    const query = dom.input.value.trim();
    state.query = query;
    if (!query) {
      showHome();
      return;
    }
    const seq = ++state.seq;
    const response = await send({ action: 'search', query });
    if (seq !== state.seq || !state.open || state.view !== 'list') return;
    renderGroups(response?.groups || [], tokenize(parseQuery(query).query));
  }

  const scheduleSearch = debounce(runSearch, 40);

  function onInput() {
    updateClearButton();
    if (state.view !== 'list') return;
    state.query = dom.input.value.trim();
    state.seq++; // invalidate an in-flight search before the debounce fires
    scheduleSearch();
  }

  function clearQuery() {
    state.seq++;
    state.returnTo = null;
    state.actionTarget = null;
    dom.input.readOnly = false;
    dom.input.value = '';
    state.query = '';
    updateClearButton();
    state.view = 'list';
    renderBanner();
    focusInput();
    showHome();
  }

  function openShortcuts() {
    send({ action: 'openShortcuts' });
    finish();
  }

  function isScopedSearch() {
    return !!parseQuery(state.query).scope || /^@\w*$/.test(state.query);
  }

  function setQuery(query) {
    state.returnTo = null;
    state.actionTarget = null;
    state.view = 'list';
    dom.input.readOnly = false;
    dom.input.value = query;
    state.query = query.trim();
    updateClearButton();
    renderBanner();
    focusInput();
    runSearch();
  }

  function hasResultActions(item) {
    return ['tab', 'bookmark', 'history', 'closed', 'workspace'].includes(item?.type);
  }

  function rememberResults() {
    if (!state.returnTo) state.returnTo = {
      query: dom.input.value, groups: state.groups || [], selected: state.selected
    };
    dom.input.readOnly = true;
    dom.clear.classList.remove('is-visible');
  }

  async function backToResults(refresh = false) {
    if (state.busy) return;
    const previous = state.returnTo;
    state.returnTo = null;
    state.actionTarget = null;
    state.view = 'list';
    state.seq++;
    dom.input.readOnly = false;
    dom.input.value = previous?.query ?? dom.input.value;
    state.query = dom.input.value.trim();
    updateClearButton();
    renderBanner();
    focusInput();
    renderGroups(previous?.groups || [], tokenize(parseQuery(state.query).query));
    select(previous?.selected || 0);
    if (refresh === true) {
      await runSearch();
      if (state.view === 'list') select(previous?.selected || 0);
    }
  }

  async function showResultActions(item) {
    if (state.busy || !hasResultActions(item)) return;
    rememberResults();
    state.actionTarget = item;
    state.view = 'resultActions';
    const seq = ++state.seq;
    renderBanner();
    state.items = [];
    dom.results.replaceChildren(settingsHeader(item.title, 'Loading actions…', () => backToResults()));
    dom.results.hidden = false;
    renderFooter();
    focusInput();
    const response = await send({ action: 'resultActions', result: item });
    if (seq !== state.seq || !state.open) return;
    if (!response?.success) {
      backToResults();
      toast(response?.error || 'Could not load actions. Try again.');
      return;
    }
    renderGroups([{ items: response.actions }]);
  }

  async function copyUrl(url) {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Content scripts on HTTP pages may not have the Clipboard API.
      const input = el('textarea', 'arc-copy-input');
      input.value = url;
      dom.scope.append(input);
      input.select();
      const copied = document.execCommand('copy');
      input.remove();
      focusInput();
      if (!copied) throw new Error('Could not copy this URL.');
    }
  }

  async function restoreWorkspace(item) {
    state.busy = true;
    const seq = state.seq;
    const response = await send({ action: 'openWorkspace', id: item.id });
    state.busy = false;
    if (seq !== state.seq || !state.open) return;
    if (response?.success) finish();
    else toast(response?.error || 'Could not open workspace. Try again.');
  }

  async function runResultAction(item) {
    const target = state.actionTarget;
    if (!target) return;
    if (item.id === 'workspace-open') return restoreWorkspace(target);
    if (item.id.startsWith('workspace-')) return showWorkspaceForm(item.id.slice(10), target);
    state.busy = true;
    const seq = state.seq;
    try {
      if (item.id === 'copy-url') {
        await copyUrl(item.description || target.url);
      } else {
        const response = await send({ action: 'executeResultAction', result: target, actionId: item.id });
        if (!response?.success) throw new Error(response?.error || 'Could not run this action. Try again.');
      }
      state.busy = false;
      if (seq !== state.seq || !state.open) return;
      if (['copy-url', 'pin', 'unpin', 'mute', 'unmute', 'close-tab'].includes(item.id)) {
        await backToResults(true);
        toast(item.id === 'copy-url' ? 'URL copied' : 'Done');
      } else finish();
    } catch (error) {
      if (seq === state.seq && state.open) toast(error.message);
    } finally {
      state.busy = false;
    }
  }

  function showWorkspaceForm(operation, workspace = null) {
    rememberResults();
    state.view = 'workspaceForm';
    const seq = ++state.seq;
    state.items = [];
    renderBanner();
    const names = { save: 'Save workspace', rename: 'Rename workspace', replace: 'Replace workspace tabs', delete: 'Delete workspace' };
    const descriptions = {
      save: 'Save this window’s tabs, their order and pins. Blank tabs are skipped.',
      rename: `Choose a new name for “${workspace?.title}”.`,
      replace: `Replace “${workspace?.title}” with this window’s tabs.`,
      delete: `Delete “${workspace?.title}”? Its open tabs will stay open.`
    };
    const form = el('form', 'arc-settings arc-workspace-form');
    form.append(settingsHeader(names[operation], descriptions[operation], () => backToResults()));
    let input;
    if (operation === 'save' || operation === 'rename') {
      const label = el('label', 'arc-settings-row');
      label.append(el('span', 'arc-settings-label', 'Name'));
      input = el('input', 'arc-text-input');
      input.name = 'workspaceName';
      input.placeholder = 'e.g. Morning or Project';
      input.value = workspace?.title || '';
      input.maxLength = 80;
      input.required = true;
      input.autocomplete = 'off';
      label.append(input);
      form.append(label);
    }
    const error = el('div', 'arc-form-error');
    error.setAttribute('role', 'alert');
    form.append(error);
    const buttons = el('div', 'arc-form-buttons');
    const submit = el('button', 'arc-button', names[operation]);
    if (operation === 'delete') submit.classList.add('arc-button-danger');
    submit.type = 'submit';
    const cancel = el('button', 'arc-button arc-button-secondary', 'Cancel');
    cancel.type = 'button';
    cancel.addEventListener('click', () => backToResults());
    buttons.append(submit, cancel);
    form.append(buttons);
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (state.busy) return;
      state.busy = true;
      submit.disabled = true;
      cancel.disabled = true;
      error.textContent = '';
      const response = await send({ action: 'editWorkspace', operation, id: workspace?.id, name: input?.value });
      state.busy = false;
      if (seq !== state.seq || !state.open) return;
      if (!response?.success) {
        error.textContent = response?.error || 'Could not save this change. Try again.';
        submit.disabled = false;
        cancel.disabled = false;
        return;
      }
      setQuery('@workspaces ');
      toast(operation === 'delete' ? 'Workspace deleted' : 'Workspace saved');
    });
    dom.results.replaceChildren(form);
    dom.results.hidden = false;
    renderFooter();
    (input || submit).focus();
    input?.select();
  }

  // Bookmarks and history entries load a URL; tabs and closed tabs are switched to.
  function opensUrl(item) {
    return item.type === 'bookmark' || item.type === 'history';
  }

  // Does picking a tab result close the tab the palette was opened from?
  function replacesSource() {
    return MODE === 'page' || (MODE === 'popup' && state.blankSource);
  }

  function dispositionFor(alternate) {
    if (MODE === 'overlay') return alternate ? 'currentTab' : 'newTab';
    if (replacesSource()) return alternate ? 'newTab' : 'currentTab';
    return 'newTab';
  }

  async function activate(index, { alternate = false } = {}) {
    if (state.busy) return;
    const item = state.items[index];
    if (!item) {
      if (state.view !== 'list') return;
      if (state.query && !isScopedSearch()) {
        send({ action: 'navigate', query: state.query, disposition: dispositionFor(alternate) });
        finish();
      } else if (!state.query && state.missingShortcuts.length) {
        openShortcuts();
      }
      return;
    }
    if (item.type === 'scope') return setQuery(`@${item.id} `);
    if (item.type === 'workspace') return restoreWorkspace(item);
    if (item.resultAction) return runResultAction(item);
    if (item.type === 'action') {
      await runAction(item);
      return;
    }
    send({
      action: 'open',
      result: item,
      disposition: dispositionFor(alternate),
      closeSource: replacesSource() && (item.type === 'tab' || item.type === 'closed')
    });
    finish();
  }

  async function runAction(item) {
    if (item.id === 'save-workspace') return showWorkspaceForm('save');
    if (item.id === 'browse-workspaces') return setQuery('@workspaces ');
    if (item.id === 'settings') {
      showSettings();
      return;
    }
    if (item.id === 'reload-extension') {
      if (MODE === 'page') await chrome.storage.local.set({ arcReloadToast: true }).catch(() => {});
      send({ action: 'reload' });
      finish();
      return;
    }
    const response = await send({ action: 'executeAction', actionId: item.id });
    if (response?.success) {
      if (item.id === 'cleanup') {
        toast(`✨ Closed ${response.closed} tab${response.closed === 1 ? '' : 's'}, kept ${response.kept}`);
      } else if (item.id === 'reset') {
        toast(`💫 ${response.message}`);
      }
    }
    finish();
  }

  function onResultsClick(event) {
    const row = event.target.closest('.arc-row');
    if (!row) return;
    if (event.target.closest('.arc-row-actions')) {
      select(Number(row.dataset.index), { scroll: false });
      showResultActions(state.items[state.selected]);
      return;
    }
    activate(Number(row.dataset.index), { alternate: event.shiftKey });
  }

  function onResultsHover(event) {
    if (state.keyboardMode) return;
    const row = event.target.closest('.arc-row');
    if (row) select(Number(row.dataset.index), { scroll: false });
  }

  function onMouseMove(event) {
    if (state.keyboardMode && (event.movementX || event.movementY)) setKeyboardMode(false);
  }

  // ---------------------------------------------------------------------------
  // Keyboard
  // ---------------------------------------------------------------------------

  function onKeyDown(event) {
    if (event.isComposing) return;

    if (state.view === 'switch') return; // handled by the window-level switch listeners

    if (state.view === 'workspaceForm') {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (!state.busy) backToResults();
      }
      return;
    }
    if (state.view === 'resultActions' && ['Escape', 'ArrowLeft'].includes(event.key)) {
      event.preventDefault();
      backToResults();
      return;
    }

    if (state.view === 'settings' || state.view === 'resetUrl') {
      if (event.key === 'Escape') {
        event.preventDefault();
        exitSettings();
      }
      return;
    }

    // Option+W produces a different character on Mac, so use the physical key.
    if (event.code === 'KeyW' && event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
      event.preventDefault();
      if (!state.busy) setQuery('@workspaces ');
      return;
    }

    // Hold ⌘ (Ctrl elsewhere) to number the rows, tap a digit to jump straight there.
    const jumpHeld = event.getModifierState(JUMP_MODIFIER);
    if (event.key === JUMP_MODIFIER) {
      setNumbered(true);
    } else if (!jumpHeld) {
      setNumbered(false);
    } else if (/^[1-9]$/.test(event.key) && !event.altKey && !event.shiftKey) {
      event.preventDefault();
      const index = Number(event.key) - 1;
      if (index < state.items.length) activate(index);
      return;
    }

    const item = state.items[state.selected];
    switch (event.key) {
      case 'ArrowRight':
        if (hasResultActions(item) && !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey &&
            (event.target !== dom.input || (dom.input.selectionStart === dom.input.value.length && dom.input.selectionEnd === dom.input.value.length))) {
          event.preventDefault();
          showResultActions(item);
        }
        break;
      case 'Escape':
        event.preventDefault();
        if (dom.input.value) clearQuery();
        else dismiss();
        break;
      case 'ArrowDown':
        event.preventDefault();
        move(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        move(-1);
        break;
      case 'n':
      case 'p':
        if (event.ctrlKey && !event.metaKey && !event.altKey) {
          event.preventDefault();
          move(event.key === 'n' ? 1 : -1);
        }
        break;
      case 'Home':
      case 'End':
        if (event.target === dom.input && dom.input.value) return; // let the caret move
        event.preventDefault();
        select(event.key === 'Home' ? 0 : state.items.length - 1);
        break;
      case 'Enter':
        event.preventDefault();
        activate(state.selected, { alternate: event.shiftKey });
        break;
      case 'Tab':
        event.preventDefault();
        if (!event.shiftKey && item?.type === 'action' && item.hasSettings) openActionSettings(item.id);
        else move(event.shiftKey ? -1 : 1, { wrap: true });
        break;
      default:
        break;
    }
  }

  // ---------------------------------------------------------------------------
  // Quick switch (hold the shortcut modifier, tap to cycle, release to switch)
  // ---------------------------------------------------------------------------

  function isHeld(event) {
    const modifiers = state.switchShortcut?.modifiers || ['Control'];
    return modifiers.every(name => event.getModifierState(name));
  }

  function startQuickSwitch(tabs, shortcut) {
    if (state.open && state.view === 'switch') {
      move(1, { wrap: true });
      return { shown: true };
    }
    // Keyboard focus is in the omnibox or DevTools: we would never see the modifier
    // being released, so let the background switch straight away instead.
    if (MODE === 'overlay' && !document.hasFocus()) return { shown: false, reason: 'unfocused' };

    mount();
    state.switchTabs = tabs;
    state.switchShortcut = shortcut || null;
    attachSwitchListeners();
    openSwitchView(tabs);
    return { shown: true };
  }

  async function openSwitchView(tabs) {
    await Promise.all([ensureStyles(), loadSettings()]);
    if (!state.switchActive) return; // modifier already released, switch has happened
    if (MODE === 'overlay' && !state.open) state.restoreFocus = document.activeElement;
    state.open = true;
    state.view = 'list';
    state.seq++;
    state.view = 'switch';
    dom.root.classList.add('is-open');
    dom.panel.classList.add('is-switch');
    dom.banner.hidden = true;
    setKeyboardMode(true);
    renderGroups([{ items: tabs }]);
    select(tabs.length > 1 ? 1 : 0);
    // Pull keyboard focus out of any iframe or input so the key-up reaches us.
    dom.results.focus({ preventScroll: true });
  }

  function attachSwitchListeners() {
    if (state.switchActive) return;
    state.switchActive = true;
    window.addEventListener('keydown', onSwitchKeyDown, true);
    window.addEventListener('keyup', onSwitchKeyUp, true);
    window.addEventListener('blur', onSwitchBlur, true);
  }

  function endSwitch() {
    if (!state.switchActive) return;
    state.switchActive = false;
    state.switchTabs = null;
    window.removeEventListener('keydown', onSwitchKeyDown, true);
    window.removeEventListener('keyup', onSwitchKeyUp, true);
    window.removeEventListener('blur', onSwitchBlur, true);
    dom.panel?.classList.remove('is-switch');
    if (state.view === 'switch') state.view = 'list';
  }

  function onSwitchKeyDown(event) {
    event.preventDefault();
    event.stopPropagation();
    if (!isHeld(event) && !MODIFIER_KEYS.has(event.key)) {
      commitSwitch();
      return;
    }
    const key = event.key;
    const switchKey = state.switchShortcut?.key || 'q';
    if (key === 'Escape') cancelSwitch();
    else if (key === 'Enter') commitSwitch();
    else if (key === 'ArrowDown' || (key === 'Tab' && !event.shiftKey)) move(1, { wrap: true });
    else if (key === 'ArrowUp' || (key === 'Tab' && event.shiftKey)) move(-1, { wrap: true });
    else if (key.toLowerCase() === switchKey && event.shiftKey) move(-1, { wrap: true });
    // The plain shortcut key never reaches us: Chrome turns it into another
    // quick-switch command, which cycles forward via startQuickSwitch().
  }

  function onSwitchKeyUp(event) {
    event.preventDefault();
    event.stopPropagation();
    if (!isHeld(event)) commitSwitch();
  }

  function onSwitchBlur(event) {
    if (event.target === window) cancelSwitch();
  }

  function commitSwitch() {
    if (!state.switchActive) return;
    const rendered = state.view === 'switch' ? state.items[state.selected] : null;
    const target = rendered || state.switchTabs?.[1] || null;
    endSwitch();
    close();
    if (target && !target.active) {
      send({ action: 'open', result: target, closeSource: replacesSource() });
    }
  }

  function cancelSwitch() {
    endSwitch();
    close();
  }

  // ---------------------------------------------------------------------------
  // Settings
  // ---------------------------------------------------------------------------

  function settingsHeader(title, description, onBack = exitSettings) {
    const header = el('div', 'arc-settings-header');
    const back = el('button', 'arc-settings-back', '←');
    back.type = 'button';
    back.setAttribute('aria-label', 'Back');
    back.addEventListener('click', onBack);
    const wrap = el('div', 'arc-settings-title-wrap');
    wrap.append(el('div', 'arc-settings-title', title), el('div', 'arc-settings-desc', description));
    header.append(back, wrap);
    return header;
  }

  function selectRow(label, options, value, onChange) {
    const row = el('label', 'arc-settings-row');
    row.append(el('span', 'arc-settings-label', label));
    const select = el('select', 'arc-select');
    for (const [id, name] of options) {
      const option = el('option', null, name);
      option.value = id;
      option.selected = id === value;
      select.append(option);
    }
    select.addEventListener('change', () => onChange(select.value));
    row.append(select);
    return row;
  }

  function inputRow(label, value, placeholder, onSave) {
    const row = el('label', 'arc-settings-row');
    row.append(el('span', 'arc-settings-label', label));
    const input = el('input', 'arc-text-input');
    input.type = 'text';
    input.value = value || '';
    input.placeholder = placeholder;
    input.spellcheck = false;
    input.addEventListener('change', () => onSave(input.value.trim()));
    row.append(input);
    return row;
  }

  function shortcutRow(label, shortcut) {
    const row = el('div', 'arc-settings-row is-inline');
    row.append(el('span', 'arc-settings-label', label));
    row.append(el('kbd', `arc-shortcut${shortcut ? '' : ' is-missing'}`, shortcut || 'Not set'));
    return row;
  }

  async function showSettings() {
    state.view = 'settings';
    state.seq++;
    dom.banner.hidden = true;
    const [commands] = await Promise.all([getCommands(true), loadSettings(true)]);
    if (state.view !== 'settings') return;
    const shortcut = name => commands.find(c => c.name === name)?.shortcut || '';

    const panel = el('div', 'arc-settings');
    panel.append(settingsHeader('Settings', 'Arc preferences sync with your Chrome profile'));

    panel.append(el('div', 'arc-settings-section', 'Keyboard shortcuts'));
    panel.append(shortcutRow('Command palette', shortcut('toggle-palette')));
    panel.append(shortcutRow('Quick tab switch', shortcut('quick-switch')));
    const configure = el('button', 'arc-button', 'Configure shortcuts in Chrome');
    configure.type = 'button';
    configure.addEventListener('click', openShortcuts);
    panel.append(configure);

    panel.append(el('div', 'arc-settings-section', 'Search'));
    panel.append(selectRow('Search engine for queries with no match', SEARCH_ENGINES, state.settings.searchEngine, v => saveSetting('searchEngine', v)));

    panel.append(el('div', 'arc-settings-section', 'Appearance'));
    panel.append(selectRow('Theme', THEMES, state.settings.theme, v => saveSetting('theme', v)));

    panel.append(el('div', 'arc-settings-section', 'Reset action'));
    panel.append(inputRow('Page to open after closing all tabs', state.settings.resetUrl, 'chrome://newtab', v => saveSetting('resetUrl', v)));

    dom.results.replaceChildren(panel);
    dom.results.hidden = false;
    state.items = [];
    panel.querySelector('select')?.focus();
    renderFooter();
  }

  async function openActionSettings(actionId) {
    if (actionId === 'settings') {
      showSettings();
      return;
    }
    if (actionId !== 'reset') return;
    state.view = 'resetUrl';
    state.seq++;
    dom.banner.hidden = true;
    await loadSettings(true);
    if (state.view !== 'resetUrl') return;

    const panel = el('div', 'arc-settings');
    panel.append(settingsHeader('Reset URL', 'The page to open when you run the Reset action'));
    const row = inputRow('URL', state.settings.resetUrl, 'chrome://newtab', async value => {
      await saveSetting('resetUrl', value);
      exitSettings();
    });
    const input = row.querySelector('input');
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        input.dispatchEvent(new Event('change'));
      }
    });
    panel.append(row);
    dom.results.replaceChildren(panel);
    dom.results.hidden = false;
    state.items = [];
    input.focus();
    input.select();
    renderFooter();
  }

  function exitSettings() {
    state.view = 'list';
    clearQuery();
  }

  // ---------------------------------------------------------------------------
  // Messages from the background
  // ---------------------------------------------------------------------------

  function onMessage(message, _sender, sendResponse) {
    switch (message?.action) {
      case 'ping':
        sendResponse({ ok: true });
        break;
      case 'toggle':
        sendResponse(toggle(!!message.force));
        break;
      case 'quick-switch':
        sendResponse(startQuickSwitch(message.tabs || [], message.shortcut));
        break;
      default:
        break;
    }
  }

  chrome.runtime.onMessage.addListener(onMessage);

  function destroy() {
    endSwitch();
    for (const cleanup of cleanups.splice(0)) cleanup();
    try { chrome.runtime.onMessage.removeListener(onMessage); } catch { /* context gone */ }
    dom.host?.remove();
    if (globalThis.__arc?.destroy === destroy) delete globalThis.__arc;
  }

  globalThis.__arc = { destroy };

  // ---------------------------------------------------------------------------
  // Page and popup start-up
  // ---------------------------------------------------------------------------

  if (MODE !== 'overlay') {
    const start = async () => {
      if (MODE === 'popup') {
        const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true }).catch(() => []);
        if (tab) {
          state.ctx = { tabId: tab.id, windowId: tab.windowId };
          state.blankSource = isBlankTabUrl(tab.url || tab.pendingUrl);
        }
      }
      await open();
      if (MODE === 'page') {
        const { arcReloadToast } = await chrome.storage.local.get('arcReloadToast').catch(() => ({}));
        if (arcReloadToast) {
          chrome.storage.local.remove('arcReloadToast');
          toast('✓ Reloaded');
        }
        // Reload the page when the extension itself is reloaded (dev workflow).
        setInterval(() => {
          if (document.visibilityState === 'visible' && !chrome.runtime?.id) location.reload();
        }, 2000);
      }
      window.addEventListener('focus', focusInput);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
  }
})();
