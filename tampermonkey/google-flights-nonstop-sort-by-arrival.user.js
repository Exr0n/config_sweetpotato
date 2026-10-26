// ==UserScript==
// @name         Google Flights: nonstop + sort by arrival
// @namespace    http://tampermonkey.net/
// @version      0.2
// @description  On google.com/travel/flights results: filter to Nonstop first (faster), then sort by Arrival time once the sort button is ready.
// @match        *://www.google.com/travel/flights*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  // ===========================================================================
  // DECLARATIVE STEP ARRAY
  // Order: nonstop filter first (stops chip appears quickly), then sort change
  // (sort button "Sorted by top flights" appears only after results hydrate,
  // so it gets a longer trigger timeout).
  // ===========================================================================

  const STEPS = [
    {
      name: 'open Stops filter',
      wait: { ms: 30 },
      trigger: { selector: 'div[data-filtertype="10"] button[aria-label^="Stops,"]' },
      action: { type: 'click', selector: 'div[data-filtertype="10"] button[aria-label^="Stops,"]' },
    },
    {
      name: 'select Nonstop only',
      // Material hides the <input>; click the <label> (for=id triggers the radio).
      wait: { ms: 40, jitter: 1 },
      trigger: { selector: 'label.VfPpkd-V67aGc', textContains: 'Nonstop only' },
      action: { type: 'click', selector: 'label.VfPpkd-V67aGc', textContains: 'Nonstop only' },
    },
    {
      name: 'close Stops dialog',
      wait: { ms: 80, jitter: 1 },  // extra: list refreshes after stops filter
      trigger: { selector: 'button[jsname="tHuhgf"][aria-label="Close dialog"]' },
      action: { type: 'click', selector: 'button[jsname="tHuhgf"][aria-label="Close dialog"]' },
    },
    {
      name: 'open sort-order dropdown',
      // "Sorted by top flights" text in the aria-label only appears once the
      // results list has finished its first render — use it as a readiness gate.
      // Longer timeout because this is the slow step the user hit.
      wait: { ms: 30 },
      trigger: {
        selector: 'button[jsname="AefGQb"][aria-label*="Sorted by"]',
        timeout: 20000,
      },
      action: { type: 'click', selector: 'button[jsname="AefGQb"][aria-label*="Sorted by"]' },
    },
    {
      name: 'select Arrival time',
      // Sort menu data-value enum: 1=Top, 2=Price, 3=Departure, 4=Arrival, 5=Duration, 6=Emissions
      wait: { ms: 40, jitter: 1 },
      trigger: { selector: 'li[role="menuitemradio"][data-value="4"]' },
      action: { type: 'click', selector: 'li[role="menuitemradio"][data-value="4"]' },
    },
  ];

  const CONFIG = {
    DEBUG: true,
    STARTUP_DELAY_MS: 200,
    TRIGGER_TIMEOUT_MS: 8000,
    TRIGGER_POLL_MS: 100,
    STOP_ON_ERROR: true,
    GATE_SELECTOR: 'div[data-filtertype="10"]',  // filter row = results page is live
  };

  // ===========================================================================
  // Engine — copied from gflights-auto
  // ===========================================================================

  const log = (...a) => CONFIG.DEBUG && console.log('[gflights-sortfilter]', ...a);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const jittered = (ms, jitter) => ms + (jitter ? Math.floor(Math.random() * jitter) : 0);
  const txt = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();

  function isVisible(el) {
    if (!el) return false;
    const s = window.getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden') return false;
    if (el.offsetParent === null) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return false;
    }
    return true;
  }

  function specMatches(el, spec) {
    if (!el) return false;
    if (spec.textContains && !txt(el).toLowerCase().includes(spec.textContains.toLowerCase())) return false;
    if (spec.text && txt(el) !== spec.text) return false;
    return true;
  }

  function findAll(spec) {
    return Array.from(document.querySelectorAll(spec.selector))
      .filter(isVisible)
      .filter((el) => specMatches(el, spec));
  }

  function findOne(spec) {
    return findAll(spec)[0] || null;
  }

  async function waitForElement(spec, timeoutMs) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      const el = findOne(spec);
      if (el) return el;
      await sleep(CONFIG.TRIGGER_POLL_MS);
    }
    return null;
  }

  const ACTIONS = {
    click(spec) {
      const el = findOne(spec);
      if (!el) return { ok: false, reason: `no match: ${spec.selector}` };
      el.click();
      return { ok: true, note: txt(el).slice(0, 40) };
    },
    clickFirst(spec) {
      const all = findAll(spec);
      if (all.length === 0) return { ok: false, reason: `no match: ${spec.selector}` };
      all[0].click();
      return { ok: true, note: `first of ${all.length}: "${txt(all[0])}"` };
    },
    focus(spec) {
      const el = findOne(spec);
      if (!el) return { ok: false, reason: `no match: ${spec.selector}` };
      el.focus();
      return { ok: true };
    },
    focusClick(spec) {
      const el = findOne(spec);
      if (!el) return { ok: false, reason: `no match: ${spec.selector}` };
      el.focus();
      el.click();
      return { ok: true };
    },
  };

  async function runStep(step, i) {
    log(`[${i + 1}/${STEPS.length}] ${step.name}`);

    if (step.wait?.ms != null) {
      const ms = jittered(step.wait.ms, step.wait.jitter);
      log(`  wait ${ms}ms`);
      await sleep(ms);
    }

    if (step.trigger) {
      const timeout = step.trigger.timeout || CONFIG.TRIGGER_TIMEOUT_MS;
      const el = await waitForElement(step.trigger, timeout);
      if (!el) return { ok: false, reason: `trigger timeout (${timeout}ms): ${step.trigger.selector}` };
      log(`  trigger ok — "${txt(el).slice(0, 60)}"`);
    }

    const fn = ACTIONS[step.action.type];
    if (!fn) return { ok: false, reason: `unknown action: ${step.action.type}` };
    const result = fn(step.action);
    log(`  action ${result.ok ? 'ok' : 'FAIL'}${result.note ? ' — ' + result.note : ''}${result.reason ? ' — ' + result.reason : ''}`);
    return result;
  }

  async function run() {
    if (!document.querySelector(CONFIG.GATE_SELECTOR)) {
      log('no filter row on page, skipping');
      return;
    }
    log(`startup delay ${CONFIG.STARTUP_DELAY_MS}ms`);
    await sleep(CONFIG.STARTUP_DELAY_MS);

    for (let i = 0; i < STEPS.length; i += 1) {
      const result = await runStep(STEPS[i], i);
      if (!result.ok && CONFIG.STOP_ON_ERROR) {
        log(`stopped at "${STEPS[i].name}": ${result.reason}`);
        return;
      }
    }
    log('all steps complete');
  }

  run().catch((err) => console.error('[gflights-sortfilter] fatal', err));
})();