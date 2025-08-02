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
        preview: {
            captureArea: document.getElementById('capture-area'), card: document.getElementById('card'), username: document.querySelector('.username'),
            handle: document.querySelector('.handle'), text: document.getElementById('text-preview'), avatar: document.getElementById('avatar-preview'),
            media: document.getElementById('media-preview'), replies: document.getElementById('replies-preview'),
            retweets: document.getElementById('retweets-preview'), likes: document.getElementById('likes-preview')
        }
    };

    let currentTweetData = null;
    let currentLang = 'en';
    
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
        setTimeout(() => toast.remove(), 4000);
    }

    async function fetchTweetData() {
        let url = dom.tweetUrlInput.value.trim();
        if (!url) { showToast(i18n[currentLang].toastInvalidLink, 'error'); return; }
        dom.fetchBtn.disabled = true;
        dom.fetchBtn.querySelector('span').textContent = i18n[currentLang].generate;
        showToast(i18n[currentLang].toastFetch, 'info');
        url = url.replace(/^(https?:\/\/)?(www\.)?/, 'https://').replace('twitter.com', 'fxtwitter.com').replace('x.com', 'fxtwitter.com');
        const apiUrl = new URL(url);
        apiUrl.hostname = 'api.fxtwitter.com';
        apiUrl.pathname += '/json';
        try {
            const response = await fetch(apiUrl.toString());
            if (!response.ok) throw new Error(`API Request Failed: ${response.status}`);
            const data = await response.json();
            if (data.code !== 200 || !data.tweet) throw new Error(data.message || 'Could not parse tweet');
            currentTweetData = data.tweet;
            renderPreview();
            dom.welcomeScreen.style.display = 'none';
            dom.editorScreen.classList.add('visible');
            showToast(i18n[currentLang].toastSuccess, 'success');
        } catch (error) {
            showToast(i18n[currentLang].toastFailure + error.message, 'error');
        } finally {
            dom.fetchBtn.disabled = false;
            dom.fetchBtn.querySelector('span').textContent = i18n[currentLang].generate;
        }
    }

    function renderPreview() {
        if (!currentTweetData) return;
        const { author, text, replies, retweets, likes } = currentTweetData;
        dom.preview.username.textContent = author.name;
        dom.preview.handle.textContent = `@${author.screen_name}`;
        dom.preview.text.textContent = text;
        dom.preview.avatar.src = author.avatar_url;
        dom.preview.replies.textContent = `💬 ${replies || 0}`;
        dom.preview.retweets.textContent = `🔁 ${retweets || 0}`;
        dom.preview.likes.textContent = `❤️ ${likes || 0}`;
        renderMedia();
    }

    function renderMedia() {
        if (!currentTweetData) return;
        dom.preview.media.innerHTML = '';
        const { photos, videos } = currentTweetData.media || {};
        if (photos && photos.length > 0) {
            const layout = document.querySelector('input[name="layout-mode"]:checked').value;
            const container = document.createElement('div');
            if (layout === 'grid' && photos.length > 1) {
                const count = Math.min(photos.length, 4);
                container.className = `media-grid grid-${count}`;
                photos.slice(0, count).forEach(p => container.appendChild(createImage(p.url)));
            } else {
                container.className = 'media-waterfall';
                photos.forEach(p => container.appendChild(createImage(p.url)));
            }
            dom.preview.media.appendChild(container);
        } else if (videos && videos.length > 0) {
            const container = document.createElement('div');
            container.className = 'media-waterfall';
            container.appendChild(createImage(videos[0].thumbnail_url));
            dom.preview.media.appendChild(container);
        }
    }

    function createImage(src) {
        const img = document.createElement('img');
        img.src = src;
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
        if (mode === 'custom') {
            dom.customCardPicker.classList.add('visible');
        } else {
            dom.customCardPicker.classList.remove('visible');
            dom.preview.card.className = 'card'; // Reset classes
            dom.preview.card.classList.add(mode);
        }
    }

    function updateGradient(fromCustom = false) {
        const activeSwatch = dom.bgSwatches.querySelector('.active');
        const colors = fromCustom 
            ? [dom.bgColor1.value, dom.bgColor2.value] 
            : activeSwatch.dataset.colors.split(',');
        dom.preview.captureArea.style.backgroundImage = `linear-gradient(135deg, ${colors[0]}, ${colors[1]})`;
    }

    function downloadImage() {
        if (!currentTweetData) { showToast(i18n[currentLang].toastNoData, 'error'); return; }
        const watermark = document.createElement('div');
        watermark.id = 'watermark';
        watermark.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="50" r="45" fill="white"/><path d="M68 32L32 68M32 32L68 68" stroke="#4a69ff" stroke-width="12" stroke-linecap="round"/></svg>
            <span>Generated by XSnap</span>
            <svg xmlns="http://www.w3.org/2000/svg" role="img" viewBox="0 0 24 24" fill="currentColor"><title>GitHub</title><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>
        `;
        dom.preview.captureArea.appendChild(watermark);
        html2canvas(dom.preview.captureArea, { useCORS: true, allowTaint: true, scale: 2.5, backgroundColor: null })
            .then(canvas => {
                const link = document.createElement('a');
                link.download = `XSnap-${currentTweetData.author.screen_name}-${currentTweetData.id}.png`;
                link.href = canvas.toDataURL('image/png');
                link.click();
                showToast(i18n[currentLang].toastDownload, 'success');
            })
            .finally(() => {
                dom.preview.captureArea.removeChild(watermark);
            });
    }

    function attachEventListeners() {
        dom.fetchBtn.addEventListener('click', fetchTweetData);
        dom.tweetUrlInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') fetchTweetData(); });
        dom.downloadBtn.addEventListener('click', downloadImage);
        dom.bgSwatches.addEventListener('click', handleBgSwatchClick);
        dom.cardSwatches.addEventListener('click', handleCardSwatchClick);
        dom.bgColor1.addEventListener('input', () => updateGradient(true));
        dom.bgColor2.addEventListener('input', () => updateGradient(true));
        dom.cardColorCustom.addEventListener('input', (e) => {
            dom.preview.card.className = 'card';
            dom.preview.card.style.backgroundColor = e.target.value;
            handleSwatchActivation(dom.cardSwatches, dom.cardSwatches.querySelector('[title=Custom]'));
        });
        document.querySelectorAll('input[name="layout-mode"]').forEach(r => r.addEventListener('change', renderMedia));
    }

    // --- 应用启动 ---
    init();
});