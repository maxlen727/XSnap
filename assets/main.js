/* ==========================================================================
   XSnap
   Static page, no build step. Data from FxEmbed, pixels from html2canvas-pro.

   Two renderer quirks drive how the export is built:
   · html2canvas ignores `gap` on flex containers → spacing is done with margins
   · html2canvas ignores `object-fit`              → images are cropped by hand
   ========================================================================== */
'use strict';

(function () {
  const API = 'https://api.fxtwitter.com';
  const PROXY = 'https://api.allorigins.win/raw?url=';
  const EXAMPLE = 'https://x.com/elonmusk/status/1949938925163962634';

  /*
   * Patterns are SVG data-URI tiles, not CSS gradients. html2canvas never paints
   * a tiled radial/linear gradient, but it does paint an image background — so
   * every texture here survives the export.
   */
  function tileUrl(w, h, inner) {
    const svg = "<svg xmlns='http://www.w3.org/2000/svg' width='" + w + "' height='" + h + "'>" + inner + '</svg>';
    return 'url("data:image/svg+xml;utf8,' + svg.replace(/#/g, '%23') + '")';
  }

  const BG_PRESETS = [
    { id: 'paper',  name: '纸',   bg: '#f4f1ea', wm: 'rgba(17,17,17,0.42)' },
    { id: 'white',  name: '白',   bg: '#ffffff', wm: 'rgba(17,17,17,0.34)' },
    { id: 'ink',    name: '墨',   bg: '#131313', wm: 'rgba(255,255,255,0.46)' },
    { id: 'indigo', name: '靛',   bg: '#1d3bff', wm: 'rgba(255,255,255,0.7)' },
    { id: 'blush',  name: '粉',   bg: '#ffd9e0', wm: 'rgba(17,17,17,0.42)' },
    { id: 'sand',   name: '沙',   bg: '#e6ddca', wm: 'rgba(17,17,17,0.42)' },
    { id: 'dots',   name: '点阵', bg: '#f4f1ea', wm: 'rgba(17,17,17,0.42)',
      tile: { w: 14, h: 14, svg: "<circle cx='7' cy='7' r='1' fill='#1d3bff' fill-opacity='0.34'/>" } },
    { id: 'grid',   name: '方格', bg: '#ffffff', wm: 'rgba(17,17,17,0.34)',
      tile: { w: 24, h: 24,
        svg: "<rect width='24' height='1' fill='#111111' fill-opacity='0.09'/>" +
             "<rect width='1' height='24' fill='#111111' fill-opacity='0.09'/>" } },
    { id: 'stripe', name: '斜纹', bg: '#f4f1ea', wm: 'rgba(17,17,17,0.42)',
      tile: { w: 9, h: 9, svg: "<path d='M0 9 L9 0' stroke='#111111' stroke-opacity='0.10' stroke-width='1'/>" } }
  ];

  const CARD_PRESETS = [
    { id: 'white', mode: 'light', preview: '#ffffff' },
    { id: 'cream', mode: 'cream', preview: '#faf8f3' },
    { id: 'ink',   mode: 'ink',   preview: '#131313' }
  ];

  const state = {
    lang: 'en',
    bg: { colors: ['#f4f1ea', '#1d3bff'], preset: 0 },
    card: { mode: 'light', color: '#ffffff' },
    layout: 'grid',
    quality: 3,
    stats: true,
    watermark: true,
    root: null
  };

  const dom = {};
  let proxyNotified = false;
  let watermarkEl = null;

  /* ── helpers ──────────────────────────────────────────────────────────── */

  const $ = (s, r) => (r || document).querySelector(s);
  const t = (k) => (i18n[state.lang] && i18n[state.lang][k]) || i18n.en[k] || k;
  const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

  function fmtCount(n) {
    if (n == null || isNaN(n)) return null;
    n = Number(n);
    if (n < 1000) return String(n);
    if (n < 10000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
    if (n < 1e6) return Math.round(n / 1000) + 'K';
    if (n < 1e9) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    return (n / 1e9).toFixed(1).replace(/\.0$/, '') + 'B';
  }

  function fmtDate(raw) {
    if (!raw) return '';
    const d = new Date(raw);
    if (isNaN(d.getTime())) return '';
    try {
      return new Intl.DateTimeFormat(state.lang === 'zh' ? 'zh-CN' : 'en-US', {
        year: 'numeric', month: 'short', day: 'numeric'
      }).format(d);
    } catch (e) {
      return d.toISOString().slice(0, 10);
    }
  }

  function hexToRgb(hex) {
    let h = String(hex).replace('#', '').trim();
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h, 16);
    return isNaN(n) ? { r: 255, g: 255, b: 255 } : { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  function luma(hex) {
    const { r, g, b } = hexToRgb(hex);
    const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  }

  /* A card palette that stays readable on an arbitrary background colour. */
  function cardPalette(hex) {
    if (luma(hex) > 0.42) {
      return {
        fg: '#0f1419', muted: '#5b6570',
        line: 'rgba(17,17,17,0.10)', edge: 'rgba(17,17,17,0.18)',
        quote: 'rgba(17,17,17,0.035)'
      };
    }
    return {
      fg: '#f2efe9', muted: 'rgba(242,239,233,0.60)',
      line: 'rgba(255,255,255,0.12)', edge: 'rgba(255,255,255,0.22)',
      quote: 'rgba(255,255,255,0.05)'
    };
  }

  /* ── toasts ───────────────────────────────────────────────────────────── */

  function toast(message, kind) {
    const el = document.createElement('div');
    el.className = 'toast toast--' + (kind || 'info');
    el.textContent = message;
    dom.toasts.appendChild(el);
    setTimeout(() => {
      el.classList.add('is-out');
      setTimeout(() => el.remove(), 220);
    }, 3600);
    while (dom.toasts.children.length > 3) dom.toasts.firstChild.remove();
  }

  /* ── i18n ─────────────────────────────────────────────────────────────── */

  function initLang() {
    const nav = (navigator.language || 'en').slice(0, 2).toLowerCase();
    state.lang = i18n[nav] ? nav : 'en';
    document.documentElement.lang = state.lang;

    const dict = i18n[state.lang];
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const v = dict[el.dataset.i18n];
      if (v != null) el.textContent = v;
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      const v = dict[el.dataset.i18nPlaceholder];
      if (v != null) el.placeholder = v;
    });
    document.title = dict.pageTitle || document.title;
  }

  /* ── url → api ────────────────────────────────────────────────────────── */

  function parseTweetUrl(raw) {
    if (!raw) return null;
    let s = String(raw).trim();
    if (!s) return null;
    if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
    let u;
    try { u = new URL(s); } catch (e) { return null; }

    const host = u.hostname.replace(/^(www\.|mobile\.|m\.)/i, '').toLowerCase();
    const known = ['x.com', 'twitter.com', 'fxtwitter.com', 'vxtwitter.com', 'fixupx.com', 'fixvx.com', 'twittpr.com'];
    if (known.indexOf(host) === -1 && !host.endsWith('.x.com') && !host.endsWith('.twitter.com')) return null;

    const m = u.pathname.match(/\/(?:([A-Za-z0-9_]{1,20})\/)?status(?:es)?\/(\d+)/);
    if (!m) return null;
    return { user: m[1] || 'i', id: m[2] };
  }

  async function fetchTweet(user, id) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    try {
      const res = await fetch(`${API}/${user}/status/${id}`, { signal: ctrl.signal, cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const json = await res.json();
      if (json.code !== 200 || !json.tweet) throw new Error(json.message || 'No tweet in response');
      return json.tweet;
    } finally {
      clearTimeout(timer);
    }
  }

  /* ── images ───────────────────────────────────────────────────────────── */

  function loadImage(img, src) {
    img.crossOrigin = 'anonymous';
    img.onerror = () => {
      if (img.dataset.fallback) return;
      img.dataset.fallback = '1';
      if (!proxyNotified) {
        proxyNotified = true;
        toast(t('toastProxy'), 'info');
      }
      img.removeAttribute('crossorigin');
      img.src = PROXY + encodeURIComponent(src);
    };
    img.src = src;
  }

  /*
   * html2canvas has no object-fit, so "cover" is expressed as an absolutely
   * positioned image with a hand-computed size and offset.
   */
  function coverCell(src, cw, ch, mr, mb, intrinsic) {
    const cell = document.createElement('div');
    cell.style.cssText =
      'position:relative;flex:0 0 auto;overflow:hidden;' +
      `width:${cw}px;height:${ch}px;` +
      `margin-right:${mr}px;margin-bottom:${mb}px;background:rgba(128,128,128,0.12)`;

    const img = document.createElement('img');
    img.alt = '';
    img.decoding = 'async';

    const iw = intrinsic && intrinsic.width ? intrinsic.width : 0;
    const ih = intrinsic && intrinsic.height ? intrinsic.height : 0;

    if (iw && ih) {
      const scale = Math.max(cw / iw, ch / ih);
      const w = Math.round(iw * scale);
      const h = Math.round(ih * scale);
      img.style.cssText =
        'position:absolute;max-width:none;max-height:none;display:block;' +
        `width:${w}px;height:${h}px;left:${Math.round((cw - w) / 2)}px;top:${Math.round((ch - h) / 2)}px`;
    } else {
      img.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;';
    }

    loadImage(img, src);
    cell.appendChild(img);
    return cell;
  }

  /* ── media ────────────────────────────────────────────────────────────── */

  function mediaItems(media) {
    if (!media) return [];
    const out = [];
    (media.photos || []).forEach((p) => {
      out.push({ src: p.url, width: p.width, height: p.height });
    });
    if (!out.length && media.videos && media.videos.length) {
      media.videos.forEach((v) => {
        if (v.thumbnail_url) out.push({ src: v.thumbnail_url, width: v.width, height: v.height });
      });
    }
    return out;
  }

  function renderMedia(media, wrap, opts) {
    wrap.innerHTML = '';
    const items = mediaItems(media);
    if (!items.length) return;

    const options = opts || {};
    const G = 3;

    // A hidden or not-yet-laid-out card measures 0 — retry instead of guessing.
    const W = Math.round(wrap.clientWidth);
    if (!W) {
      const tries = (wrap.__measureTries || 0) + 1;
      wrap.__measureTries = tries;
      if (tries <= 6) requestAnimationFrame(() => renderMedia(media, wrap, opts));
      return;
    }
    wrap.__measureTries = 0;

    if (options.quote) {
      const it = items[0];
      const ratio = it.width && it.height ? it.height / it.width : 0.56;
      const h = Math.max(60, Math.min(Math.round(W * ratio), 280));
      wrap.appendChild(coverCell(it.src, W, h, 0, 0, it));
      return;
    }

    if (state.layout === 'waterfall' || items.length === 1) {
      const list = state.layout === 'waterfall' ? items : items.slice(0, 1);
      list.forEach((it, i) => {
        const ratio = it.width && it.height ? it.height / it.width : 0.56;
        const cap = list.length === 1 ? 420 : 600;
        const h = Math.max(110, Math.min(Math.round(W * ratio), cap));
        wrap.appendChild(coverCell(it.src, W, h, 0, i === list.length - 1 ? 0 : 7, it));
      });
      return;
    }

    const n = Math.min(items.length, 4);
    const cells = [];

    if (n === 2) {
      const cw = Math.floor((W - G) / 2);
      const ch = Math.round(cw * 0.94);
      cells.push(coverCell(items[0].src, cw, ch, G, 0, items[0]));
      cells.push(coverCell(items[1].src, cw, ch, 0, 0, items[1]));
    } else if (n === 3) {
      const lw = Math.round((W - G) * 0.61);
      const rw = W - G - lw;
      const total = Math.round((W - G) * 0.56);
      const rh = Math.floor((total - G) / 2);
      cells.push(coverCell(items[0].src, lw, rh * 2 + G, G, 0, items[0]));
      cells.push(coverCell(items[1].src, rw, rh, 0, G, items[1]));
      cells.push(coverCell(items[2].src, rw, rh, 0, 0, items[2]));
    } else {
      const cw = Math.floor((W - G) / 2);
      const ch = Math.round(cw * 0.82);
      for (let i = 0; i < 4; i++) {
        cells.push(coverCell(items[i].src, cw, ch, i % 2 === 1 ? 0 : G, i < 2 ? G : 0, items[i]));
      }
    }

    cells.forEach((c) => wrap.appendChild(c));
  }

  /* ── card ─────────────────────────────────────────────────────────────── */

  const CARD_VARS = ['--c-bg', '--c-fg', '--c-muted', '--c-line', '--c-edge', '--c-quote'];

  function applyCardStyle(cardEl) {
    cardEl.className = 'card';
    CARD_VARS.forEach((p) => cardEl.style.removeProperty(p));

    const mode = state.card.mode;
    if (mode === 'custom') {
      const pal = cardPalette(state.card.color);
      cardEl.style.setProperty('--c-bg', state.card.color);
      cardEl.style.setProperty('--c-fg', pal.fg);
      cardEl.style.setProperty('--c-muted', pal.muted);
      cardEl.style.setProperty('--c-line', pal.line);
      cardEl.style.setProperty('--c-edge', pal.edge);
      cardEl.style.setProperty('--c-quote', pal.quote);
    } else if (mode === 'cream' || mode === 'ink') {
      cardEl.classList.add('card--' + mode);
    }
  }

  function buildCard(tweet) {
    let core = tweet;
    let reposter = null;
    if (tweet.retweeted_status) {
      core = tweet.retweeted_status;
      reposter = tweet.author;
    } else if (tweet.reposted_by) {
      reposter = tweet.reposted_by;
    }

    const frag = document.importNode($('#tpl-card').content, true);
    const card = frag.querySelector('.card');
    const author = core.author || {};

    const ctx = card.querySelector('.card__context');
    if (reposter && reposter.name) {
      ctx.hidden = false;
      ctx.innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
        'stroke-linecap="round" stroke-linejoin="round"><path d="m17 1 4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/>' +
        '<path d="m7 23-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>';
      ctx.appendChild(document.createTextNode(t('retweetedBy') + ' ' + reposter.name));
    }

    card.querySelector('.card__name').textContent = author.name || '—';

    const verified = (author.verification && author.verification.verified) || author.verified;
    if (verified) card.querySelector('.card__badge').hidden = false;

    const date = fmtDate(core.created_at);
    card.querySelector('.card__handle').textContent =
      '@' + (author.screen_name || 'unknown') + (date ? ' · ' + date : '');

    if (author.avatar_url) loadImage(card.querySelector('.card__avatar'), author.avatar_url);

    card.querySelector('.card__text').textContent = core.text || '';

    if (core.quote) {
      const q = core.quote;
      const qa = q.author || {};
      card.querySelector('.card__quote').hidden = false;
      card.querySelector('.card__quote-name').textContent = qa.name || '—';
      card.querySelector('.card__quote-handle').textContent = '@' + (qa.screen_name || '');
      card.querySelector('.card__quote-text').textContent = q.text || '';
      if (qa.avatar_url) loadImage(card.querySelector('.card__quote-avatar'), qa.avatar_url);
    }

    card.querySelector('.stat-replies').textContent = fmtCount(core.replies) || '0';
    card.querySelector('.stat-retweets').textContent = fmtCount(core.retweets) || '0';
    card.querySelector('.stat-likes').textContent = fmtCount(core.likes) || '0';
    const views = card.querySelector('.card__stats .stat:last-child');
    const v = fmtCount(core.views);
    if (v == null) views.remove();
    else card.querySelector('.stat-views').textContent = v;

    applyCardStyle(card);
    return { card, core };
  }

  function parentGap(user, id) {
    const gap = document.createElement('div');
    gap.className = 'thread-gap';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'parent-btn';
    btn.dataset.user = user;
    btn.dataset.id = id;
    btn.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" ' +
      'stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></svg>';
    btn.appendChild(document.createTextNode(t('showParentTweet')));

    gap.appendChild(btn);
    return gap;
  }

  function renderCardMedia(card) {
    if (card.__media !== undefined) renderMedia(card.__media, card.querySelector('.card__media'));
    if (card.__quoteMedia) {
      renderMedia(card.__quoteMedia, card.querySelector('.card__quote-media'), { quote: true });
    }
  }

  function refreshAllMedia() {
    dom.capture.querySelectorAll('.card').forEach(renderCardMedia);
  }

  function mountTweet(tweet, before) {
    const { card, core } = buildCard(tweet);
    const nodes = [];

    if (core.replying_to && core.replying_to_status) {
      nodes.push(parentGap(core.replying_to, core.replying_to_status));
    }
    nodes.push(card);

    nodes.forEach((n) => dom.capture.insertBefore(n, before || null));

    card.__media = core.media;
    card.__quoteMedia = core.quote ? core.quote.media : null;
    renderCardMedia(card);

    return { card, core };
  }

  function clearCapture() {
    dom.capture.innerHTML = '';
    watermarkEl = null;
    state.root = null;
  }

  /* ── background ───────────────────────────────────────────────────────── */

  function applyBackground() {
    const p = BG_PRESETS[state.bg.preset];
    const [a, b] = state.bg.colors;
    const cs = dom.capture.style;

    if (p && p.tile) {
      cs.backgroundImage = tileUrl(p.tile.w, p.tile.h, p.tile.svg);
      cs.backgroundSize = p.tile.w + 'px ' + p.tile.h + 'px';
      cs.backgroundColor = p.bg;
    } else {
      // Hard two-colour split, not a soft blend — a printed colour block.
      cs.backgroundImage = `linear-gradient(115deg, ${a} 0, ${a} 62%, ${b} 62%, ${b} 100%)`;
      cs.backgroundSize = 'auto';
      cs.backgroundColor = '';
    }
    cs.backgroundRepeat = 'repeat';

    const wmBase = p && p.wm ? p.wm : (luma(a) > 0.42 ? 'rgba(17,17,17,0.42)' : 'rgba(255,255,255,0.5)');
    cs.setProperty('--wm', wmBase);
  }

  function swatchFor(preset, i) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'swatch';
    b.title = preset.name;
    b.dataset.index = i;

    if (preset.tile) {
      b.style.backgroundImage = tileUrl(preset.tile.w, preset.tile.h, preset.tile.svg);
      b.style.backgroundSize = preset.tile.w + 'px ' + preset.tile.h + 'px';
      b.style.backgroundColor = preset.bg;
    } else {
      b.style.background = preset.bg;
    }

    b.addEventListener('click', () => selectBg(i));
    return b;
  }

  function selectBg(i) {
    state.bg.preset = i;
    const p = BG_PRESETS[i];
    state.bg.colors = [p.bg, p.bg];
    dom.bgColor1.value = p.bg;
    dom.bgColor2.value = p.bg;
    dom.customBg.hidden = true;
    applyBackground();
    markSwatch(dom.bgSwatches, (s) => s.dataset.index === String(i));
  }

  function markSwatch(container, predicate) {
    container.querySelectorAll('.swatch').forEach((s) => s.classList.toggle('is-active', predicate(s)));
  }

  function buildSwatches() {
    dom.bgSwatches.innerHTML = '';
    BG_PRESETS.forEach((p, i) => dom.bgSwatches.appendChild(swatchFor(p, i)));

    const custom = document.createElement('button');
    custom.type = 'button';
    custom.className = 'swatch swatch--custom';
    custom.title = '自定义';
    custom.dataset.index = 'custom';
    custom.textContent = '+';
    custom.addEventListener('click', () => {
      state.bg.preset = -1;
      dom.customBg.hidden = false;
      markSwatch(dom.bgSwatches, (s) => s.dataset.index === 'custom');
      applyBackground();
    });
    dom.bgSwatches.appendChild(custom);

    dom.cardSwatches.innerHTML = '';
    CARD_PRESETS.forEach((p) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'swatch';
      b.title = p.id;
      b.dataset.mode = p.mode;
      b.style.background = p.preview;
      b.addEventListener('click', () => selectCard(p.mode, p.preview));
      dom.cardSwatches.appendChild(b);
    });

    const cc = document.createElement('button');
    cc.type = 'button';
    cc.className = 'swatch swatch--custom';
    cc.title = '自定义';
    cc.dataset.mode = 'custom';
    cc.textContent = '+';
    cc.addEventListener('click', () => selectCard('custom', dom.cardColor.value));
    dom.cardSwatches.appendChild(cc);
  }

  function selectCard(mode, color) {
    state.card.mode = mode;
    state.card.color = color || state.card.color;
    dom.customCard.hidden = mode !== 'custom';
    if (mode === 'custom') {
      dom.cardColor.value = state.card.color;
      markSwatch(dom.cardSwatches, (s) => s.dataset.mode === 'custom');
    } else {
      markSwatch(dom.cardSwatches, (s) => s.dataset.mode === mode);
    }
    dom.capture.querySelectorAll('.card').forEach(applyCardStyle);
  }

  /* Radio-style spec list: the trailing <b> shows ● or ○. */
  function initSpec(el, onChange) {
    const buttons = Array.from(el.querySelectorAll('button'));

    function sync(value) {
      buttons.forEach((b) => {
        const on = b.dataset.value === String(value);
        b.setAttribute('aria-pressed', String(on));
        const mark = b.querySelector('b');
        if (mark) mark.textContent = on ? '●' : '○';
      });
    }

    buttons.forEach((b) => {
      b.addEventListener('click', () => {
        sync(b.dataset.value);
        if (onChange) onChange(b.dataset.value);
      });
    });

    return sync;
  }

  /* ── export ───────────────────────────────────────────────────────────── */

  function ensureWatermark() {
    if (!watermarkEl) {
      watermarkEl = document.createElement('div');
      watermarkEl.className = 'capture__watermark';
      watermarkEl.textContent = 'XSnap';
      dom.capture.appendChild(watermarkEl);
    }
    watermarkEl.hidden = !state.watermark;
    return watermarkEl;
  }

  async function renderCanvas() {
    if (!dom.capture.querySelector('.card')) {
      toast(t('toastNoData'), 'error');
      return null;
    }
    if (typeof html2canvas !== 'function') {
      toast('Renderer failed to load.', 'error');
      return null;
    }

    ensureWatermark();
    dom.capture.classList.add('is-capturing');
    dom.capture.classList.toggle('is-hide-stats', !state.stats);

    try {
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
      await nextFrame();
      await nextFrame();

      return await html2canvas(dom.capture, {
        scale: state.quality,
        useCORS: true,
        allowTaint: false,
        backgroundColor: null,
        logging: false,
        imageTimeout: 20000
      });
    } catch (err) {
      console.error(err);
      toast('Render failed — ' + err.message, 'error');
      return null;
    } finally {
      dom.capture.classList.remove('is-capturing');
      dom.capture.classList.remove('is-hide-stats');
      if (watermarkEl) watermarkEl.hidden = !state.watermark;
      refreshAllMedia();
    }
  }

  function downloadName() {
    const a = state.root && state.root.author ? state.root.author.screen_name : 'post';
    const id = state.root ? state.root.id : Date.now();
    return `XSnap-${a}-${id}.png`;
  }

  const canvasToBlob = (c) => new Promise((r) => c.toBlob(r, 'image/png'));

  async function download() {
    dom.downloadBtn.disabled = true;
    try {
      const canvas = await renderCanvas();
      if (!canvas) return;
      const blob = await canvasToBlob(canvas);
      if (!blob) { toast('Could not encode image.', 'error'); return; }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = downloadName();
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      toast(t('toastDownload'), 'success');
    } finally {
      dom.downloadBtn.disabled = false;
    }
  }

  async function copyImage() {
    if (!navigator.clipboard || !window.ClipboardItem) {
      toast(t('toastCopyFail'), 'error');
      return;
    }
    dom.copyBtn.disabled = true;
    try {
      const canvas = await renderCanvas();
      if (!canvas) return;
      const blob = await canvasToBlob(canvas);
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      toast(t('toastCopied'), 'success');
    } catch (err) {
      console.error(err);
      toast(t('toastCopyFail'), 'error');
    } finally {
      dom.copyBtn.disabled = false;
    }
  }

  /* ── flow ─────────────────────────────────────────────────────────────── */

  function showPlate(tweet, core) {
    dom.empty.hidden = true;
    dom.plate.hidden = false;

    const handle = core.author && core.author.screen_name ? '@' + core.author.screen_name : '';
    const date = fmtDate(core.created_at);
    dom.caption.textContent = [handle, date].filter(Boolean).join(' · ');
  }

  async function generate(input) {
    const parsed = parseTweetUrl(input);
    if (!parsed) {
      toast(t('toastInvalidLink'), 'error');
      return;
    }

    dom.composer.classList.add('is-busy');
    dom.fetchBtn.disabled = true;
    toast(t('toastFetch'), 'info');

    try {
      const tweet = await fetchTweet(parsed.user, parsed.id);

      clearCapture();
      dom.plate.hidden = false;
      dom.empty.hidden = true;

      const { core } = mountTweet(tweet);
      state.root = tweet;
      ensureWatermark();
      showPlate(tweet, core);

      toast(t('toastSuccess'), 'success');
    } catch (err) {
      console.error(err);
      toast(t('toastFailure') + (err.message || err), 'error');
      if (!dom.capture.querySelector('.card')) {
        dom.plate.hidden = true;
        dom.empty.hidden = false;
      }
    } finally {
      dom.composer.classList.remove('is-busy');
      dom.fetchBtn.disabled = false;
    }
  }

  async function loadParent(btn) {
    if (!btn.dataset.user || !btn.dataset.id) return;

    btn.disabled = true;
    const label = btn.textContent;
    btn.textContent = t('loadingParent');

    try {
      const tweet = await fetchTweet(btn.dataset.user, btn.dataset.id);
      const gap = btn.closest('.thread-gap');
      mountTweet(tweet, gap || btn.closest('.card'));
      if (gap) gap.remove();
      refreshAllMedia();
    } catch (err) {
      console.error(err);
      toast(t('toastParentFail'), 'error');
      btn.disabled = false;
      btn.textContent = label;
    }
  }

  /* ── wiring ───────────────────────────────────────────────────────────── */

  function bind() {
    dom.composer.addEventListener('submit', (e) => {
      e.preventDefault();
      generate(dom.urlInput.value);
    });

    dom.exampleBtn.addEventListener('click', () => {
      dom.urlInput.value = EXAMPLE;
      generate(EXAMPLE);
    });

    dom.shuffleBg.addEventListener('click', () => {
      let i = Math.floor(Math.random() * BG_PRESETS.length);
      if (i === state.bg.preset) i = (i + 1) % BG_PRESETS.length;
      selectBg(i);
    });

    dom.bgColor1.addEventListener('input', () => {
      state.bg.preset = -1;
      state.bg.colors[0] = dom.bgColor1.value;
      dom.customBg.hidden = false;
      markSwatch(dom.bgSwatches, (s) => s.dataset.index === 'custom');
      applyBackground();
    });
    dom.bgColor2.addEventListener('input', () => {
      state.bg.preset = -1;
      state.bg.colors[1] = dom.bgColor2.value;
      dom.customBg.hidden = false;
      markSwatch(dom.bgSwatches, (s) => s.dataset.index === 'custom');
      applyBackground();
    });

    dom.cardColor.addEventListener('input', () => {
      state.card.mode = 'custom';
      state.card.color = dom.cardColor.value;
      dom.customCard.hidden = false;
      markSwatch(dom.cardSwatches, (s) => s.dataset.mode === 'custom');
      dom.capture.querySelectorAll('.card').forEach(applyCardStyle);
    });

    dom.layoutSync = initSpec(dom.layoutSeg, (v) => {
      state.layout = v;
      refreshAllMedia();
    });
    dom.qualitySync = initSpec(dom.qualitySeg, (v) => {
      state.quality = Number(v);
    });
    dom.layoutSync(state.layout);
    dom.qualitySync(state.quality);

    dom.optStats.addEventListener('change', () => {
      state.stats = dom.optStats.checked;
      dom.capture.classList.toggle('is-hide-stats', !state.stats);
    });

    dom.optWatermark.addEventListener('change', () => {
      state.watermark = dom.optWatermark.checked;
      if (watermarkEl) watermarkEl.hidden = !state.watermark;
    });

    dom.downloadBtn.addEventListener('click', download);
    dom.copyBtn.addEventListener('click', copyImage);

    dom.capture.addEventListener('click', (e) => {
      const btn = e.target.closest('.parent-btn');
      if (btn) loadParent(btn);
    });

    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (dom.capture.querySelector('.card')) download();
      }
    });

    let resizeTimer = null;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(refreshAllMedia, 180);
    });
  }

  function collect() {
    dom.composer = $('#composer');
    dom.urlInput = $('#tweet-url');
    dom.fetchBtn = $('#fetch-btn');
    dom.exampleBtn = $('#example-btn');
    dom.empty = $('#empty');
    dom.plate = $('#plate');
    dom.caption = $('#caption');
    dom.capture = $('#capture-area');
    dom.toasts = $('#toast-container');

    dom.bgSwatches = $('#bg-swatches');
    dom.cardSwatches = $('#card-swatches');
    dom.customBg = $('#custom-bg');
    dom.customCard = $('#custom-card');
    dom.bgColor1 = $('#bg-color-1');
    dom.bgColor2 = $('#bg-color-2');
    dom.cardColor = $('#card-color-custom');
    dom.shuffleBg = $('#shuffle-bg');

    dom.layoutSeg = $('#layout-seg');
    dom.qualitySeg = $('#quality-seg');

    dom.optStats = $('#opt-stats');
    dom.optWatermark = $('#opt-watermark');
    dom.downloadBtn = $('#download-btn');
    dom.copyBtn = $('#copy-btn');
  }

  function boot() {
    collect();
    initLang();
    buildSwatches();
    selectBg(0);
    selectCard('light', '#ffffff');

    bind();
    ensureWatermark();

    window.XSnap = {
      generate,
      download,
      copyImage,
      refresh: refreshAllMedia,
      mount: mountTweet,
      state
    };

    const deep = new URLSearchParams(location.search).get('url');
    if (deep) {
      dom.urlInput.value = deep;
      generate(deep);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
