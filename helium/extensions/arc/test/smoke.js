// Browser smoke test. Loads the extension into a throwaway Chromium profile and
// drives the palette end to end (injection, search, quick switch, new-tab fallback,
// favicons under a strict CSP, MRU persistence).
//
//   CHROME_PATH=/path/to/Chromium node test/smoke.js
//
// Needs puppeteer-core on the module path (npm i -g puppeteer-core, or NODE_PATH).
// Chrome 137+ (the branded build) no longer honours --load-extension; use Chromium,
// Chrome for Testing or Chrome Canary.
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const puppeteer = require('puppeteer-core');

const SOURCE_DIR = path.resolve(__dirname, '..');

// A real shortcut press grants activeTab; a programmatic command does not. The
// test therefore runs a copy of the extension with a host permission for the
// local test server only. Nothing else differs from the shipped manifest.
function stageExtension() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arc-ext-'));
  for (const file of fs.readdirSync(SOURCE_DIR)) {
    if (['.git', 'test', 'node_modules'].includes(file)) continue;
    fs.cpSync(path.join(SOURCE_DIR, file), path.join(dir, file), { recursive: true });
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  manifest.host_permissions = ['http://127.0.0.1/*'];
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  return dir;
}

const EXTENSION_DIR = stageExtension();
const CHROME_PATH = process.env.CHROME_PATH;
if (!CHROME_PATH) {
  console.error('Set CHROME_PATH to a Chromium binary that supports --load-extension.');
  process.exit(1);
}

const PAGES = {
  '/a': ['Alpha Page', ''],
  '/b': ['Bravo Page', ''],
  '/c': ['Charlie Page', ''],
  '/d': ['Delta Page', ''],
  '/e': ['Echo Page', ''],
  '/csp': ['Strict CSP Page', "default-src 'self'; img-src 'self'; style-src 'self'"]
};

function startServer() {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      const [title, csp] = PAGES[req.url] || ['Missing', ''];
      const headers = { 'Content-Type': 'text/html' };
      if (csp) headers['Content-Security-Policy'] = csp;
      res.writeHead(200, headers);
      res.end(`<!doctype html><title>${title}</title><body><h1>${title}</h1><input id="field"></body>`);
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, origin: `http://127.0.0.1:${server.address().port}` }));
  });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function waitFor(fn, message, timeout = 4000) {
  const start = Date.now();
  let last;
  while (Date.now() - start < timeout) {
    try {
      last = await fn();
      if (last) return last;
    } catch (error) {
      last = error;
    }
    await sleep(50);
  }
  throw new Error(`Timed out: ${message} (last: ${last})`);
}

// Helpers evaluated inside the page's main world.
const PALETTE_STATE = () => {
  const host = document.querySelector('arc-palette');
  if (!host?.shadowRoot) return null;
  const root = host.shadowRoot;
  const rows = [...root.querySelectorAll('.arc-row')].map(r => ({
    title: r.querySelector('.arc-title')?.textContent,
    subtitle: r.querySelector('.arc-subtitle')?.textContent,
    badge: r.querySelector('.arc-badge')?.textContent,
    selected: r.classList.contains('is-selected'),
    num: (() => {
      const num = r.querySelector('.arc-num');
      return num && getComputedStyle(num).display !== 'none' ? num.textContent : null;
    })(),
    iconOk: (() => {
      const img = r.querySelector('img.arc-favicon');
      return img ? img.complete && img.naturalWidth > 0 : null;
    })()
  }));
  return {
    open: !!root.querySelector('.arc-root.is-open'),
    switching: !!root.querySelector('.arc-panel.is-switch'),
    numbered: !!root.querySelector('.arc-scope.is-numbered'),
    inputFocused: root.activeElement === root.querySelector('.arc-input'),
    labels: [...root.querySelectorAll('.arc-group-label')].map(l => l.textContent),
    rows,
    footer: root.querySelector('.arc-footer')?.textContent.trim(),
    styled: getComputedStyle(root.querySelector('.arc-panel')).borderRadius !== '0px'
  };
};

async function main() {
  const watchdog = setTimeout(() => {
    console.error('Smoke test timed out');
    process.exit(2);
  }, Number(process.env.SMOKE_TIMEOUT || 90000));
  console.log('Starting server...');
  const { server, origin } = await startServer();
  console.log('Launching browser...');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    ignoreDefaultArgs: ['--disable-extensions'],
    args: [
      `--disable-extensions-except=${EXTENSION_DIR}`,
      `--load-extension=${EXTENSION_DIR}`,
      '--no-first-run',
      '--no-default-browser-check'
    ]
  });

  const results = [];
  const check = (name, fn) => results.push({ name, fn });

  try {
    const swTarget = await browser.waitForTarget(t => t.type() === 'service_worker' && t.url().endsWith('background.js'), { timeout: 15000 });
    const session = await swTarget.createCDPSession();
    await session.send('Runtime.enable').catch(() => {});
    // Evaluate `fn(...args)` inside the service worker via CDP (WebWorker.evaluate
    // does not reliably resolve for service worker targets).
    const worker = {
      async evaluate(fn, ...args) {
        const expression = `(${fn.toString()})(...${JSON.stringify(args)})`;
        const { result, exceptionDetails } = await session.send('Runtime.evaluate', {
          expression, awaitPromise: true, returnByValue: true
        });
        if (exceptionDetails) throw new Error(exceptionDetails.exception?.description || exceptionDetails.text);
        return result.value;
      }
    };
    console.log('Service worker ready:', swTarget.url());
    const extensionId = new URL(swTarget.url()).host;

    const command = (name, tabId) => worker.evaluate(async (name, tabId) => {
      const tab = tabId != null ? await chrome.tabs.get(tabId) : undefined;
      await handleCommand(name, tab);
    }, name, tabId);
    const activeTab = () => worker.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      return tab && { id: tab.id, url: tab.url, windowId: tab.windowId };
    });
    const tabByUrl = url => worker.evaluate(async url => {
      const tabs = await chrome.tabs.query({});
      const tab = tabs.find(t => t.url === url);
      return tab && { id: tab.id, url: tab.url, windowId: tab.windowId };
    }, url);
    const activate = id => worker.evaluate(id => chrome.tabs.update(id, { active: true }), id);

    console.log('Opening test pages...');
    const pageA = await browser.newPage(); await sleep(700);
    await pageA.goto(`${origin}/a`);
    const pageB = await browser.newPage(); await sleep(700);
    await pageB.goto(`${origin}/b`);
    const pageC = await browser.newPage(); await sleep(700);
    await pageC.goto(`${origin}/c`);
    await sleep(200);
    console.log('Querying tabs from the worker...');
    const tabA = await tabByUrl(`${origin}/a`);
    const tabB = await tabByUrl(`${origin}/b`);
    const tabC = await tabByUrl(`${origin}/c`);
    assert.ok(tabA && tabB && tabC, 'test tabs exist');

    // Build an MRU history: C (current) <- B <- A
    await activate(tabA.id);
    await activate(tabB.id);
    await activate(tabC.id);
    await sleep(100);
    console.log('Setup complete, running checks...');

    check('a webpage without document focus still opens the centered overlay, not the popup', async () => {
      await pageC.bringToFront();
      await worker.evaluate(id => chrome.scripting.executeScript({
        target: { tabId: id },
        func: () => Object.defineProperty(document, 'hasFocus', { configurable: true, value: () => false })
      }), tabC.id);
      try {
        await command('toggle-palette', tabC.id);
        await waitFor(() => pageC.evaluate(PALETTE_STATE).then(s => s?.open && s.inputFocused), 'overlay on unfocused document');
        const layout = await pageC.evaluate(() => {
          const root = document.querySelector('arc-palette').shadowRoot;
          const rect = root.querySelector('.arc-panel').getBoundingClientRect();
          return { mode: root.querySelector('.arc-scope').dataset.mode, center: rect.x + rect.width / 2, viewport: innerWidth };
        });
        assert.equal(layout.mode, 'overlay');
        assert.ok(Math.abs(layout.center - layout.viewport / 2) < 2, 'palette stays centered in the webpage');
        await pageC.screenshot({path:'/tmp/arc-review/overlay.png'});
        assert.ok(!browser.targets().some(t => t.url() === `chrome-extension://${extensionId}/popup.html`), 'no toolbar popup');
        await pageC.keyboard.type('alpha');
        await waitFor(() => pageC.evaluate(PALETTE_STATE).then(s => s?.rows[0]?.title === 'Alpha Page'), 'overlay accepts typing');
        await pageC.keyboard.press('Escape');
        await pageC.keyboard.press('Escape');
      } finally {
        await worker.evaluate(id => chrome.scripting.executeScript({ target: { tabId: id }, func: () => { delete document.hasFocus; } }), tabC.id);
      }
    });

    check('palette opens on a web page with recent tabs in MRU order', async () => {
      await pageC.bringToFront();
      await pageC.focus('#field');
      await command('toggle-palette', tabC.id);
      const state = await waitFor(() => pageC.evaluate(PALETTE_STATE).then(s => s?.open && s.rows.length ? s : null), 'palette open');
      assert.ok(state.styled, 'shadow styles applied');
      assert.ok(state.inputFocused, 'input focused');
      assert.deepEqual(state.labels, ['Recent tabs']);
      assert.deepEqual(state.rows.map(r => r.title), ['Bravo Page', 'Alpha Page']);
      assert.ok(state.rows[0].selected);
      return state;
    });

    check('search ranks tabs, highlights and switches on Enter', async () => {
      await pageC.keyboard.type('alpha');
      const state = await waitFor(() => pageC.evaluate(PALETTE_STATE).then(s => s?.rows[0]?.title === 'Alpha Page' ? s : null), 'search results');
      assert.deepEqual(state.labels, ['Tabs']);
      const marks = await pageC.evaluate(() => document.querySelector('arc-palette').shadowRoot.querySelectorAll('.arc-mark').length);
      assert.ok(marks >= 1, 'matched text highlighted');
      await pageC.keyboard.press('Enter');
      await waitFor(async () => (await activeTab()).id === tabA.id, 'switched to A');
      const after = await pageC.evaluate(PALETTE_STATE);
      assert.equal(after.open, false, 'palette closed after switching');
    });

    check('second toggle re-uses the injected script and shows both tab and bookmark for one site', async () => {
      await worker.evaluate(url => chrome.bookmarks.create({ title: 'Bravo Favorite', url }), `${origin}/b`);
      await pageA.bringToFront();
      await command('toggle-palette', tabA.id);
      await waitFor(() => pageA.evaluate(PALETTE_STATE).then(s => s?.open ? s : null), 'palette open on A');
      const hosts = await pageA.evaluate(() => document.querySelectorAll('arc-palette').length);
      assert.equal(hosts, 1, 'only one palette host per page');
      await pageA.keyboard.type('bravo');
      const state = await waitFor(() => pageA.evaluate(PALETTE_STATE).then(s => s?.labels.length === 2 ? s : null), 'tab + bookmark groups');
      assert.deepEqual(state.labels, ['Tabs', 'Bookmarks']);
      assert.deepEqual(state.rows.map(r => r.badge), ['Tab', '★']);
      await pageA.keyboard.press('Escape'); // clears query
      await pageA.keyboard.press('Escape'); // closes
      const closed = await pageA.evaluate(PALETTE_STATE);
      assert.equal(closed.open, false);
    });

    check('favicons load inside a page with a strict CSP', async () => {
      const pageCsp = await browser.newPage(); await sleep(700);
      await pageCsp.goto(`${origin}/csp`);
      await pageCsp.bringToFront();
      await pageCsp.focus('#field');
      const tabCsp = await tabByUrl(`${origin}/csp`);
      await command('toggle-palette', tabCsp.id);
      await waitFor(() => pageCsp.evaluate(PALETTE_STATE).then(s => s?.open ? s : null), 'palette open on CSP page');
      await pageCsp.keyboard.type('page');
      const state = await waitFor(() => pageCsp.evaluate(PALETTE_STATE).then(s => s?.rows.length >= 3 && s.rows.every(r => r.iconOk !== false) && s.rows.some(r => r.iconOk) ? s : null), 'favicons loaded under CSP');
      assert.ok(state.styled, 'styles loaded under CSP');
      await pageCsp.keyboard.press('Escape');
      await pageCsp.keyboard.press('Escape');
      await pageCsp.close();
    });

    check('quick switch: hold shows MRU list, release jumps to previous tab', async () => {
      await activate(tabB.id);
      await sleep(100);
      await pageB.bringToFront();
      await pageB.focus('#field');
      await pageB.keyboard.down('Control'); // the user is holding the shortcut modifier
      await command('quick-switch', tabB.id);
      const state = await waitFor(() => pageB.evaluate(PALETTE_STATE).then(s => s?.switching ? s : null), 'switcher visible');
      assert.equal(state.rows[0].badge, 'Current');
      assert.ok(state.rows[1].selected, 'previous tab pre-selected');
      // Cycle once more (Chrome re-fires the command while the shortcut is held)
      await command('quick-switch', tabB.id);
      const cycled = await waitFor(() => pageB.evaluate(PALETTE_STATE).then(s => s?.rows[2]?.selected ? s : null), 'cycled to third');
      await pageB.keyboard.press('ArrowUp');
      await waitFor(() => pageB.evaluate(PALETTE_STATE).then(s => s?.rows[1]?.selected), 'arrow up');
      const expected = cycled.rows[1].title;
      await pageB.keyboard.up('Control');
      const active = await waitFor(async () => { const t = await activeTab(); return t.id !== tabB.id ? t : null; }, 'switched on release');
      const activeTitle = await worker.evaluate(id => chrome.tabs.get(id).then(t => t.title), active.id);
      assert.equal(activeTitle, expected);
      assert.equal((await pageB.evaluate(PALETTE_STATE)).open, false);
    });

    check('MRU order survives a service worker restart', async () => {
      await activate(tabC.id);
      await activate(tabA.id);
      await sleep(100);
      const before = await worker.evaluate(id => getMruTabs(id).then(t => t.map(x => x.title)), tabA.windowId);
      await worker.evaluate(() => { mruIds = null; mruLoading = null; }); // simulate the worker being killed
      const after = await worker.evaluate(id => getMruTabs(id).then(t => t.map(x => x.title)), tabA.windowId);
      assert.deepEqual(after, before);
      assert.deepEqual(after.slice(0, 2), ['Alpha Page', 'Charlie Page']);
    });

    check('hold the jump modifier to number the rows, tap a digit to jump', async () => {
      const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
      await pageA.bringToFront();
      await pageA.focus('#field');
      await command('toggle-palette', tabA.id);
      const before = await waitFor(() => pageA.evaluate(PALETTE_STATE).then(s => s?.open && s.rows.length >= 2 ? s : null), 'palette open on A');
      assert.equal(before.numbered, false);
      assert.ok(before.rows.every(r => r.num === null), 'numbers hidden until the modifier is held');
      assert.deepEqual(before.rows.slice(0, 2).map(r => r.title), ['Charlie Page', 'Bravo Page']);

      await pageA.keyboard.down(modifier);
      const held = await waitFor(() => pageA.evaluate(PALETTE_STATE).then(s => s?.numbered ? s : null), 'rows numbered while held');
      assert.ok(/1$/.test(held.rows[0].num) && /2$/.test(held.rows[1].num), `numbers shown (${held.rows[0].num}, ${held.rows[1].num})`);
      assert.ok(/jump/.test(held.footer), 'footer explains the jump keys');

      await pageA.keyboard.press('2');
      await waitFor(async () => (await activeTab()).id === tabB.id, 'jumped to the second row (Bravo)');
      await pageA.keyboard.up(modifier);
      assert.equal((await pageA.evaluate(PALETTE_STATE)).open, false, 'palette closed after the jump');
    });

    check('recently closed and history groups: restore a closed tab on Enter', async () => {
      const pageD = await browser.newPage(); await sleep(700);
      await pageD.goto(`${origin}/d`);
      await pageD.goto(`${origin}/e`);
      await sleep(200);
      await pageD.close(); // Echo is now recently closed; Delta lives only in history
      await sleep(300);

      await activate(tabA.id);
      await pageA.bringToFront();
      await pageA.focus('#field');
      await command('toggle-palette', tabA.id);
      await waitFor(() => pageA.evaluate(PALETTE_STATE).then(s => s?.open ? s : null), 'palette open on A');

      await pageA.keyboard.type('delta');
      const history = await waitFor(() => pageA.evaluate(PALETTE_STATE).then(s => s?.rows[0]?.title === 'Delta Page' ? s : null), 'history result');
      assert.deepEqual(history.labels, ['History']);
      assert.equal(history.rows[0].badge, 'History');

      await pageA.keyboard.press('Escape'); // clears the query
      await pageA.keyboard.type('echo');
      const closed = await waitFor(() => pageA.evaluate(PALETTE_STATE).then(s => s?.rows[0]?.title === 'Echo Page' ? s : null), 'closed tab result');
      assert.deepEqual(closed.labels, ['Recently closed']);
      assert.equal(closed.rows[0].badge, 'Closed');
      assert.ok(/reopen/.test(closed.footer), 'footer says reopen');

      await pageA.keyboard.press('Enter');
      const restored = await waitFor(async () => {
        const t = await activeTab();
        return t.url === `${origin}/e` ? t : null;
      }, 'closed tab restored and focused');
      assert.notEqual(restored.id, tabA.id, 'restored into its own tab');
      await worker.evaluate(id => chrome.tabs.remove(id), restored.id);
      await sleep(100);
    });

    check('new tab: palette opens in the popup (or a palette tab) and Enter switches', async () => {
      const blank = await browser.newPage();
      await blank.goto('chrome://newtab/').catch(() => {});
      await sleep(300);
      const tabNew = await worker.evaluate(async () => {
        const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        return { id: tab.id, url: tab.url, index: tab.index };
      });
      assert.ok(/newtab|new-tab-page/.test(tabNew.url), `active tab is a new tab (${tabNew.url})`);
      await command('toggle-palette', tabNew.id);

      // Chrome 127+ opens the toolbar popup; older builds and some headless
      // configurations fall back to swapping the blank tab for a palette tab.
      const popupUrl = `chrome-extension://${extensionId}/popup.html`;
      const pageUrl = `chrome-extension://${extensionId}/palette.html?from=newtab`;
      // Puppeteer does not wrap popup targets as pages, so drive whichever
      // surface appeared through a raw CDP session.
      const surface = await waitFor(async () => {
        const popup = browser.targets().find(t => t.url().startsWith(popupUrl));
        if (popup) return { kind: 'popup', target: popup };
        const tabs = await worker.evaluate(() => chrome.tabs.query({}));
        const t = tabs.find(t => t.url.startsWith(pageUrl));
        if (t && t.active && t.index === tabNew.index) {
          const target = browser.targets().find(x => x.url().startsWith(pageUrl));
          return target ? { kind: 'page', target, tabId: t.id } : null;
        }
        return null;
      }, 'popup or palette tab opened for the blank tab');
      console.log(`    (blank tab used the ${surface.kind})`);

      const cdp = await surface.target.createCDPSession();
      const evaluate = async expression => {
        const { result } = await cdp.send('Runtime.evaluate', { expression, returnByValue: true });
        return result.value;
      };
      await waitFor(() => evaluate(`document.activeElement?.classList.contains('arc-input') && document.querySelectorAll('.arc-row').length > 0`), 'palette ready');
      await cdp.send('Input.insertText', { text: 'charlie' });
      await waitFor(() => evaluate(`document.querySelector('.arc-row.is-selected .arc-title')?.textContent === 'Charlie Page'`), 'charlie found');
      // The palette closes itself right after Enter, so the key-up may not land.
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }).catch(() => {});
      await waitFor(async () => (await activeTab()).id === tabC.id, 'switched to C');
      const gone = id => worker.evaluate(id => chrome.tabs.get(id).then(() => false, () => true), id);
      await waitFor(() => gone(tabNew.id), 'blank tab closed');
      if (surface.kind === 'page') await waitFor(() => gone(surface.tabId), 'palette tab closed');
    });

    check('chrome:// page: falls back to the popup or a palette tab', async () => {
      const chromePage = await browser.newPage();
      await chromePage.goto('chrome://version/').catch(() => {});
      await sleep(200);
      const tab = await activeTab();
      await command('toggle-palette', tab.id);
      await waitFor(async () => {
        const targets = browser.targets().map(t => t.url());
        return targets.some(u => u.startsWith(`chrome-extension://${extensionId}/popup.html`) || u.startsWith(`chrome-extension://${extensionId}/palette.html?from=tab`));
      }, 'popup or palette tab opened');
    });

    let featurePage;
    let featureWindow;
    let featureTabs;
    let workspaceId;
    const searchFor = async query => {
      await featurePage.$eval('.arc-input', (input, value) => {
        input.focus();
        input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }, query);
    };
    const titles = () => featurePage.$$eval('.arc-row .arc-title', nodes => nodes.map(n => n.textContent));
    const chooseAction = async title => {
      const index = await featurePage.$$eval('.arc-row .arc-title', (nodes, title) => nodes.findIndex(n => n.textContent === title), title);
      assert.ok(index >= 0, `action exists: ${title}`);
      await featurePage.click(`.arc-row[data-index="${index}"]`);
    };

    check('scope picker, nine-result cap and empty scoped searches', async () => {
      featureWindow = await worker.evaluate(async origin => {
        const window = await chrome.windows.create({ url: [origin + '/a', origin + '/b'] });
        await chrome.tabs.update(window.tabs[0].id, { pinned: true, muted: true });
        return window;
      }, origin);
      featureTabs = featureWindow.tabs;
      const url = `chrome-extension://${extensionId}/palette.html?features=1`;
      await worker.evaluate((windowId, url) => chrome.tabs.create({ windowId, url }), featureWindow.id, url);
      const target = await browser.waitForTarget(t => t.url() === url);
      featurePage = await target.page();
      await featurePage.waitForSelector('.arc-root.is-open');
      await searchFor('@wor');
      await waitFor(async () => (await titles())[0] === '@workspaces', 'scope suggestion');
      await featurePage.keyboard.press('Enter');
      await waitFor(async () => (await titles())[0] === 'Save Workspace', 'scope selected');
      await worker.evaluate(async origin => {
        for (let i = 0; i < 12; i++) await chrome.bookmarks.create({ title: `Limit Fixture ${i}`, url: `${origin}/limit/${i}` });
        await chrome.history.addUrl({ url: origin + '/b' });
      }, origin);
      await searchFor('@bookmarks limit fixture');
      await waitFor(async () => (await titles()).length === 9, 'nine scoped results');
      const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
      await featurePage.keyboard.down(modifier);
      assert.equal(await featurePage.$$eval('.arc-num', nodes => nodes.length), 9);
      await featurePage.keyboard.up(modifier);
      await searchFor('limit fixture');
      await waitFor(async () => (await titles()).length === 9, 'nine unscoped results');
      await searchFor('@history bravo');
      await waitFor(async () => (await titles()).includes('Bravo Page'), 'history scope includes an open bookmarked page');
      await searchFor('@tabs missing-unique-result');
      await featurePage.waitForSelector('.arc-empty');
      const before = await worker.evaluate(() => chrome.tabs.query({}).then(t => t.length));
      await featurePage.keyboard.press('Enter');
      await sleep(100);
      assert.equal(await worker.evaluate(() => chrome.tabs.query({}).then(t => t.length)), before);
      assert.ok(await featurePage.$('.arc-root.is-open'));
    });

    check('result actions support keyboard/back, live pin and mute state, mouse and URL copy', async () => {
      await searchFor('@tabs alpha');
      await waitFor(async () => (await titles())[0] === 'Alpha Page', 'tab found');
      await featurePage.keyboard.press('ArrowRight');
      await waitFor(async () => (await titles())[0] === 'Unpin tab', 'tab action menu');
      await featurePage.keyboard.press('ArrowLeft');
      assert.equal(await featurePage.$eval('.arc-input', input => input.value), '@tabs alpha');
      await featurePage.keyboard.press('ArrowRight');
      await waitFor(async () => (await titles())[0] === 'Unpin tab', 'menu reopened');
      await featurePage.keyboard.press('Enter');
      await waitFor(async () => (await titles())[0] === 'Alpha Page', 'back after unpin');
      assert.equal(await worker.evaluate(id => chrome.tabs.get(id).then(t => t.pinned), featureTabs[0].id), false);
      await featurePage.click('.arc-row-actions');
      await waitFor(async () => (await titles()).includes('Unmute tab'), 'mouse opens menu');
      await chooseAction('Unmute tab');
      await waitFor(async () => (await titles())[0] === 'Alpha Page', 'back after unmute');
      assert.equal(await worker.evaluate(id => chrome.tabs.get(id).then(t => t.mutedInfo.muted), featureTabs[0].id), false);
      // Keep this automated test from changing the user's system clipboard.
      await featurePage.evaluate(() => { navigator.clipboard.writeText = async value => { window.copiedUrl = value; }; });
      await featurePage.keyboard.press('ArrowRight');
      await waitFor(async () => (await titles()).includes('Copy URL'), 'copy action available');
      await chooseAction('Copy URL');
      await waitFor(async () => (await titles())[0] === 'Alpha Page', 'back after copy');
      assert.equal(await featurePage.evaluate(() => window.copiedUrl), origin + '/a');
    });

    check('workspace shortcut opens the scope from a search and an action menu', async () => {
      await searchFor('@tabs alpha');
      await waitFor(async () => (await titles())[0] === 'Alpha Page', 'tab found');
      await featurePage.keyboard.down('Alt');
      await featurePage.keyboard.press('KeyW');
      await featurePage.keyboard.up('Alt');
      await waitFor(async () => (await titles())[0] === 'Save Workspace', 'workspace shortcut from search');
      assert.equal(await featurePage.$eval('.arc-input', input => input.value), '@workspaces ');
      await searchFor('@tabs alpha');
      await waitFor(async () => (await titles())[0] === 'Alpha Page', 'tab found again');
      await featurePage.keyboard.press('ArrowRight');
      await waitFor(async () => (await titles()).includes('Copy URL'), 'action menu open');
      // macOS reports a character such as ∑ for Option+W; the key code stays KeyW.
      await featurePage.$eval('.arc-input', input => input.dispatchEvent(new KeyboardEvent('keydown', {
        key: '∑', code: 'KeyW', altKey: true, bubbles: true, cancelable: true
      })));
      await waitFor(async () => (await titles())[0] === 'Save Workspace', 'workspace shortcut from action menu');
      assert.equal(await featurePage.$eval('.arc-input', input => input.readOnly), false);
    });

    check('save, rename and restore a workspace through the palette', async () => {
      await worker.evaluate(id => chrome.tabs.update(id, { pinned: true, muted: true }), featureTabs[0].id);
      await searchFor('@workspaces');
      await waitFor(async () => (await titles())[0] === 'Save Workspace', 'save command');
      await featurePage.keyboard.press('Enter');
      await featurePage.waitForSelector('input[name="workspaceName"]');
      await featurePage.keyboard.type('Morning');
      await featurePage.keyboard.press('Enter');
      await waitFor(async () => (await titles()).includes('Morning'), 'saved workspace visible');
      workspaceId = await worker.evaluate(async () => (await getWorkspaces()).find(w => w.title === 'Morning').id);
      const saved = await worker.evaluate(id => readWorkspace(id), workspaceId);
      assert.equal(saved.tabs.length, 2, 'palette tab excluded');
      assert.equal(saved.tabs[0].pinned, true);
      assert.equal(saved.tabs[0].muted, true);

      await searchFor('@workspaces morning');
      await waitFor(async () => (await titles())[0] === 'Morning', 'workspace found');
      await featurePage.keyboard.press('ArrowRight');
      await waitFor(async () => (await titles()).includes('Rename workspace'), 'workspace actions');
      await chooseAction('Rename workspace');
      await featurePage.waitForSelector('input[name="workspaceName"]');
      await featurePage.keyboard.type('Project'); // name field starts selected
      await featurePage.keyboard.press('Enter');
      await waitFor(async () => (await titles()).includes('Project'), 'renamed workspace visible');
      await searchFor('open project');
      await waitFor(async () => (await titles())[0] === 'Project', 'natural workspace search');
      const windowIds = await worker.evaluate(() => chrome.windows.getAll().then(w => w.map(w => w.id)));
      await featurePage.keyboard.press('Enter');
      const restored = await waitFor(() => worker.evaluate(async ids => {
        const windows = await chrome.windows.getAll({ populate: true });
        return windows.find(w => !ids.includes(w.id) && w.tabs.length === 2 && w.tabs[0].pinned && w.tabs[0].mutedInfo.muted);
      }, windowIds), 'workspace restored with pins and mute');
      await waitFor(() => worker.evaluate(async id => (await chrome.tabs.query({windowId:id})).map(t=>t.url), restored.id).then(urls => JSON.stringify(urls) === JSON.stringify(saved.tabs.map(t=>t.url))), 'restored URL navigations settle');
      assert.equal((await worker.evaluate(id => chrome.tabs.query({ windowId: id }), featureWindow.id)).length, 3, 'original window kept');
      await worker.evaluate(id => chrome.windows.remove(id), restored.id);
      await featurePage.bringToFront();
    });

    check('workspace forms show duplicate errors and support delete cancellation', async () => {
      await searchFor('@workspaces');
      await waitFor(async () => (await titles())[0] === 'Save Workspace', 'save command');
      await featurePage.keyboard.press('Enter');
      await featurePage.waitForSelector('input[name="workspaceName"]');
      await featurePage.keyboard.type('Project');
      await featurePage.keyboard.press('Enter');
      await waitFor(() => featurePage.$eval('.arc-form-error', node => node.textContent.includes('already exists')), 'duplicate error');
      await featurePage.keyboard.press('Escape');
      await searchFor('@workspaces project');
      await waitFor(async () => (await titles())[0] === 'Project', 'workspace to delete');
      await featurePage.keyboard.press('ArrowRight');
      await waitFor(async () => (await titles()).includes('Delete workspace'), 'delete action');
      await chooseAction('Delete workspace');
      await featurePage.waitForSelector('.arc-workspace-form');
      await featurePage.keyboard.press('Escape');
      assert.equal((await worker.evaluate(() => getWorkspaces())).length, 1, 'cancel retains workspace');
      await featurePage.keyboard.press('ArrowRight');
      await waitFor(async () => (await titles()).includes('Delete workspace'), 'delete action again');
      await chooseAction('Delete workspace');
      await featurePage.waitForSelector('.arc-workspace-form');
      await featurePage.keyboard.press('Enter');
      await waitFor(async () => (await worker.evaluate(() => getWorkspaces())).length === 0, 'workspace deleted');
      await waitFor(async () => (await titles())[0] === 'Save Workspace', 'returns to workspace scope');
    });

    let failed = 0;
    for (const { name, fn } of results) {
      try {
        await fn();
        console.log(`✔ ${name}`);
      } catch (error) {
        failed++;
        console.log(`✖ ${name}\n    ${error.stack || error}`);
      }
    }
    console.log(`\n${results.length - failed}/${results.length} passed`);
    process.exitCode = failed ? 1 : 0;
  } finally {
    clearTimeout(watchdog);
    fs.rmSync(EXTENSION_DIR, { recursive: true, force: true });
    await browser.close();
    server.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
