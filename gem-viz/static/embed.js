/* eslint-env browser */
(function () {
  const EMBED_CLASS = 'gem-embed';

  const getBaseUrl = () => {
    const script = document.currentScript;
    if (!script || !script.src) return '';
    try {
      const url = new URL(script.src);
      const basePath = url.pathname.replace(/\/embed\.js$/, '');
      return `${url.origin}${basePath}`;
    } catch {
      return '';
    }
  };

  const baseUrl = getBaseUrl();

  const normalizeSrc = (src) => {
    if (!src) return '';
    if (/^https?:\/\//i.test(src)) return src;
    const withSlash = src.startsWith('/') ? src : `/${src}`;
    return baseUrl ? `${baseUrl}${withSlash}` : withSlash;
  };

  const createIframe = (container, index) => {
    const dataSrc = container.getAttribute('data-src');
    if (!dataSrc) return;

    const embedId =
      container.getAttribute('data-embed-id') || `gem-embed-${index + 1}`;
    container.setAttribute('data-embed-id', embedId);

    const width = container.getAttribute('data-width') || '100%';
    const height = container.getAttribute('data-height') || '600';
    const loading = container.getAttribute('data-loading') || 'lazy';
    const title = container.getAttribute('data-title') || 'GEM Visualization';
    const autoHeightAttr = container.getAttribute('data-autoheight');
    const themeAttr = container.getAttribute('data-theme');
    const paddingAttr = container.getAttribute('data-padding');
    const paramsAttr = container.getAttribute('data-params');
    const allowAttr = container.getAttribute('data-allow');
    const sandboxAttr = container.getAttribute('data-sandbox');

    const src = normalizeSrc(dataSrc);
    if (!src) return;

    const url = new URL(src, window.location.href);
    if (!url.searchParams.has('embedId')) url.searchParams.set('embedId', embedId);
    if (!url.searchParams.has('autoHeight')) {
      const autoHeight =
        autoHeightAttr === null || autoHeightAttr.toLowerCase() !== 'false';
      url.searchParams.set('autoHeight', autoHeight ? 'true' : 'false');
    }
    if (themeAttr && !url.searchParams.has('theme')) {
      url.searchParams.set('theme', themeAttr);
    }
    if (paddingAttr && !url.searchParams.has('padding')) {
      url.searchParams.set('padding', paddingAttr);
    }
    if (paramsAttr) {
      const trimmed = paramsAttr.trim();
      if (trimmed.startsWith('{')) {
        try {
          const parsed = JSON.parse(trimmed);
          Object.entries(parsed).forEach(([key, value]) => {
            if (value === undefined || value === null) return;
            if (!url.searchParams.has(key)) url.searchParams.set(key, `${value}`);
          });
        } catch {
          // Ignore invalid JSON params
        }
      } else {
        try {
          const extraParams = new URLSearchParams(trimmed.startsWith('?') ? trimmed.slice(1) : trimmed);
          extraParams.forEach((value, key) => {
            if (!url.searchParams.has(key)) url.searchParams.set(key, value);
          });
        } catch {
          // Ignore invalid query params
        }
      }
    }

    const iframe = document.createElement('iframe');
    iframe.src = url.toString();
    iframe.width = width;
    iframe.height = height;
    iframe.loading = loading;
    iframe.title = title;
    iframe.setAttribute('frameborder', '0');
    iframe.style.border = '0';
    iframe.style.width = width;
    iframe.style.display = 'block';
    if (allowAttr) iframe.setAttribute('allow', allowAttr);
    if (sandboxAttr) iframe.setAttribute('sandbox', sandboxAttr);

    container.innerHTML = '';
    container.appendChild(iframe);
  };

  const init = () => {
    const embeds = document.querySelectorAll(`.${EMBED_CLASS}[data-src]`);
    embeds.forEach((container, index) => createIframe(container, index));
  };

  const onMessage = (event) => {
    const data = event?.data;
    if (!data || data.source !== 'gem-embed' || data.type !== 'resize') return;
    const embedId = data.embedId;
    if (!embedId) return;

    const container = document.querySelector(
      `.${EMBED_CLASS}[data-embed-id="${embedId}"]`,
    );
    if (!container) return;

    const iframe = container.querySelector('iframe');
    if (!iframe) return;

    const height = Number.parseInt(data.height, 10);
    if (!Number.isFinite(height) || height <= 0) return;

    iframe.style.height = `${height}px`;
    iframe.setAttribute('height', `${height}`);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.addEventListener('message', onMessage, false);
})();
