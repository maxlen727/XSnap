document.addEventListener('DOMContentLoaded', () => {
    // --- 预设颜色定义 ---
    const PRESET_GRADIENTS = [
        { name: 'Ocean', colors: ['#89f7fe', '#66a6ff'] }, { name: 'Sunset', colors: ['#ffecd2', '#fcb69f'] },
        { name: 'Lush', colors: ['#a8e063', '#56ab2f'] }, { name: 'Amethyst', colors: ['#8e2de2', '#4a00e0'] },
        { name: 'Graphite', colors: ['#434343', '#000000'] }, { name: 'Custom', colors: [] }
    ];
    const PRESET_CARD_COLORS = [
        { name: 'White', color: '#ffffff', mode: 'light' }, { name: 'Ink', color: '#1f2937', mode: 'dark' },
        { name: 'Stone', color: '#f5f5f4', mode: 'light' }, { name: 'Custom', color: '', mode: 'custom' }
    ];

    // --- DOM 元素引用 ---
    const dom = {
        welcomeScreen: document.getElementById('welcome-screen'), editorScreen: document.getElementById('editor-screen'),
        tweetUrlInput: document.getElementById('tweet-url'), fetchBtn: document.getElementById('fetch-btn'),
        bgSwatches: document.getElementById('bg-swatches'), cardSwatches: document.getElementById('card-swatches'),
        customBgPicker: document.getElementById('custom-bg-picker'), customCardPicker: document.getElementById('custom-card-picker'),
        bgColor1: document.getElementById('bg-color-1'), bgColor2: document.getElementById('bg-color-2'),
        cardColorCustom: document.getElementById('card-color-custom'),
        downloadBtn: document.getElementById('download-btn'), toastContainer: document.getElementById('toast-container'),
        captureArea: document.getElementById('capture-area'),
        tweetCardTemplate: document.getElementById('tweet-card-template')
    };

    let initialTweetData = null;
    let currentLang = 'en';
    let proxyRetryNotified = false; // 全局标志位，用于控制通知只显示一次
    
    // --- 函数定义区 ---
    
    function init() {
        detectLanguage();
        translateUI();
        setInitialTheme();
        setupSwatches();
        attachEventListeners();
    }

    function detectLanguage() {
        const lang = navigator.language || navigator.userLanguage;
        currentLang = (typeof i18n !== 'undefined' && i18n[lang.slice(0, 2)]) ? lang.slice(0, 2) : 'en';
        document.documentElement.lang = currentLang;
    }

    function translateUI() {
        if (typeof i18n === 'undefined') return;
        const translations = i18n[currentLang];
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.dataset.i18n;
            if(translations[key]) el.textContent = translations[key];
        });
        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            const key = el.dataset.i18nPlaceholder;
            if(translations[key]) el.placeholder = translations[key];
        });
        document.querySelectorAll('[data-i18n-html]').forEach(el => {
            const key = el.dataset.i18nHtml;
            if(translations[key]) el.innerHTML = translations[key];
        });
    }
    
    function setInitialTheme() {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        document.documentElement.dataset.theme = prefersDark ? 'dark' : 'light';
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
            document.documentElement.dataset.theme = e.matches ? 'dark' : 'light';
        });
    }
    
    function showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        dom.toastContainer.appendChild(toast);
        setTimeout(() => toast.remove(), 5000);
    }

    async function fetchTweet(url) {
        if (!url) { 
            url = dom.tweetUrlInput.value.trim();
            if (!url) { 
                showToast(i18n[currentLang].toastInvalidLink, 'error'); 
                return null; 
            }
        }
        
        showToast(i18n[currentLang].toastFetch, 'info');
        if (!url.startsWith('http')) { url = 'https://' + url; }

        url = url.replace('twitter.com', 'fxtwitter.com').replace('x.com', 'fxtwitter.com');
        const apiUrl = new URL(url);
        apiUrl.protocol = 'https:';
        apiUrl.hostname = 'api.fxtwitter.com';
        apiUrl.pathname += '/json';
        
        try {
            const response = await fetch(apiUrl.toString());
            if (!response.ok) throw new Error(`API Request Failed: ${response.status}`);
            const data = await response.json();
            if (data.code !== 200 || !data.tweet) throw new Error(data.message || 'Could not parse tweet');
            showToast(i18n[currentLang].toastSuccess, 'success');
            return data.tweet;
        } catch (error) {
            showToast(i18n[currentLang].toastFailure + error.message, 'error');
            return null;
        }
    }

    function applyCardStyleToCard(cardElement, mode, customColor) {
        cardElement.className = 'card'; // Reset classes
        if (mode === 'custom') {
            cardElement.style.backgroundColor = customColor;
        } else {
            cardElement.classList.add(mode);
            cardElement.style.backgroundColor = ''; // Clear custom color
        }
    }

    function createTweetCardElement(tweetData) {
        const card = dom.tweetCardTemplate.cloneNode(true);
        card.removeAttribute('id');
        card.style.display = 'block';

        const tweetToRender = tweetData.retweeted_status || tweetData;
        const retweeter = tweetData.retweeted_status ? tweetData.author : null;

        card.dataset.tweet = JSON.stringify(tweetToRender); // Store data for later

        const els = {
            retweetInfo: card.querySelector('.retweet-info'),
            showParentBtn: card.querySelector('.show-parent-btn'),
            avatar: card.querySelector('.avatar-preview'),
            username: card.querySelector('.username'),
            handle: card.querySelector('.handle'),
            text: card.querySelector('.text-preview'),
            media: card.querySelector('.media-preview'),
            quotedContainer: card.querySelector('.quoted-tweet-preview'),
            quotedAvatar: card.querySelector('.quoted-avatar-preview'),
            quotedUsername: card.querySelector('.quoted-username'),
            quotedHandle: card.querySelector('.quoted-handle'),
            quotedText: card.querySelector('.quoted-text-preview'),
            quotedMedia: card.querySelector('.quoted-media-preview'),
            replies: card.querySelector('.replies-preview'),
            retweets: card.querySelector('.retweets-preview'),
            likes: card.querySelector('.likes-preview')
        };

        els.retweetInfo.style.display = 'none';
        els.showParentBtn.style.display = 'none';
        els.quotedContainer.style.display = 'none';

        if (retweeter) {
            els.retweetInfo.textContent = `Retweeted by ${retweeter.name}`;
            els.retweetInfo.style.display = 'block';
        }

        const { author, text, replies, retweets, likes, quote, replying_to, replying_to_status, media } = tweetToRender;
        
        els.username.textContent = author.name;
        els.handle.textContent = `@${author.screen_name}`;
        els.text.textContent = text;
        loadImageWithFallback(els.avatar, author.avatar_url);

        els.replies.textContent = `💬 ${replies || 0}`;
        els.retweets.textContent = `🔁 ${retweets || 0}`;
        els.likes.textContent = `❤️ ${likes || 0}`;

        renderMedia(media, els.media);

        if (quote) {
            els.quotedContainer.style.display = 'block';
            els.quotedUsername.textContent = quote.author.name;
            els.quotedHandle.textContent = `@${quote.author.screen_name}`;
            els.quotedText.textContent = quote.text;
            loadImageWithFallback(els.quotedAvatar, quote.author.avatar_url);
            renderMedia(quote.media, els.quotedMedia, true);
        }

        if (replying_to && replying_to_status) {
            const parentTweetUrl = `https://twitter.com/${replying_to}/status/${replying_to_status}`;
            els.showParentBtn.style.display = 'block';
            els.showParentBtn.dataset.url = parentTweetUrl;
        }

        // Apply current card style
        const activeSwatch = dom.cardSwatches.querySelector('.color-swatch.active');
        if (activeSwatch) {
            const mode = activeSwatch.dataset.mode;
            const customColor = activeSwatch.dataset.color;
            applyCardStyleToCard(card, mode, customColor);
        }

        return card;
    }

    function renderMedia(mediaData, container, isQuote = false) {
        container.innerHTML = '';
        if (!mediaData) return;

        const { photos, videos } = mediaData;
        if (photos && photos.length > 0) {
            const mediaContainer = document.createElement('div');
            if (isQuote) {
                mediaContainer.className = 'media-waterfall';
                mediaContainer.appendChild(createImage(photos[0].url));
            } else {
                const layout = document.querySelector('input[name="layout-mode"]:checked').value;
                if (layout === 'grid' && photos.length > 1) {
                    const count = Math.min(photos.length, 4);
                    mediaContainer.className = `media-grid grid-${count}`;
                    photos.slice(0, count).forEach(p => mediaContainer.appendChild(createImage(p.url)));
                } else {
                    mediaContainer.className = 'media-waterfall';
                    photos.forEach(p => mediaContainer.appendChild(createImage(p.url)));
                }
            }
            container.appendChild(mediaContainer);
        } else if (videos && videos.length > 0) {
            const mediaContainer = document.createElement('div');
            mediaContainer.className = 'media-waterfall';
            mediaContainer.appendChild(createImage(videos[0].thumbnail_url));
            container.appendChild(mediaContainer);
        }
    }
    
    function proxyUrl(url) {
        return `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
    }
    
    function loadImageWithFallback(imgElement, originalSrc) {
        imgElement.crossOrigin = "anonymous";
        imgElement.onerror = () => {
            if (!proxyRetryNotified) {
                let msg = "A request was blocked by tracking protection. Retrying with a proxy...";
                if (currentLang === 'zh') {
                    msg = "一个请求被增强型隐私保护拦截，正在尝试使用代理…";
                }
                showToast(msg, 'info');
                proxyRetryNotified = true;
            }
            imgElement.src = proxyUrl(originalSrc);
            imgElement.onerror = null;
        };
        imgElement.src = originalSrc;
    }

    function createImage(src) {
        const img = document.createElement('img');
        loadImageWithFallback(img, src);
        return img;
    }

    function setupSwatches() {
        PRESET_GRADIENTS.forEach(p => {
            const swatch = createSwatch(p.name, p.colors.length > 0 ? `linear-gradient(135deg, ${p.colors[0]}, ${p.colors[1]})` : '#ccc');
            swatch.dataset.colors = p.colors.join(',');
            dom.bgSwatches.appendChild(swatch);
        });
        PRESET_CARD_COLORS.forEach(p => {
            const swatch = createSwatch(p.name, p.color || '#ccc');
            swatch.dataset.color = p.color;
            swatch.dataset.mode = p.mode;
            dom.cardSwatches.appendChild(swatch);
        });
        dom.bgSwatches.querySelector('.color-swatch').classList.add('active');
        dom.cardSwatches.querySelector('.color-swatch').classList.add('active');
        updateGradient();
    }
    
    function createSwatch(name, background) {
        const swatch = document.createElement('div');
        swatch.className = 'color-swatch';
        swatch.title = name;
        swatch.style.background = background;
        if (name === 'Custom') {
            swatch.style.textAlign = 'center';
            swatch.style.lineHeight = '28px';
            swatch.style.fontSize = '18px';
            swatch.textContent = '...';
        }
        return swatch;
    }

    function handleSwatchActivation(container, target) {
        container.querySelector('.active')?.classList.remove('active');
        target.classList.add('active');
    }
    
    function handleBgSwatchClick(e) {
        if (!e.target.classList.contains('color-swatch')) return;
        handleSwatchActivation(dom.bgSwatches, e.target);
        if (e.target.title === 'Custom') {
            dom.customBgPicker.classList.add('visible');
        } else {
            dom.customBgPicker.classList.remove('visible');
            updateGradient();
        }
    }
    
    function handleCardSwatchClick(e) {
        if (!e.target.classList.contains('color-swatch')) return;
        handleSwatchActivation(dom.cardSwatches, e.target);
        const mode = e.target.dataset.mode;
        const customColor = e.target.dataset.color;

        dom.captureArea.querySelectorAll('.card').forEach(card => {
            applyCardStyleToCard(card, mode, customColor);
        });

        if (mode === 'custom') {
            dom.customCardPicker.classList.add('visible');
        } else {
            dom.customCardPicker.classList.remove('visible');
        }
    }

    function updateGradient(fromCustom = false) {
        const activeSwatch = dom.bgSwatches.querySelector('.active');
        const colors = fromCustom 
            ? [dom.bgColor1.value, dom.bgColor2.value] 
            : activeSwatch.dataset.colors.split(',');
        dom.captureArea.style.backgroundImage = `linear-gradient(135deg, ${colors[0]}, ${colors[1]})`;
    }

    function downloadImage() {
        const cards = dom.captureArea.querySelectorAll('.card');
        if (cards.length === 0) { 
            showToast(i18n[currentLang].toastNoData, 'error'); 
            return; 
        }

        const buttonsToHide = dom.captureArea.querySelectorAll('.show-parent-btn');
        const originalButtonStates = [];
        buttonsToHide.forEach(btn => {
            originalButtonStates.push({ btn: btn, display: btn.style.display, textContent: btn.textContent, disabled: btn.disabled });
            btn.style.display = 'none';
        });

        const textElementsToFix = dom.captureArea.querySelectorAll('.username, .handle, .text-preview, .replies-preview, .retweets-preview, .likes-preview');
        textElementsToFix.forEach(el => {
            el.style.color = window.getComputedStyle(el).color;
        });

        const watermark = document.createElement('div');
        watermark.id = 'watermark';
        watermark.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="16" height="16"><defs><linearGradient id="cameraGradient" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#333333"/><stop offset="100%" stop-color="#0a0a0a"/></linearGradient><filter id="shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="rgba(0,0,0,0.3)"/></filter></defs><rect width="120" height="120" rx="20" fill="url(#cameraGradient)" filter="url(#shadow)"/><circle cx="60" cy="60" r="38" fill="#1a1a1a" stroke="#444" stroke-width="2"/><circle cx="60" cy="60" r="30" fill="#111" stroke="#333" stroke-width="1"/><g transform="translate(60, 60) scale(0.05) translate(-420, -420)"><path d="M818 800 498.11 333.745l.546.437L787.084 0h-96.385L455.738 272 269.15 0H16.367l298.648 435.31-.036-.037L0 800h96.385l261.222-302.618L565.217 800zM230.96 72.727l448.827 654.546h-76.38L154.217 72.727z" fill="#FFF"/></g><circle cx="18" cy="18" r="10" fill="#0a0a0a" stroke="#222" stroke-width="1"/><circle cx="70" cy="45" r="4" fill="white" opacity="0.3"/><circle cx="55" cy="50" r="2" fill="white" opacity="0.2"/></svg>
            <span>Generated by XSnap</span>
            <svg xmlns="http://www.w3.org/2000/svg" role="img" viewBox="0 0 24 24" fill="currentColor"><title>GitHub</title><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>
        `;
        dom.captureArea.appendChild(watermark);
        
        html2canvas(dom.captureArea, { useCORS: true, allowTaint: true, scale: 2.5, backgroundColor: null })
            .then(canvas => {
                const link = document.createElement('a');
                const firstCard = dom.captureArea.querySelector('.card');
                const tweetAuthor = initialTweetData.author.screen_name;
                const tweetId = initialTweetData.id;
                link.download = `XSnap-${tweetAuthor}-${tweetId}.png`;
                link.href = canvas.toDataURL('image/png');
                link.click();
                showToast(i18n[currentLang].toastDownload, 'success');
            })
            .finally(() => {
                dom.captureArea.removeChild(watermark);
                textElementsToFix.forEach(el => { el.style.color = ''; });
                originalButtonStates.forEach(state => {
                    state.btn.style.display = state.display;
                    state.btn.textContent = state.textContent;
                    state.btn.disabled = state.disabled;
                });
            });
    }

    function attachEventListeners() {
        dom.fetchBtn.addEventListener('click', async () => {
            dom.fetchBtn.disabled = true;
            initialTweetData = await fetchTweet();
            if (initialTweetData) {
                dom.captureArea.innerHTML = ''; // Clear previous results
                const card = createTweetCardElement(initialTweetData);
                dom.captureArea.appendChild(card);
                dom.welcomeScreen.style.display = 'none';
                dom.editorScreen.classList.add('visible');
            }
            dom.fetchBtn.disabled = false;
        });

        dom.tweetUrlInput.addEventListener('keydown', (e) => { 
            if (e.key === 'Enter') dom.fetchBtn.click(); 
        });
        
        dom.downloadBtn.addEventListener('click', downloadImage);

        dom.captureArea.addEventListener('click', async (e) => {
            if (e.target.matches('.show-parent-btn')) {
                const btn = e.target;
                const url = btn.dataset.url;
                if (url) {
                    btn.disabled = true;
                    btn.textContent = 'Loading...';
                    const parentTweet = await fetchTweet(url);
                    if (parentTweet) {
                        const parentCard = createTweetCardElement(parentTweet);
                        const currentCard = btn.closest('.card');
                        dom.captureArea.insertBefore(parentCard, currentCard);
                    }
                    btn.disabled = false;
                    btn.textContent = i18n[currentLang].showParentTweet;
                    btn.style.display = 'none'; // Hide after loading
                }
            }
        });

        dom.bgSwatches.addEventListener('click', handleBgSwatchClick);
        dom.cardSwatches.addEventListener('click', handleCardSwatchClick);
        dom.bgColor1.addEventListener('input', () => updateGradient(true));
        dom.bgColor2.addEventListener('input', () => updateGradient(true));
        dom.cardColorCustom.addEventListener('input', (e) => {
            dom.captureArea.querySelectorAll('.card').forEach(card => {
                applyCardStyleToCard(card, 'custom', e.target.value);
            });
            handleSwatchActivation(dom.cardSwatches, dom.cardSwatches.querySelector('[title=Custom]'));
        });

        document.querySelectorAll('input[name="layout-mode"]').forEach(r => r.addEventListener('change', () => {
            const firstCard = dom.captureArea.querySelector('.card');
            if (firstCard) {
                const tweetData = JSON.parse(firstCard.dataset.tweet);
                const mediaContainer = firstCard.querySelector('.media-preview');
                renderMedia(tweetData.media, mediaContainer);
            }
        }));
    }

    // --- 应用启动 ---
    init();
});