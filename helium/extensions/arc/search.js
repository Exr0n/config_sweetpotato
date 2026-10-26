// Arc - search and ranking helpers.
// Loaded by the service worker with importScripts() and by the unit tests with require().
(function (root) {
  'use strict';

  const MODIFIER_TIERS = {
    hostPrefix: 100,
    titlePrefix: 92,
    hostWord: 90,
    keywordPrefix: 88,
    titleWord: 84,
    hostContains: 70,
    titleContains: 62,
    keywordContains: 60,
    pathContains: 45,
    fuzzy: 30
  };

  // Bookmark names are user-chosen. Even a title substring should beat the
  // strongest address-only match (hostPrefix + the 30-point exact-host bonus).
  const BOOKMARK_TIERS = {
    ...MODIFIER_TIERS,
    titlePrefix: 160,
    titleWord: 150,
    titleContains: 140
  };

  function normalize(value) {
    return String(value || '').toLowerCase();
  }

  function tokenize(query) {
    return normalize(query).trim().split(/\s+/).filter(Boolean);
  }

  const SCOPES = ['tabs', 'bookmarks', 'history', 'actions', 'closed', 'workspaces'];

  function parseQuery(input) {
    const query = String(input || '').trim();
    const match = query.match(/^@(\w+)(?:\s+|$)/);
    const scope = match?.[1].toLowerCase();
    return SCOPES.includes(scope)
      ? { scope, query: query.slice(match[0].length).trim() }
      : { scope: null, query };
  }

  function getHost(url) {
    try {
      return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    } catch {
      return '';
    }
  }

  function getPath(url) {
    try {
      const u = new URL(url);
      return (u.pathname + u.search).toLowerCase();
    } catch {
      return normalize(url);
    }
  }

  function isWordStart(text, index) {
    return index === 0 || !/[a-z0-9]/.test(text[index - 1]);
  }

  // Does `token` appear at the start of a word in `text`?
  function wordStart(text, token) {
    let index = text.indexOf(token);
    while (index !== -1) {
      if (isWordStart(text, index)) return true;
      index = text.indexOf(token, index + 1);
    }
    return false;
  }

  // Abbreviation match: every character of `token` must be found in order, and each
  // character must either start a word or directly follow the previous match.
  // "gcal" matches "google calendar"; "abc" does not match "some random title".
  function fuzzy(text, token) {
    if (!text || !token) return false;
    let ti = 0;
    let last = -2;
    for (let i = 0; i < text.length && ti < token.length; i++) {
      if (text[i] !== token[ti]) continue;
      if (ti === 0 ? isWordStart(text, i) : (i === last + 1 || isWordStart(text, i))) {
        last = i;
        ti++;
      }
    }
    return ti === token.length;
  }

  function fieldsOf(item) {
    return {
      host: item.host !== undefined ? normalize(item.host) : getHost(item.url),
      title: normalize(item.title),
      path: item.url ? getPath(item.url) : normalize(item.description),
      keywords: Array.isArray(item.keywords) ? item.keywords.map(normalize) : null
    };
  }

  function scoreToken(token, f, tiers) {
    let best = 0;
    if (f.host) {
      if (f.host.startsWith(token)) best = tiers.hostPrefix;
      else if (wordStart(f.host, token)) best = tiers.hostWord;
      else if (f.host.includes(token)) best = tiers.hostContains;
    }
    if (f.title) {
      if (f.title.startsWith(token)) best = Math.max(best, tiers.titlePrefix);
      else if (wordStart(f.title, token)) best = Math.max(best, tiers.titleWord);
      else if (f.title.includes(token)) best = Math.max(best, tiers.titleContains);
    }
    if (f.keywords) {
      for (const keyword of f.keywords) {
        if (keyword.startsWith(token)) {
          best = Math.max(best, tiers.keywordPrefix);
          break;
        }
        if (keyword.includes(token)) best = Math.max(best, tiers.keywordContains);
      }
    }
    if (best < tiers.pathContains && f.path && f.path.includes(token)) {
      best = tiers.pathContains;
    }
    if (best === 0 && token.length >= 2 && (fuzzy(f.title, token) || fuzzy(f.host, token))) {
      best = tiers.fuzzy;
    }
    return best;
  }

  // Returns 0 when the item does not match every token.
  function score(item, query, tokens) {
    const f = fieldsOf(item);
    const tiers = item.type === 'bookmark' ? BOOKMARK_TIERS : MODIFIER_TIERS;
    let total = 0;
    for (const token of tokens) {
      const s = scoreToken(token, f, tiers);
      if (!s) return 0;
      total += s;
    }
    if (tokens.length > 1 && f.title.includes(query)) total += 15;
    if (f.host && f.host === query) total += 30;
    else if (f.title === query) total += 25;
    // Shorter titles win ties.
    total -= Math.min(f.title.length, 80) / 100;
    return total;
  }

  // Rank `items` against `query`. `boost(item)` may add a small amount (recency, etc.).
  function rank(items, query, { limit = 10, boost } = {}) {
    const q = normalize(query).trim();
    const tokens = tokenize(q);
    if (!tokens.length) return [];
    const scored = [];
    for (const item of items) {
      let s = score(item, q, tokens);
      if (s <= 0) continue;
      if (boost) s += boost(item) || 0;
      scored.push({ item, s });
    }
    scored.sort((a, b) => b.s - a.s);
    return scored.slice(0, limit).map(({ item, s }) => ({ ...item, score: Math.round(s * 100) / 100 }));
  }

  function isLikelyUrl(input) {
    const s = String(input || '').trim();
    if (!s || /\s/.test(s)) return false;
    if (/^(https?|ftp|file|chrome|chrome-extension|edge|about|view-source):/i.test(s)) return true;
    if (/^(localhost|\[::1\])(:\d+)?([/?#].*)?$/i.test(s)) return true;
    if (/^(\d{1,3}\.){3}\d{1,3}(:\d+)?([/?#].*)?$/.test(s)) return true;
    return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}(:\d+)?([/?#].*)?$/i.test(s);
  }

  function toNavigableUrl(input) {
    const s = String(input || '').trim();
    return /^[a-z][a-z0-9+.-]*:/i.test(s) ? s : 'https://' + s;
  }

  const api = { SCOPES, parseQuery, tokenize, getHost, wordStart, fuzzy, score, rank, isLikelyUrl, toNavigableUrl };
  root.ArcSearch = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
