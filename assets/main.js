/* ==========================================================================
   XSnap
   Static, no build step. Data from FxEmbed, pixels from html2canvas-pro.

   Two rendering rules that matter, because the export is the product:
   · html2canvas ignores `gap` on flex containers → spacing is done with margins
   · html2canvas ignores `object-fit`             → images are cropped by hand
   ========================================================================== */
'use strict';

(function () {
  const API = 'https://api.fxtwitter.com';
  const PROXY = 'https://api.allorigins.win/raw?url=';
  const EXAMPLE = 'https://x.com/elonmusk/status/1949938925163962634';
  const THEME_KEY = 'xsnap.theme';

  const BG_PRESETS = [
    { id: 'ocean',    colors: ['#89f7fe', '#66a6ff'] },
    { id: 'sunset',   colors: ['#ffecd2', '#fcb69f'] },
    { id: 'amethyst', colors: ['#8e2de2', '#4a00e0'] },
    { id: 'mint',     colors: ['#d4fc79', '#96e6a1'] },
    { id: 'lush',     colors: ['#a8e063', '#56ab2f'] },
    { id: 'citrus',   colors: ['#f6d365', '#fda085'] },
    { id: 'dusk',     colors: ['#4b6cb7', '#182848'] },
    { id: 'graphite', colors: ['#434343', '#000000'] }
  ];

  const CARD_PRESETS = [
    { id: 'light', mode: 'light', preview: '#ffffff' },
    { id: 'dim',   mode: 'dim',   preview: '#15202b' },
    { id: 'dark',  mode: 'dark',  preview: '#000000' }
  ];

  const state = {
    lang: 'en',
    bg: { colors: BG_PRESETS[0].colors.slice() },
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

  /* ── tiny helpers ─────────────────────────────────────────────────────── */

  const $ = (sel, root) => (root || document).querySelector(sel);
  const t = (key) => (i18n[state.lang] && i18n[state.lang][key]) || i18n.en[key] || key;
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
    if (isNaN(n)) return { r: 255, g: 255, b: 255 };
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  /* Returns a full card palette that stays readable on an arbitrary bg. */
  function cardPalette(hex) {
    const { r, g, b } = hexToRgb(hex);
    const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    const luma = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    if (luma > 0.42) {
      return {
        fg: '#0f1419', muted: '#536471',
        line: 'rgba(15, 20, 25, 0.10)', quote: 'rgba(15, 20, 25, 0.035)'
      };
    }
    return {
      fg: '#f2f4f6', muted: 'rgba(242, 244, 246, 0.62)',
      line: 'rgba(255, 255, 255, 0.14)', quote: 'rgba(255, 255, 255, 0.06)'
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
      setTimeout(() => el.remove(), 260);
    }, 3600);
    while (dom.toasts.children.length > 3) dom.toasts.firstChild.remove();
  }

  /* ── theme ────────────────────────────────────────────────────────────── */

  function initTheme() {
    let saved = null;
    try { saved = localStorage.getItem(THEME_KEY); } catch (e) { /* private mode */ }
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');
    document.documentElement.dataset.theme = saved || (prefersDark.matches ? 'dark' : 'light');

    if (!saved) {
      prefersDark.addEventListener('change', (e) => {
        document.documentElement.dataset.theme = e.matches ? 'dark' : 'light';
      });
    }

    dom.themeToggle.addEventListener('click', () => {
      const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* ignore */ }
    });
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
   * html2canvas has no object-fit, so a "cover" crop is expressed as an
   * absolutely positioned image with hand-computed size and offset.
   */
  function coverCell(src, cw, ch, radius, mr, mb, intrinsic) {
    const cell = document.createElement('div');
    cell.style.cssText =
      'position:relative;flex:0 0 auto;overflow:hidden;' +
      `width:${cw}px;height:${ch}px;border-radius:${radius}px;` +
      `margin-right:${mr}px;margin-bottom:${mb}px;background:rgba(128,128,128,0.14)`;

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

  /* ── media layout ─────────────────────────────────────────────────────── */

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
    const G = 4;

    // A hidden (or not-yet-laid-out) card measures 0. Retry once it has a width
    // instead of guessing, otherwise the grid ends up narrower than the card.
    const W = Math.round(wrap.clientWidth);
    if (!W) {
      const tries = (wrap.__measureTries || 0) + 1;
      wrap.__measureTries = tries;
      if (tries <= 6) requestAnimationFrame(() => renderMedia(media, wrap, opts));
      return;
    }
    wrap.__measureTries = 0;

    // Quoted posts always get one full-width image.
    if (options.quote) {
      const it = items[0];
      const ratio = it.width && it.height ? it.height / it.width : 0.56;
      const h = Math.max(70, Math.min(Math.round(W * ratio), 300));
      wrap.appendChild(coverCell(it.src, W, h, 12, 0, 0, it));
      return;
    }

    if (state.layout === 'waterfall' || items.length === 1) {
      const list = state.layout === 'waterfall' ? items : items.slice(0, 1);
      list.forEach((it, i) => {
        const ratio = it.width && it.height ? it.height / it.width : 0.56;
        const cap = list.length === 1 ? 430 : 620;
        const h = Math.max(120, Math.min(Math.round(W * ratio), cap));
        wrap.appendChild(coverCell(it.src, W, h, 14, 0, i === list.length - 1 ? 0 : 8, it));
      });
      return;
    }

    const n = Math.min(items.length, 4);
    const cells = [];

    if (n === 2) {
      const cw = Math.floor((W - G) / 2);
      const ch = Math.round(cw * 0.94);
      cells.push(coverCell(items[0].src, cw, ch, 14, G, 0, items[0]));
      cells.push(coverCell(items[1].src, cw, ch, 14, 0, 0, items[1]));
    } else if (n === 3) {
      const lw = Math.round((W - G) * 0.61);
      const rw = W - G - lw;
      const total = Math.round((W - G) * 0.56);
      const rh = Math.floor((total - G) / 2);
      cells.push(coverCell(items[0].src, lw, rh * 2 + G, 14, G, 0, items[0]));
      cells.push(coverCell(items[1].src, rw, rh, 14, 0, G, items[1]));
      cells.push(coverCell(items[2].src, rw, rh, 14, 0, 0, items[2]));
    } else {
      const cw = Math.floor((W - G) / 2);
      const ch = Math.round(cw * 0.82);
      for (let i = 0; i < 4; i++) {
        const rightCol = i % 2 === 1;
        cells.push(coverCell(items[i].src, cw, ch, 14, rightCol ? 0 : G, i < 2 ? G : 0, items[i]));
      }
    }

    cells.forEach((c) => wrap.appendChild(c));
  }

  /* ── card ─────────────────────────────────────────────────────────────── */

  function applyCardStyle(cardEl) {
    cardEl.className = 'card';
    ['--c-bg', '--c-fg', '--c-muted', '--c-line', '--c-quote'].forEach((p) => cardEl.style.removeProperty(p));

    const mode = state.card.mode;
    if (mode === 'custom') {
      const pal = cardPalette(state.card.color);
      cardEl.style.setProperty('--c-bg', state.card.color);
      cardEl.style.setProperty('--c-fg', pal.fg);
      cardEl.style.setProperty('--c-muted', pal.muted);
      cardEl.style.setProperty('--c-line', pal.line);
      cardEl.style.setProperty('--c-quote', pal.quote);
    } else if (mode !== 'light') {
      cardEl.classList.add('card--' + mode);
    }
  }

  function buildCard(tweet) {
    let core = tweet;
    let reposter = null;
    if (tweet.retweeted_status) {           // legacy shape
      core = tweet.retweeted_status;
      reposter = tweet.author;
    } else if (tweet.reposted_by) {         // current shape
      reposter = tweet.reposted_by;
    }

    const frag = document.importNode($('#tpl-card').content, true);
    const card = frag.querySelector('.card');
    const author = core.author || {};

    // "Reposted by …"
    const ctx = card.querySelector('.card__context');
    if (reposter && reposter.name) {
      ctx.hidden = false;
      ctx.innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
        'stroke-linecap="round" stroke-linejoin="round"><path d="m17 1 4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/>' +
        '<path d="m7 23-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>';
      ctx.appendChild(document.createTextNode(t('retweetedBy') + ' ' + reposter.name));
    }

    // identity
    card.querySelector('.card__name').textContent = author.name || '—';

    const verified = (author.verification && author.verification.verified) || author.verified;
    if (verified) card.querySelector('.card__badge').hidden = false;

    const date = fmtDate(core.created_at);
    card.querySelector('.card__handle').textContent =
      '@' + (author.screen_name || 'unknown') + (date ? ' · ' + date : '');

    if (author.avatar_url) loadImage(card.querySelector('.card__avatar'), author.avatar_url);

    // body
    card.querySelector('.card__text').textContent = core.text || '';

    // quote
    if (core.quote) {
      const q = core.quote;
      const qa = q.author || {};
      card.querySelector('.card__quote').hidden = false;
      card.querySelector('.card__quote-name').textContent = qa.name || '—';
      card.querySelector('.card__quote-handle').textContent = '@' + (qa.screen_name || '');
      card.querySelector('.card__quote-text').textContent = q.text || '';
      if (qa.avatar_url) loadImage(card.querySelector('.card__quote-avatar'), qa.avatar_url);
    }

    // stats
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

  function parentGap(parentUser, parentId) {
    const gap = document.createElement('div');
    gap.className = 'thread-gap';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'parent-btn';
    btn.dataset.user = parentUser;
    btn.dataset.id = parentId;
    btn.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></svg>';
    btn.appendChild(document.createTextNode(t('showParentTweet')));

    gap.appendChild(btn);
    return gap;
  }

  /* Mounts a tweet (and its "show parent" affordance) into the capture area. */
  function mountTweet(tweet, before) {
    const { card, core } = buildCard(tweet);
    const capture = dom.capture;
    const nodes = [];

    if (core.replying_to && core.replying_to_status) {
      nodes.push(parentGap(core.replying_to, core.replying_to_status));
    }
    nodes.push(card);

    const anchor = before || null;
    nodes.forEach((n) => capture.insertBefore(n, anchor));

    // Media is sized in px, so it can only be measured once the card is laid out.
    card.__media = core.media;
    card.__quoteMedia = core.quote ? core.quote.media : null;
    renderCardMedia(card);

    return { card, core, nodes };
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

  function clearCapture() {
    dom.capture.innerHTML = '';
    watermarkEl = null;
    state.root = null;
  }

  /* ── export ───────────────────────────────────────────────────────────── */

  function ensureWatermark() {
    if (!watermarkEl) {
      watermarkEl = document.createElement('div');
      watermarkEl.className = 'capture__watermark';
      watermarkEl.innerHTML =
        '<svg viewBox="0 0 32 32" fill="none">' +
        '<rect width="32" height="32" rx="9.5" fill="#fff"/>' +
        '<path d="M11.2 11.2 20.8 20.8M20.8 11.2 11.2 20.8" stroke="#0a0a0c" stroke-width="3" stroke-linecap="round"/>' +
        '</svg><span>XSnap</span>';
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

      const canvas = await html2canvas(dom.capture, {
        scale: state.quality,
        useCORS: true,
        allowTaint: false,
        backgroundColor: null,
        logging: false,
        imageTimeout: 20000
      });
      return canvas;
    } catch (err) {
      console.error(err);
      toast('Render failed — ' + err.message, 'error');
      return null;
    } finally {
      dom.capture.classList.remove('is-capturing');
      dom.capture.classList.remove('is-hide-stats');
      if (watermarkEl) watermarkEl.hidden = true;
      refreshAllMedia();
    }
  }

  function downloadName() {
    const a = state.root && state.root.author ? state.root.author.screen_name : 'post';
    const id = state.root ? state.root.id : Date.now();
    return `XSnap-${a}-${id}.png`;
  }

  function canvasToBlob(canvas) {
    return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
  }

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

  /* ── background & card controls ───────────────────────────────────────── */

  function applyBackground() {
    dom.capture.style.backgroundImage =
      `linear-gradient(135deg, ${state.bg.colors[0]}, ${state.bg.colors[1]})`;
  }

  function buildSwatches() {
    dom.bgSwatches.innerHTML = '';
    BG_PRESETS.forEach((p, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'swatch';
      b.title = p.id;
      b.dataset.index = i;
      b.style.background = `linear-gradient(135deg, ${p.colors[0]}, ${p.colors[1]})`;
      b.addEventListener('click', () => selectBgPreset(i));
      dom.bgSwatches.appendChild(b);
    });

    const custom = document.createElement('button');
    custom.type = 'button';
    custom.className = 'swatch swatch--custom';
    custom.title = 'Custom';
    custom.dataset.index = 'custom';
    custom.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">' +
      '<path d="M12 5v14M5 12h14"/></svg>';
    custom.addEventListener('click', () => selectBgCustom());
    dom.bgSwatches.appendChild(custom);

    dom.cardSwatches.innerHTML = '';
    CARD_PRESETS.forEach((p) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'swatch';
      b.title = p.id;
      b.dataset.mode = p.mode;
      b.style.background = p.preview;
      b.addEventListener('click', () => selectCardPreset(p.mode, p.preview));
      dom.cardSwatches.appendChild(b);
    });

    const cc = document.createElement('button');
    cc.type = 'button';
    cc.className = 'swatch swatch--custom';
    cc.title = 'Custom';
    cc.dataset.mode = 'custom';
    cc.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">' +
      '<path d="M12 5v14M5 12h14"/></svg>';
    cc.addEventListener('click', () => selectCardPreset('custom', dom.cardColor.value));
    dom.cardSwatches.appendChild(cc);
  }

  function markSwatch(container, predicate) {
    container.querySelectorAll('.swatch').forEach((s) => s.classList.toggle('is-active', predicate(s)));
  }

  function selectBgPreset(i) {
    state.bg.colors = BG_PRESETS[i].colors.slice();
    dom.bgColor1.value = state.bg.colors[0];
    dom.bgColor2.value = state.bg.colors[1];
    dom.customBg.hidden = true;
    applyBackground();
    markSwatch(dom.bgSwatches, (s) => s.dataset.index === String(i));
  }

  function selectBgCustom() {
    state.bg.colors = [dom.bgColor1.value, dom.bgColor2.value];
    dom.customBg.hidden = false;
    applyBackground();
    markSwatch(dom.bgSwatches, (s) => s.dataset.index === 'custom');
  }

  function selectCardPreset(mode, color) {
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

  function initSegmented(el, onPick) {
    const buttons = Array.from(el.querySelectorAll('button'));
    el.dataset.count = String(buttons.length);

    const sync = (value) => {
      const i = buttons.findIndex((b) => b.dataset.value === String(value));
      el.dataset.active = String(Math.max(0, i));
      buttons.forEach((b) => b.setAttribute('aria-checked', String(b.dataset.value === String(value))));
    };

    buttons.forEach((b) => {
      b.addEventListener('click', () => {
        sync(b.dataset.value);
        onPick(b.dataset.value);
      });
    });
    return sync;
  }

  /* ── flow ─────────────────────────────────────────────────────────────── */

  function showEditor() {
    dom.landing.hidden = true;
    dom.editor.hidden = false;
    dom.backBtn.hidden = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function showLanding() {
    dom.editor.hidden = true;
    dom.landing.hidden = false;
    dom.backBtn.hidden = true;
    if (watermarkEl) watermarkEl.remove();
    watermarkEl = null;
    clearCapture();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    dom.urlInput.focus();
  }

  async function generate(input, opts) {
    const parsed = parseTweetUrl(input);
    if (!parsed) {
      toast(t('toastInvalidLink'), 'error');
      return;
    }

    const quiet = opts && opts.quiet;
    if (!dom.editor.hidden || dom.capture.querySelector('.card')) clearCapture();
    dom.composer.classList.add('is-busy');
    dom.fetchBtn.disabled = true;
    if (!quiet) toast(t('toastFetch'), 'info');

    try {
      const tweet = await fetchTweet(parsed.user, parsed.id);

      // The card is measured with clientWidth, so it has to be visible first.
      dom.editor.hidden = false;
      mountTweet(tweet);
      state.root = tweet;

      if (!quiet) showEditor();
      toast(t('toastSuccess'), 'success');
    } catch (err) {
      console.error(err);
      toast(t('toastFailure') + (err.message || err), 'error');
      if (!dom.capture.querySelector('.card')) dom.editor.hidden = true;
    } finally {
      dom.composer.classList.remove('is-busy');
      dom.fetchBtn.disabled = false;
    }
  }

  async function loadParent(btn) {
    const user = btn.dataset.user;
    const id = btn.dataset.id;
    if (!user || !id) return;

    btn.disabled = true;
    const label = btn.textContent;
    btn.textContent = t('loadingParent');

    try {
      const tweet = await fetchTweet(user, id);
      const gap = btn.closest('.thread-gap');
      const anchor = gap || btn.closest('.card');
      mountTweet(tweet, anchor);
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
    // landing form
    dom.composer.addEventListener('submit', (e) => {
      e.preventDefault();
      generate(dom.urlInput.value);
    });

    dom.exampleBtn.addEventListener('click', () => {
      dom.urlInput.value = EXAMPLE;
      generate(EXAMPLE);
    });

    dom.backBtn.addEventListener('click', showLanding);

    // panel
    dom.shuffleBg.addEventListener('click', () => {
      let i = Math.floor(Math.random() * BG_PRESETS.length);
      const active = dom.bgSwatches.querySelector('.swatch.is-active');
      if (active && active.dataset.index === String(i)) i = (i + 1) % BG_PRESETS.length;
      selectBgPreset(i);
    });

    dom.bgColor1.addEventListener('input', () => {
      state.bg.colors[0] = dom.bgColor1.value;
      dom.customBg.hidden = false;
      markSwatch(dom.bgSwatches, (s) => s.dataset.index === 'custom');
      applyBackground();
    });
    dom.bgColor2.addEventListener('input', () => {
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

    // parent chain (delegated: cards come and go)
    dom.capture.addEventListener('click', (e) => {
      const btn = e.target.closest('.parent-btn');
      if (btn) loadParent(btn);
    });

    // shortcuts
    document.addEventListener('keydown', (e) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === 's' && !dom.editor.hidden) {
        e.preventDefault();
        download();
      }
      if (e.key === 'Escape' && !dom.editor.hidden) showLanding();
    });

    // sticky topbar border
    const onScroll = () => dom.topbar.classList.toggle('is-stuck', window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    // media cells are sized in px, so re-measure on resize
    let resizeTimer = null;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (!dom.editor.hidden) refreshAllMedia();
      }, 180);
    });
  }

  function collect() {
    dom.landing = $('#landing');
    dom.editor = $('#editor');
    dom.composer = $('#composer');
    dom.urlInput = $('#tweet-url');
    dom.fetchBtn = $('#fetch-btn');
    dom.exampleBtn = $('#example-btn');
    dom.backBtn = $('#back-btn');
    dom.themeToggle = $('#theme-toggle');
    dom.topbar = $('.topbar');
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
    initTheme();
    buildSwatches();
    selectBgPreset(0);
    selectCardPreset('light', '#ffffff');
    dom.layoutSync = initSegmented(dom.layoutSeg, (v) => { state.layout = v; refreshAllMedia(); });
    dom.qualitySync = initSegmented(dom.qualitySeg, (v) => { state.quality = Number(v); });
    dom.layoutSync('grid');
    dom.qualitySync('3');
    bind();
    ensureWatermark();

    // Small scripting hook — handy for embedding, and for driving the app in tests.
    window.XSnap = {
      generate,
      download,
      copyImage,
      refresh: refreshAllMedia,
      mount: mountTweet,
      state
    };

    // deep link: ?url=<link>
    const params = new URLSearchParams(location.search);
    const deep = params.get('url');
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
