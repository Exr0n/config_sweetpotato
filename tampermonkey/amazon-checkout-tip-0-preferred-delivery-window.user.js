// ==UserScript==
// @name         Amazon checkout: tip -> $0 + preferred delivery window
// @namespace    http://tampermonkey.net/
// @version      0.5
// @description  Sets grocery tip to $0 and picks a preferred One-Hour Windows slot on Amazon checkout. Human-paced delays to avoid bot detection.
// @match        *://www.amazon.com/checkout*
// @match        *://amazon.com/checkout*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const CONFIG = {
    DEBUG: true,

    // Tip
    SET_TIP_TO_ZERO: true,

    // Delivery
    SET_DELIVERY_WINDOW: true,
    DELIVERY_MODE_LABEL: 'One-Hour Windows',
    EXPAND_MORE_TIMES: true,
    PREFERRED_TIME_TEXT: '8 AM - 9 AM',

    // Timing — human-paced to avoid bot detection
    ACTION_DELAY_MS: 300,    // minimum gap between any two actions
    POLL_INTERVAL_MS: 300,   // check condition every 300ms
    POLL_TIMEOUT_MS: 1500,   // wait up to 1.5s for server-side updates
    RETRY_MS: 500,           // main loop retry
    MAX_ATTEMPTS: 15,        // 15 * 500ms = 7.5s total budget
    STARTUP_DELAY_MS: 2500,  // initial page load settling
  };

  const STATE = {
    tipDone: false,
    deliveryDone: false,
    finished: false,
    running: false,
    attempts: 0,
    started: false,
  };

  const log = (...args) => CONFIG.DEBUG && console.log('[amazon-checkout-auto]', ...args);

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  async function pollFor(fn, label) {
    const t0 = Date.now();
    while (Date.now() - t0 < CONFIG.POLL_TIMEOUT_MS) {
      if (fn()) { log(label, 'ok'); return true; }
      await sleep(CONFIG.POLL_INTERVAL_MS);
    }
    log(label, 'timed out');
    return false;
  }

  function isVisible(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && el.offsetParent !== null;
  }

  function textOf(el) {
    return (el?.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function click(el, label = 'element') {
    if (!el) return false;
    log('Clicking', label);
    el.click();
    return true;
  }

  function setNativeValue(input, value) {
    const proto = Object.getPrototypeOf(input);
    const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
    if (descriptor && descriptor.set) {
      descriptor.set.call(input, value);
    } else {
      input.value = value;
    }
  }

  function fireInputEvents(input) {
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  // --------------------
  // Tip logic
  // --------------------

  function findTipWidget() {
    return document.querySelector('#tw.tip-widget');
  }

  function findTipEditLink(widget) {
    if (!widget) return null;
    return Array.from(widget.querySelectorAll('.tip-widget--edit-control')).find((el) =>
      /edit/i.test(textOf(el))
    );
  }

  function findTipInput(widget) {
    return widget?.querySelector('#tip-widget--edit-form--amount-input') || null;
  }

  function findTipApply(widget) {
    return widget?.querySelector('#tip-widget--submit-update') || null;
  }

  function tipAlreadyZero() {
    const hidden = document.querySelector('input#subtotal-line-type[value="FRESH_TIP"]');
    const row = hidden?.closest('.order-summary-grid');
    const valueNode = row?.querySelector('.order-summary-line-definition .aok-nowrap');
    const text = textOf(valueNode);
    return text === '$0.00' || text === '$0';
  }

  async function handleTip() {
    if (!CONFIG.SET_TIP_TO_ZERO) { STATE.tipDone = true; return true; }
    if (tipAlreadyZero()) { log('Tip already zero'); STATE.tipDone = true; return true; }

    const widget = findTipWidget();
    if (!widget) { log('Tip widget not found yet'); return false; }

    let input = findTipInput(widget);

    if (!isVisible(input)) {
      const edit = findTipEditLink(widget);
      if (!edit) { log('Tip Edit link not found'); return false; }
      click(edit, 'tip Edit');
      await sleep(CONFIG.ACTION_DELAY_MS);
      return false;  // let main loop re-enter after input appears
    }

    const apply = findTipApply(widget);
    if (!input || !apply) { log('Tip input/apply not ready'); return false; }

    if (String(input.value) !== '0') {
      input.focus();
      await sleep(CONFIG.ACTION_DELAY_MS);
      input.select?.();
      setNativeValue(input, '0');
      fireInputEvents(input);
      log('Set tip input to 0');
      await sleep(CONFIG.ACTION_DELAY_MS);
    }

    click(apply, 'tip Apply');
    STATE.tipDone = await pollFor(tipAlreadyZero, 'tip→zero');
    return STATE.tipDone;
  }

  // --------------------
  // Delivery logic
  // --------------------

  function findOneHourModeLabel() {
    return Array.from(document.querySelectorAll('span.delivery-promise-text, span[id$="PromiseReferenceForRadioLabel"]'))
      .find((el) => textOf(el) === CONFIG.DELIVERY_MODE_LABEL);
  }

  function findOneHourModeRadioRoot() {
    const label = findOneHourModeLabel();
    return label?.closest('[data-a-input-name="deliveryOptionRadioButton"]') || null;
  }

  function oneHourModeSelected() {
    const root = findOneHourModeRadioRoot();
    if (!root) return false;
    return root.getAttribute('data-isselected') === 'true' ||
      !!root.querySelector('input[type="radio"]:checked');
  }

  async function selectOneHourMode() {
    const root = findOneHourModeRadioRoot();
    if (!root) { log('One-Hour Windows root not found yet'); return false; }
    if (oneHourModeSelected()) { log('One-Hour Windows already selected'); return true; }

    const clickable = root.querySelector('label, input[type="radio"]') || root;
    click(clickable, 'One-Hour Windows option');
    return await pollFor(oneHourModeSelected, 'one-hour-mode');
  }

  function findExpanderLink() {
    return document.querySelector('#checkout-extra-scheduled-slots-expander-link-scheduled-one-houdini');
  }

  function isExpanderExpanded() {
    const link = findExpanderLink();
    return link?.getAttribute('aria-expanded') === 'true';
  }

  async function expandMoreTimes() {
    if (!CONFIG.EXPAND_MORE_TIMES) return true;

    const link = findExpanderLink();
    if (!link || isExpanderExpanded() || !isVisible(link)) return true;
    if (!/See more delivery times/i.test(textOf(link))) return true;

    click(link, 'See more delivery times');
    await sleep(CONFIG.ACTION_DELAY_MS);
    return true;
  }

  function getAllSlotButtons() {
    return Array.from(
      document.querySelectorAll(
        '[data-action="checkout-grocery-select-ship-option-delivery-slot"] button.a-button-text'
      )
    ).filter(isVisible);
  }

  function findPreferredSlotButton() {
    const target = CONFIG.PREFERRED_TIME_TEXT.replace(/\s+/g, ' ').trim().toLowerCase();
    return getAllSlotButtons().find((btn) => textOf(btn).toLowerCase().includes(target)) || null;
  }

  function preferredSlotSelected() {
    return getAllSlotButtons().some((btn) => {
      const txt = textOf(btn).toLowerCase();
      return txt.includes(CONFIG.PREFERRED_TIME_TEXT.toLowerCase()) &&
        (btn.getAttribute('aria-pressed') === 'true' ||
         btn.closest('.a-button-selected') !== null);
    });
  }

  async function selectPreferredSlot() {
    const btn = findPreferredSlotButton();
    if (!btn) {
      log('Preferred slot not found yet:', CONFIG.PREFERRED_TIME_TEXT);
      const seen = getAllSlotButtons().map(textOf);
      if (seen.length) log('Visible slots:', seen);
      return false;
    }
    if (preferredSlotSelected()) { log('Preferred slot already selected'); return true; }

    click(btn, `slot ${CONFIG.PREFERRED_TIME_TEXT}`);
    return await pollFor(preferredSlotSelected, 'slot-selected');
  }

  async function handleDelivery() {
    if (!CONFIG.SET_DELIVERY_WINDOW) { STATE.deliveryDone = true; return true; }

    const modeOk = await selectOneHourMode();
    if (!modeOk) return false;

    await sleep(CONFIG.ACTION_DELAY_MS);
    await expandMoreTimes();

    await sleep(CONFIG.ACTION_DELAY_MS);
    const slotOk = await selectPreferredSlot();
    if (!slotOk) return false;

    STATE.deliveryDone = true;
    log('Delivery slot selected');
    return true;
  }

  // --------------------
  // Main loop
  // --------------------

  async function runOnce() {
    if (!STATE.tipDone) await handleTip();

    if (!STATE.tipDone) return false;
    await sleep(CONFIG.ACTION_DELAY_MS);

    if (!STATE.deliveryDone) await handleDelivery();

    if (STATE.tipDone && STATE.deliveryDone) {
      STATE.finished = true;
      log('All tasks complete');
      return true;
    }
    return false;
  }

  async function main() {
    if (STATE.running || STATE.finished) return;

    STATE.running = true;
    try {
      while (!STATE.finished && STATE.attempts < CONFIG.MAX_ATTEMPTS) {
        STATE.attempts += 1;
        log(`Attempt ${STATE.attempts}/${CONFIG.MAX_ATTEMPTS}`);

        await runOnce();

        if (STATE.finished) break;
        await sleep(CONFIG.RETRY_MS);
      }

      if (!STATE.finished) {
        log('Stopped after max attempts', { state: { ...STATE } });
      }
    } catch (err) {
      console.error('[amazon-checkout-auto] error', err);
    } finally {
      STATE.running = false;
    }
  }

  async function startOnce() {
    if (STATE.started) return;
    STATE.started = true;
    log('Startup delay...');
    await sleep(CONFIG.STARTUP_DELAY_MS);
    await main();
  }

  startOnce();
})();