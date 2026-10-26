// Run with: node --test test/
const test = require('node:test');
const assert = require('node:assert/strict');
const { rank, fuzzy, wordStart, isLikelyUrl, toNavigableUrl, getHost, parseQuery, SCOPES } = require('../search.js');

test('scope prefixes are case insensitive, accept empty queries and only match at the start', () => {
  for (const scope of SCOPES) {
    assert.deepEqual(parseQuery(` @${scope.toUpperCase()}  calendar `), { scope, query: 'calendar' });
    assert.deepEqual(parseQuery(`@${scope}`), { scope, query: '' });
  }
  for (const query of ['email @tabs', '@tab', '@tabs.example.com', '@unknown test', 'person@example.com']) {
    assert.deepEqual(parseQuery(query), { scope: null, query });
  }
});

const tabs = [
  { type: 'tab', id: 1, title: 'GitHub', url: 'https://github.com/', host: 'github.com', mruIndex: 3 },
  { type: 'tab', id: 2, title: 'dmrediger/arc: Arc features for Chrome', url: 'https://github.com/dmrediger/arc', host: 'github.com', mruIndex: 0 },
  { type: 'tab', id: 3, title: 'Google Calendar - Week of Sep 1', url: 'https://calendar.google.com/calendar/u/0/r', host: 'calendar.google.com', mruIndex: 1 },
  { type: 'tab', id: 4, title: 'Inbox (3) - dmrediger@gmail.com - Gmail', url: 'https://mail.google.com/mail/u/0/#inbox', host: 'mail.google.com', mruIndex: 2 },
  { type: 'tab', id: 5, title: 'Some random title', url: 'https://example.org/a/b', host: 'example.org', mruIndex: 4 }
];

test('host prefix beats title match', () => {
  const results = rank(tabs, 'git');
  assert.equal(results[0].host, 'github.com');
  assert.ok(results.every(r => r.host === 'github.com'));
});

test('every token must match', () => {
  assert.deepEqual(rank(tabs, 'github calendar').map(r => r.id), []);
  assert.deepEqual(rank(tabs, 'arc chrome').map(r => r.id), [2]);
});

test('abbreviations match word starts only', () => {
  assert.ok(fuzzy('google calendar', 'gcal'));
  assert.ok(fuzzy('calendar.google.com', 'cg'));
  assert.ok(!fuzzy('some random title', 'abc'));
  assert.equal(rank(tabs, 'gcal')[0].id, 3);
});

test('word start detection', () => {
  assert.ok(wordStart('dmrediger/arc: arc features', 'arc'));
  assert.ok(!wordStart('search', 'arc'));
});

test('recency boost orders equal matches by MRU', () => {
  const results = rank(tabs, 'google', { boost: t => Math.max(0, 6 - t.mruIndex) });
  assert.deepEqual(results.map(r => r.id), [3, 4]);
});

test('bookmarks with the same host as a tab are not filtered', () => {
  const bookmarks = [{ type: 'bookmark', id: 'b1', title: 'GitHub', url: 'https://github.com/', host: 'github.com' }];
  assert.equal(rank(bookmarks, 'github').length, 1);
});

test('Flashquotes bookmark titles rank above address-only matches before the nine-result cutoff', () => {
  const bookmarks = [
    ['Canny', 'https://flashquotes.canny.io'],
    ['Sentry', 'https://flashquotes.sentry.io'],
    ['Retool', 'https://flashquotes.retool.com'],
    ['Flashquotes App', 'https://app.flashquotes.com'],
    ['Flashquotes Podcast - Spotify', 'https://open.spotify.com/show/podcast'],
    ['Flashquotes Podcast - Apple Podcasts', 'https://podcasts.apple.com/podcast'],
    ['Zapier - Flashquotes Integration', 'https://zapier.com'],
    ['Github', 'https://github.com/flashquotes'],
    ['Vercel', 'https://vercel.com/flashquotes'],
    ['Dashboard', 'https://flashquotes.example.com'],
    ['Logs', 'https://logs.example.com/flashquotes']
  ].map(([title, url]) => ({ type: 'bookmark', title, url }));
  for (const query of ['flashquote', 'FLASHQUOTES']) {
    const results = rank(bookmarks, query, { limit: 9 });
    assert.equal(results.length, 9);
    assert.deepEqual(results.slice(0, 4).map(r => r.title), [
      'Flashquotes App',
      'Flashquotes Podcast - Spotify',
      'Flashquotes Podcast - Apple Podcasts',
      'Zapier - Flashquotes Integration'
    ]);
    assert.ok(results.slice(4).every(r => !r.title.toLowerCase().includes('flashquotes')));
  }
});

test('bookmark title substrings beat exact hosts, and all query tokens must still match', () => {
  const bookmarks = [
    { type: 'bookmark', title: 'Dashboard', url: 'https://flashquotes.com' },
    { type: 'bookmark', title: 'Myflashquotes.com', url: 'https://example.com' },
    { type: 'bookmark', title: 'Flashquotes.com', url: 'https://other.example.com' }
  ];
  assert.deepEqual(rank(bookmarks, 'flashquotes.com').map(r => r.title), ['Flashquotes.com', 'Myflashquotes.com', 'Dashboard']);
  assert.equal(rank(bookmarks, 'flashquotes missing').length, 0);
});

test('limit and empty query', () => {
  assert.equal(rank(tabs, 'o', { limit: 2 }).length, 2);
  assert.deepEqual(rank(tabs, '   '), []);
});

test('actions match keywords and description', () => {
  const actions = [
    { type: 'action', id: 'cleanup', title: 'Cleanup', description: 'Close tabs without a matching bookmark', keywords: ['tidy', 'dedupe'] },
    { type: 'action', id: 'reset', title: 'Reset', description: 'Close all tabs', keywords: ['fresh', 'start over'] }
  ];
  assert.equal(rank(actions, 'tidy')[0].id, 'cleanup');
  assert.equal(rank(actions, 'start')[0].id, 'reset');
  assert.equal(rank(actions, 'close').length, 2);
});

test('url detection', () => {
  for (const s of ['github.com', 'https://x.y', 'localhost:3000', '127.0.0.1:8080/x', 'chrome://extensions', 'docs.google.com/a?b=1']) {
    assert.ok(isLikelyUrl(s), s);
  }
  for (const s of ['how to bake bread', 'github', 'foo bar.com', '']) {
    assert.ok(!isLikelyUrl(s), s);
  }
  assert.equal(toNavigableUrl('github.com'), 'https://github.com');
  assert.equal(toNavigableUrl('chrome://history'), 'chrome://history');
});

test('getHost strips www only as a prefix', () => {
  assert.equal(getHost('https://www.example.com/x'), 'example.com');
  assert.equal(getHost('https://awww.example.com/'), 'awww.example.com');
  assert.equal(getHost('not a url'), '');
});
