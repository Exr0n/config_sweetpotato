// ==UserScript==
// @name         Amazon Order History → CSV
// @namespace    albert.amazon.orders
// @version      1.0
// @description  Scrape your own Amazon order history (order-level totals + item list) to CSV. Fetch-based, read-only, auto-paginates.
// @match        *://www.amazon.com/your-orders*
// @match        *://www.amazon.com/gp/your-account/order-history*
// @match        *://www.amazon.com/gp/css/order-history*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const ASIN_RE = /\/(?:dp|gp\/product)\/([A-Z0-9]{10})/;  // matches /dp/ASIN and /gp/product/ASIN in hrefs
  const DELAY_MS = 400;   // politeness gap between page fetches so we don't hammer Amazon
  const MAX_PAGES = 300;  // hard safety cap (~3000 orders) in case end-detection ever fails

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // --- parse one order card into a structured record -----------------------
  function parseCard(card) {
    const orderId = card.querySelector('.yohtmlc-order-id span[dir="ltr"]')?.textContent.trim() || '';

    let date = '', totalRaw = '';
    // header columns are captioned ("Order placed" / "Total" / "Ship to"); key off the caption, not position
    card.querySelectorAll('.order-header .a-column').forEach((col) => {
      const cap = col.querySelector('.a-text-caps')?.textContent.trim().toLowerCase();
      const val = col.querySelector('.a-size-base')?.textContent.trim() || '';
      if (cap === 'order placed') date = val;
      else if (cap === 'total') totalRaw = val;
    });

    const status = card.querySelector('.yohtmlc-shipment-status-primaryText')?.textContent.trim() || '';

    // items: both the standard left-image layout and the Whole Foods grid put product links in .delivery-box.
    // dedupe by ASIN — the image <a> (alt-text title, carries qty) and the title <a> (visible title) share an ASIN.
    const items = [];
    const seen = new Set();
    card.querySelectorAll('.delivery-box a[href*="/dp/"], .delivery-box a[href*="/gp/product/"]').forEach((a) => {
      const m = a.getAttribute('href').match(ASIN_RE);
      if (!m) return;
      const asin = m[1];
      if (seen.has(asin)) return;  // first hit per ASIN wins (image link comes first, carries the qty badge)
      let title = a.textContent.trim();
      if (!title) title = a.querySelector('img[alt]')?.getAttribute('alt').trim() || '';  // grocery grid: title is in img alt
      if (!title) return;
      seen.add(asin);
      const box = a.closest('.product-image, .product-grid-image');  // qty badge lives in the image container
      const qtyTxt = box?.querySelector('.product-image__qty')?.textContent.trim();
      const qty = qtyTxt && !isNaN(parseInt(qtyTxt, 10)) ? parseInt(qtyTxt, 10) : 1;
      items.push({ asin, title, qty });
    });

    return { orderId, date, totalRaw, status, items };
  }

  function parseDoc(doc) {
    return [...doc.querySelectorAll('.order-card.js-order-card')].map(parseCard);
  }

  // --- CSV assembly --------------------------------------------------------
  const esc = (v) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;  // RFC-4180 quoting only when needed
  };

  function toCSV(orders) {
    const header = ['order_id', 'order_date', 'order_total_usd', 'order_total_raw',
                    'delivery_status', 'item_title', 'asin', 'quantity', 'order_url'];
    const rows = [header.join(',')];
    for (const o of orders) {
      const totalNum = o.totalRaw.replace(/[^0-9.]/g, '');  // "$105.19" -> "105.19"
      const url = `https://www.amazon.com/your-orders/order-details?orderID=${o.orderId}`;
      const items = o.items.length ? o.items : [{ asin: '', title: '', qty: '' }];  // keep zero-item orders as one row
      items.forEach((it, i) => {
        // order-level fields emitted ONLY on the first item row so SUM(order_total_usd) == true spend, no double count
        const first = i === 0;
        rows.push([
          o.orderId, o.date,
          first ? totalNum : '', first ? o.totalRaw : '', first ? o.status : '',
          it.title, it.asin, it.qty, url,
        ].map(esc).join(','));
      });
    }
    return '\uFEFF' + rows.join('\r\n');  // BOM so Excel reads UTF-8 titles correctly
  }

  function download(csv, filename) {
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  // --- scrape loop ---------------------------------------------------------
  async function scrapeAll(timeFilter, onProgress) {
    const byId = new Map();  // dedupe across pages by orderId
    for (let page = 0; page < MAX_PAGES; page++) {
      const idx = page * 10;
      const url = `/your-orders/orders?timeFilter=${encodeURIComponent(timeFilter)}&startIndex=${idx}`;
      const res = await fetch(url, { credentials: 'same-origin' });
      const doc = new DOMParser().parseFromString(await res.text(), 'text/html');

      if (/sign.?in/i.test(doc.title) && !doc.querySelector('.order-card')) {
        throw new Error('Hit a sign-in wall — reload Your Orders, confirm you are logged in, and retry.');
      }
      const orders = parseDoc(doc);
      if (orders.length === 0) break;  // past the last page
      for (const o of orders) if (o.orderId) byId.set(o.orderId, o);
      onProgress(page + 1, byId.size);
      await sleep(DELAY_MS);
    }
    return [...byId.values()];
  }

  // --- control panel -------------------------------------------------------
  function buildPanel() {
    if (document.getElementById('aoc-panel')) return;
    const live = document.querySelector('#time-filter');  // mirror the page's own time-filter options
    const opts = live
      ? [...live.options].map((o) => `<option value="${o.value}"${o.selected ? ' selected' : ''}>${o.textContent.trim()}</option>`).join('')
      : '<option value="year-2026">this year</option>';

    const panel = document.createElement('div');
    panel.id = 'aoc-panel';
    panel.style.cssText =
      'position:fixed;top:80px;right:16px;z-index:99999;background:#fff;border:1px solid #ccc;' +
      'border-radius:8px;padding:12px;font:13px/1.4 Arial,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.2);width:230px';
    panel.innerHTML =
      '<div style="font-weight:700;margin-bottom:8px">Orders → CSV</div>' +
      '<label style="display:block;margin-bottom:6px">Period:<br>' +
      `<select id="aoc-filter" style="width:100%;margin-top:2px">${opts}</select></label>` +
      '<button id="aoc-run" style="width:100%;padding:6px;cursor:pointer">Scrape &amp; download CSV</button>' +
      '<div id="aoc-status" style="margin-top:8px;color:#555;min-height:18px"></div>';
    document.body.appendChild(panel);

    const status = panel.querySelector('#aoc-status');
    panel.querySelector('#aoc-run').addEventListener('click', async () => {
      const tf = panel.querySelector('#aoc-filter').value;
      const btn = panel.querySelector('#aoc-run');
      btn.disabled = true;
      status.textContent = 'Starting…';
      try {
        const orders = await scrapeAll(tf, (p, n) => { status.textContent = `Page ${p} · ${n} orders`; });
        if (!orders.length) { status.textContent = 'No orders found for that period.'; }
        else {
          download(toCSV(orders), `amazon-orders-${tf}.csv`);
          const spend = orders.reduce((s, o) => s + (parseFloat(o.totalRaw.replace(/[^0-9.]/g, '')) || 0), 0);
          status.textContent = `Done: ${orders.length} orders · $${spend.toFixed(2)} total`;
        }
      } catch (e) {
        status.textContent = e.message;
      } finally {
        btn.disabled = false;
      }
    });
  }

  buildPanel();
})();