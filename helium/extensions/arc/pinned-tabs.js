// Shared pinned tabs. No host permissions, page injection, or remote code.
(function (root) {
  'use strict';
  const KEY = 'arc:pinnedTabs';
  const INSTANCES = 'arc:pinnedInstances';
  const RESTORE = 'arc:pinnedRestore';
  const urlOf = tab => tab.pendingUrl || tab.url || '';
  const validUrl = url => typeof url === 'string' && /^(https?|file|ftp|chrome|edge):/i.test(url);
  const unique = urls => [...new Set(urls.filter(validUrl))];

  function start(chrome) {
    let urls = [];
    let instances = {};
    let restore = {};
    let queue = Promise.resolve();
    let scheduled = false;
    let retries = 0;
    const pinEchoes = new Map();
    const moveEchoes = new Map();
    const pendingDiscard = new Set();
    const report = error => {
      if (!/browser is shutting down/i.test(String(error))) console.warn('Arc shared pins:', error);
    };
    function enqueue(fn) {
      const result = queue.then(fn);
      queue = result.catch(report);
      return result;
    }
    const windows = async () => (await chrome.windows.getAll({ populate: true, windowTypes: ['normal'] }))
      .filter(w => w.type === 'normal' && !w.incognito);
    async function persist() {
      await chrome.storage.local.set({ [KEY]: urls, [RESTORE]: restore });
      await chrome.storage.session.set({ [INSTANCES]: instances });
    }
    async function setPin(id, pinned) {
      pinEchoes.set(id, pinned);
      try { return await chrome.tabs.update(id, { pinned }); }
      catch (error) { pinEchoes.delete(id); throw error; }
    }
    function schedule() {
      if (scheduled) return;
      scheduled = true;
      enqueue(async () => {
        scheduled = false;
        try { await reconcile(); retries = 0; }
        catch (error) {
          // Dragging or a closing window can temporarily reject tab mutations.
          // Bound retries, so a permanent API failure cannot become an event loop.
          if (retries++ < 3) setTimeout(schedule, 150 * retries);
          throw error;
        }
      }).catch(() => {});
    }
    async function reconcile() {
      const all = await windows();
      const alive = new Set();
      // Adopt session-restore pins before filling gaps. Known instances retain
      // their pin-time identity even after navigating to a different URL.
      for (const w of all) {
        for (const tab of w.tabs || []) {
          alive.add(String(tab.id));
          if (!tab.pinned) continue;
          const known = instances[tab.id];
          if (known && known.windowId !== w.id) known.windowId = w.id;
          if (known) continue;
          const url = urlOf(tab);
          if (!validUrl(url)) continue;
          instances[tab.id] = { url, windowId: w.id };
          if (!urls.includes(url)) urls.push(url);
        }
      }
      // Save identities before producing API events or worker suspension.
      await persist();
      for (const w of all) {
        const chosen = new Map();
        const pinned = (w.tabs || []).filter(t => t.pinned).sort((a, b) => a.index - b.index);
        for (const tab of pinned) {
          const identity = instances[tab.id];
          if (!identity) continue;
          const url = identity.url;
          if (!urls.includes(url) || chosen.has(url)) {
            // Never throw away a user's page, even an exact duplicate. Unpin
            // surplus instances; unpinning in any window also preserves pages.
            await setPin(tab.id, false);
            delete instances[tab.id];
          } else chosen.set(url, tab.id);
        }
        for (const [index, url] of urls.entries()) {
          let id = chosen.get(url);
          if (id == null) {
            const created = await chrome.tabs.create({ windowId: w.id, url, pinned: true, active: false, index });
            id = created.id;
            instances[id] = { url, windowId: w.id };
            alive.add(String(id));
            // Discard only after the navigation commits. Helium loses the
            // pending URL if a newly-created tab is discarded too early.
            pendingDiscard.add(id);
          }
          const tab = await chrome.tabs.get(id);
          if (pendingDiscard.has(id) && tab.url && !tab.pendingUrl) {
            pendingDiscard.delete(id);
            if (!tab.active) {
              const discarded = await chrome.tabs.discard(id).catch(report);
              if (discarded && discarded.id !== id) {
                instances[discarded.id] = instances[id];
                delete instances[id];
                id = discarded.id;
                alive.add(String(id));
              }
            }
          }
          if (!tab.pinned) continue; // A user unpinned while reconciliation ran.
          if (tab.index !== index) {
            moveEchoes.set(id, index);
            try { await chrome.tabs.move(id, { index }); }
            catch (error) { moveEchoes.delete(id); throw error; }
          }
        }
      }
      for (const id of Object.keys(instances)) {
        if (!alive.has(id)) delete instances[id];
      }
      restore = {};
      for (const w of await windows()) for (const tab of w.tabs || []) {
        const canonical = instances[tab.id]?.url;
        const current = urlOf(tab);
        if (tab.pinned && canonical && urls.includes(canonical) && current && current !== canonical) restore[current] = canonical;
      }
      await persist();
    }

    // Register synchronously, before any storage reads, for MV3 wake events.
    chrome.tabs.onUpdated.addListener((id, change, tab) => {
      if (pendingDiscard.has(id) && (change.url || change.status === 'complete')) schedule();
      if (typeof change.pinned === 'boolean') {
        if (pinEchoes.get(id) === change.pinned) { pinEchoes.delete(id); return; }
        const snapshot = { ...tab };
        enqueue(async () => {
          if (!(await windows()).some(w => w.id === snapshot.windowId)) return;
          if (change.pinned) {
            const url = urlOf(snapshot);
            if (validUrl(url)) {
              instances[id] = { url, windowId: snapshot.windowId };
              if (!urls.includes(url)) urls.push(url);
            }
          } else {
            const url = instances[id]?.url;
            if (url) urls = urls.filter(u => u !== url);
            // Keep peer identities until reconcile unpins them, rather than
            // adopting their still-pinned tabs back into the canonical list.
            delete instances[id];
          }
          await persist();
          schedule();
        }).catch(() => {});
      } else if ((change.url || change.status) && tab.pinned) {
        // Snapshot navigation identity for browser-session restore (tab IDs and
        // storage.session are lost across a full browser restart).
        schedule();
      }
    });
    chrome.tabs.onMoved.addListener((id, info) => {
      if (moveEchoes.get(id) === info.toIndex) { moveEchoes.delete(id); return; }
      enqueue(async () => {
        if (!(await windows()).some(w => w.id === info.windowId)) return;
        const tab = await chrome.tabs.get(id).catch(() => null);
        if (!tab?.pinned || !instances[id]) return;
        const order = (await chrome.tabs.query({ windowId: info.windowId, pinned: true }))
          .sort((a, b) => a.index - b.index).map(t => instances[t.id]?.url)
          .filter(u => urls.includes(u));
        urls = unique([...order, ...urls]);
        await persist();
        schedule();
      }).catch(() => {});
    });
    chrome.tabs.onCreated.addListener(schedule);
    chrome.tabs.onRemoved.addListener((id, info) => {
      enqueue(async () => {
        delete instances[id];
        await chrome.storage.session.set({ [INSTANCES]: instances });
        if (!info.isWindowClosing) schedule();
      }).catch(() => {});
    });
    chrome.tabs.onAttached.addListener((id, info) => {
      enqueue(async () => {
        if (instances[id]) instances[id].windowId = info.newWindowId;
        schedule();
      }).catch(() => {});
    });
    chrome.tabs.onDetached.addListener(schedule);
    chrome.tabs.onReplaced.addListener((added, removed) => {
      enqueue(async () => {
        if (instances[removed]) instances[added] = instances[removed];
        delete instances[removed];
        schedule();
      }).catch(() => {});
    });
    chrome.windows.onCreated.addListener(schedule);
    // Initialize first in the queue. All registered events wait behind it.
    // Synchronous listener registration above does not yield to the event loop.
    enqueue(async () => {
      const local = await chrome.storage.local.get([KEY, RESTORE]);
      const session = await chrome.storage.session.get(INSTANCES);
      urls = unique(Array.isArray(local[KEY]) ? local[KEY] : []);
      instances = session[INSTANCES] || {};
      restore = local[RESTORE] || {};
      const all = await windows();
      all.sort((a, b) => Number(!!b.focused) - Number(!!a.focused));
      // On first install the focused window establishes ordering, then union
      // pins in the remaining windows. Subsequent wakes retain canonical order.
      for (const w of all) for (const tab of (w.tabs || []).sort((a, b) => a.index - b.index)) {
        if (!tab.pinned || instances[tab.id]) continue;
        const url = urlOf(tab);
        if (!validUrl(url)) continue;
        const canonical = urls.includes(url) ? url : (urls.includes(restore[url]) ? restore[url] : url);
        instances[tab.id] = { url: canonical, windowId: w.id };
        if (!urls.includes(canonical)) urls.push(canonical);
      }
      await reconcile();
    }).catch(() => {});
    return { withPausedSync: fn => enqueue(fn), idle: async () => { let current; do { current = queue; await current; } while (queue !== current); } };
  }
  root.ArcPinnedTabs = { start };
  if (typeof module !== 'undefined') module.exports = { start };
})(typeof self !== 'undefined' ? self : globalThis);
