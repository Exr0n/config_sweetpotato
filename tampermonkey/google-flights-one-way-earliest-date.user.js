// ==UserScript==
// @name         Google Flights: one-way + earliest date
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  On the Google flights widget, switch Round trip -> One way, pick earliest available date, click Done, then Show flights.
// @match        *://www.google.com/search*
// @match        *://www.google.com/travel/flights*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  // ===========================================================================
  // DECLARATIVE STEP ARRAY
  // Each step: optional `wait` (time pacing), optional `trigger` (element
  // readiness), then an `action`. Tweak delays / reorder / add steps here.
  // ===========================================================================

  const STEPS = [
    {
      name: 'open ticket-type dropdown',
      wait: { ms: 30 },
      trigger: { selector: 'div[role="combobox"][aria-label="Change ticket type."]' },
      action: { type: 'click', selector: 'div[role="combobox"][aria-label="Change ticket type."]' },
    },
    {
      name: 'select One way',
      wait: { ms: 40, jitter: 1 },
      trigger: { selector: 'div[role="option"][data-v="oneway"]' },
      action: { type: 'click', selector: 'div[role="option"][data-v="oneway"]' },
    },
    {
      name: 'open departure date picker',
      wait: { ms: 40, jitter: 1 },
      trigger: { selector: 'input[jsname="Zfev4"]' },
      action: { type: 'focusClick', selector: 'input[jsname="Zfev4"]' },
    },
    {
      name: 'select earliest available date',
      wait: { ms: 30, jitter: 1 },
      // Available days lack aria-disabled="true"; past days have it. First
      // visible match = today if bookable, else next available day.
      trigger: { selector: 'calendar-day[data-day]:not([aria-disabled="true"])' },
      action: {
        type: 'clickFirst',
        selector: 'calendar-day[data-day]:not([aria-disabled="true"])',
      },
    },
    {
      name: 'click Done',
      wait: { ms: 30, jitter: 1 },
      trigger: { selector: 'div[role="button"].expUPd', textContains: 'Done' },
      action: { type: 'click', selector: 'div[role="button"].expUPd', textContains: 'Done' },
    },
    {
      name: 'click Show flights',
      wait: { ms: 100, jitter: 1 },
      trigger: { selector: 'div[jsname="yePe5c"][aria-label*="Show flights"]' },
      action: { type: 'click', selector: 'div[jsname="yePe5c"][aria-label*="Show flights"]' },
    },
  ];

  const CONFIG = {
    DEBUG: true,
    STARTUP_DELAY_MS: 100,       // let the widget hydrate before touching it
    TRIGGER_TIMEOUT_MS: 8000,     // max wait for any trigger element
    TRIGGER_POLL_MS: 100,         // poll interval while waiting
    STOP_ON_ERROR: true,          // abort run on first step failure
    GATE_SELECTOR: 'div[role="combobox"][aria-label="Change ticket type."]',
  };

  // ===========================================================================
  // Engine — generic wait/trigger/action runner
  // ===========================================================================

  const log = (...a) => CONFIG.DEBUG && console.log('[gflights-auto]', ...a);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));  // basic pacing primitive
  const jittered = (ms, jitter) => ms + (jitter ? Math.floor(Math.random() * jitter) : 0);
  const txt = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();

  function isVisible(el) {
    if (!el) return false;
    const s = window.getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden') return false;
    if (el.offsetParent === null) {  // catches ancestor display:none
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

  // --- action implementations ---
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

  // --- runner ---
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
    // Gate: only run if the flight widget exists on this page.
    if (!document.querySelector(CONFIG.GATE_SELECTOR)) {
      log('no flight widget on page, skipping');
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

  run().catch((err) => console.error('[gflights-auto] fatal', err));
})();