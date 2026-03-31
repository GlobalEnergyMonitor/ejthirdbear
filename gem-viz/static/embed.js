/* eslint-env browser */
/**
 * GEM Embed Loader v3
 * Drop-in script for embedding GEM visualizations on any page.
 *
 * Supports two modes:
 *   - dynamic (default): Renders widget directly in the page via Shadow DOM (no iframe)
 *   - iframe: Creates an iframe pointing to the embed route
 *
 * Usage (dynamic — default):
 *   <div class="gem-embed" data-src="/embed/entity?id=E12345"></div>
 *   <script src="https://gem-viz.fly.dev/embed.js"></script>
 *
 * Usage (iframe — opt-in):
 *   <div class="gem-embed" data-src="/embed/entity?id=E12345" data-mode="iframe"></div>
 *   <script src="https://gem-viz.fly.dev/embed.js"></script>
 *
 * Features:
 *   - Loading skeleton while content initializes
 *   - IntersectionObserver: embeds only created when scrolled into view
 *   - Auto dark-mode detection (prefers-color-scheme)
 *   - Double-init guard (safe to include script multiple times)
 *   - Load timeout with fallback link after 15s
 *   - postMessage auto-resize from embedded content (iframe mode)
 *   - Shadow DOM CSS isolation (dynamic mode)
 *   - Automatic iframe fallback if dynamic mode fails
 */
(function () {
  // Double-init guard
  if (window.__GEM_EMBED_INIT__) return;
  window.__GEM_EMBED_INIT__ = true;

  var EMBED_CLASS = 'gem-embed';
  var LOAD_TIMEOUT_MS = 15000;

  var getBaseUrl = function () {
    var script = document.currentScript;
    if (!script || !script.src) return '';
    try {
      var url = new URL(script.src);
      var basePath = url.pathname.replace(/\/embed\.js$/, '');
      return url.origin + basePath;
    } catch {
      return '';
    }
  };

  var baseUrl = getBaseUrl();

  // Detect host page dark mode preference
  var prefersDark =
    window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;

  var normalizeSrc = function (src) {
    if (!src) return '';
    if (/^https?:\/\//i.test(src)) return src;
    var withSlash = src.startsWith('/') ? src : '/' + src;
    return baseUrl ? baseUrl + withSlash : withSlash;
  };

  // Inject minimal loading skeleton styles (once)
  var style = document.createElement('style');
  style.textContent =
    '.' + EMBED_CLASS + '-loading{display:flex;align-items:center;justify-content:center;' +
    'min-height:120px;background:#f8fafc;border:1px solid #e5e7eb;border-radius:4px;' +
    'font-family:system-ui,sans-serif;font-size:13px;color:#64748b;gap:8px}' +
    '.' + EMBED_CLASS + '-loading .gem-spinner{width:16px;height:16px;border:2px solid #e5e7eb;' +
    'border-top-color:#64748b;border-radius:50%;animation:gem-spin .8s linear infinite}' +
    '@keyframes gem-spin{to{transform:rotate(360deg)}}' +
    '.' + EMBED_CLASS + '-timeout{text-align:center;padding:20px;font-family:system-ui,sans-serif;' +
    'font-size:13px;color:#64748b}' +
    '.' + EMBED_CLASS + '-timeout a{color:#1d4961;text-decoration:underline}' +
    '.' + EMBED_CLASS + '-error{text-align:center;padding:20px;font-family:system-ui,sans-serif;' +
    'font-size:13px;color:#b91c1c;background:#fef2f2;border:1px solid #fecaca;border-radius:4px}' +
    '.' + EMBED_CLASS + '-error small{display:block;margin-top:6px;font-size:11px;color:#6b7280}';
  document.head.appendChild(style);

  var showLoading = function (container, height) {
    var el = document.createElement('div');
    el.className = EMBED_CLASS + '-loading';
    el.style.height = (height || 200) + 'px';
    el.innerHTML = '<div class="gem-spinner"></div><span>Loading visualization\u2026</span>';
    container.appendChild(el);
  };

  var showError = function (container, message) {
    container.innerHTML = '';
    var el = document.createElement('div');
    el.className = EMBED_CLASS + '-error';
    el.innerHTML =
      '<p>Unable to load visualization</p>' +
      (message ? '<small>' + message + '</small>' : '');
    container.appendChild(el);
  };

  var showTimeout = function (container, src) {
    container.innerHTML = '';
    var el = document.createElement('div');
    el.className = EMBED_CLASS + '-timeout';
    el.innerHTML =
      '<p>This visualization is taking longer than expected.</p>' +
      '<p><a href="' + src + '" target="_blank" rel="noopener">Open directly \u2197</a></p>';
    container.appendChild(el);
  };

  // Track which embeds have loaded (for timeout cleanup)
  var loadedEmbeds = {};

  // ==========================================================================
  // DYNAMIC MODE — Shadow DOM + widget JS chunks
  // ==========================================================================

  var widgetModulePromise = null;

  /**
   * Load the widget module from the server (cached).
   * Returns the { configure, mountWidget, parseSrc } exports.
   */
  var loadWidgetModule = function () {
    if (widgetModulePromise) return widgetModulePromise;
    var widgetUrl = baseUrl + '/widgets/index.js';
    widgetModulePromise = import(/* webpackIgnore: true */ widgetUrl).catch(function (err) {
      widgetModulePromise = null; // allow retry
      throw err;
    });
    return widgetModulePromise;
  };

  /**
   * Create a dynamic (non-iframe) embed using Shadow DOM.
   * Falls back to iframe mode on failure.
   */
  var createDynamic = function (container, index) {
    var dataSrc = container.getAttribute('data-src');
    if (!dataSrc) return;

    if (container.getAttribute('data-gem-initialized')) return;
    container.setAttribute('data-gem-initialized', 'true');

    var embedId = container.getAttribute('data-embed-id') ||
      ('gem-embed-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7));
    container.setAttribute('data-embed-id', embedId);

    var height = container.getAttribute('data-height') || '400';
    var themeAttr = container.getAttribute('data-theme');
    var paramsAttr = container.getAttribute('data-params');
    var dynLinkBase = container.getAttribute('data-link-base');
    var dynLinkTarget = container.getAttribute('data-link-target');

    var theme = themeAttr || (prefersDark ? 'dark' : 'light');

    // Show loading skeleton
    container.innerHTML = '';
    showLoading(container, parseInt(height, 10));

    // Load the widget module and mount
    loadWidgetModule()
      .then(function (mod) {
        // Configure API endpoints
        mod.configure({ appBase: baseUrl || undefined });

        // Parse data-src to get widget type + props
        var parsed = mod.parseSrc(dataSrc);
        if (!parsed.type) {
          throw new Error('Could not parse widget type from: ' + dataSrc);
        }

        // Merge extra params from data-params attribute
        if (paramsAttr) {
          var trimmed = paramsAttr.trim();
          try {
            var extra = trimmed.startsWith('{')
              ? JSON.parse(trimmed)
              : Object.fromEntries(new URLSearchParams(trimmed.startsWith('?') ? trimmed.slice(1) : trimmed));
            Object.keys(extra).forEach(function (k) {
              if (extra[k] != null && !(k in parsed.props)) {
                parsed.props[k] = extra[k];
              }
            });
          } catch { /* ignore invalid params */ }
        }

        // Add theme and link rewriting props
        parsed.props.theme = theme;
        if (dynLinkBase) parsed.props.linkBase = dynLinkBase;
        if (dynLinkTarget) parsed.props.linkTarget = dynLinkTarget;

        // Create Shadow DOM
        var shadow = container.attachShadow({ mode: 'open' });

        // Remove loading skeleton (it's in the light DOM)
        var loadingEl = container.querySelector('.' + EMBED_CLASS + '-loading');
        if (loadingEl) loadingEl.remove();

        // Mark as loaded
        loadedEmbeds[embedId] = true;

        // Mount widget into shadow root
        return mod.mountWidget(shadow, parsed.type, parsed.props);
      })
      .catch(function (err) {
        console.warn('[GEM Embed] Dynamic mode failed, falling back to iframe:', err.message || err);
        // Reset and fall back to iframe
        container.removeAttribute('data-gem-initialized');
        container.innerHTML = '';
        createIframe(container, index);
      });
  };

  // ==========================================================================
  // IFRAME MODE (existing behavior)
  // ==========================================================================

  var createIframe = function (container, _index) {
    var dataSrc = container.getAttribute('data-src');
    if (!dataSrc) return;

    // Skip if already initialized
    if (container.getAttribute('data-gem-initialized')) return;
    container.setAttribute('data-gem-initialized', 'true');

    var embedId = container.getAttribute('data-embed-id') ||
      ('gem-embed-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7));
    container.setAttribute('data-embed-id', embedId);

    var width = container.getAttribute('data-width') || '100%';
    var height = container.getAttribute('data-height') || '600';
    var title = container.getAttribute('data-title') || 'GEM Visualization';
    var autoHeightAttr = container.getAttribute('data-autoheight');
    var themeAttr = container.getAttribute('data-theme');
    var paddingAttr = container.getAttribute('data-padding');
    var paramsAttr = container.getAttribute('data-params');
    var brandingAttr = container.getAttribute('data-branding');
    var linkBaseAttr = container.getAttribute('data-link-base');
    var linkTargetAttr = container.getAttribute('data-link-target');
    var allowAttr = container.getAttribute('data-allow');
    var sandboxAttr = container.getAttribute('data-sandbox');

    var src = normalizeSrc(dataSrc);
    if (!src) return;

    var url = new URL(src, window.location.href);
    // Auto-add embed=true for non-embed paths so root layout strips chrome
    if (!url.pathname.startsWith('/embed')) {
      url.searchParams.set('embed', 'true');
    }
    if (!url.searchParams.has('embedId')) url.searchParams.set('embedId', embedId);
    if (!url.searchParams.has('autoHeight')) {
      var autoHeight = autoHeightAttr === null || autoHeightAttr.toLowerCase() !== 'false';
      url.searchParams.set('autoHeight', autoHeight ? 'true' : 'false');
    }
    // Auto dark mode: use explicit theme if set, otherwise detect from host page
    if (!url.searchParams.has('theme')) {
      var theme = themeAttr || (prefersDark ? 'dark' : 'light');
      url.searchParams.set('theme', theme);
    }
    if (paddingAttr && !url.searchParams.has('padding')) {
      url.searchParams.set('padding', paddingAttr);
    }
    if (brandingAttr && !url.searchParams.has('branding')) {
      url.searchParams.set('branding', brandingAttr);
    }
    if (linkBaseAttr && !url.searchParams.has('linkBase')) {
      url.searchParams.set('linkBase', linkBaseAttr);
    }
    if (linkTargetAttr && !url.searchParams.has('linkTarget')) {
      url.searchParams.set('linkTarget', linkTargetAttr);
    }
    if (paramsAttr) {
      var trimmed = paramsAttr.trim();
      if (trimmed.startsWith('{')) {
        try {
          var parsed = JSON.parse(trimmed);
          Object.entries(parsed).forEach(function (entry) {
            if (entry[1] === undefined || entry[1] === null) return;
            if (!url.searchParams.has(entry[0])) url.searchParams.set(entry[0], '' + entry[1]);
          });
        } catch {
          // Ignore invalid JSON params
        }
      } else {
        try {
          var extraParams = new URLSearchParams(
            trimmed.startsWith('?') ? trimmed.slice(1) : trimmed
          );
          extraParams.forEach(function (value, key) {
            if (!url.searchParams.has(key)) url.searchParams.set(key, value);
          });
        } catch {
          // Ignore invalid query params
        }
      }
    }

    var finalUrl = url.toString();

    // Show loading skeleton
    container.innerHTML = '';
    showLoading(container, parseInt(height, 10));

    var iframe = document.createElement('iframe');
    iframe.src = finalUrl;
    iframe.width = width;
    iframe.height = height;
    iframe.loading = 'lazy';
    iframe.title = title;
    iframe.setAttribute('frameborder', '0');
    iframe.style.border = '0';
    iframe.style.width = width;
    iframe.style.display = 'block';
    iframe.style.opacity = '0';
    iframe.style.transition = 'opacity 0.3s ease';
    if (allowAttr) iframe.setAttribute('allow', allowAttr);
    if (sandboxAttr) iframe.setAttribute('sandbox', sandboxAttr);

    // On iframe load, fade in and remove skeleton
    iframe.onload = function () {
      loadedEmbeds[embedId] = true;
      var loading = container.querySelector('.' + EMBED_CLASS + '-loading');
      if (loading) loading.remove();
      iframe.style.opacity = '1';
    };

    container.appendChild(iframe);

    // Timeout fallback
    setTimeout(function () {
      if (!loadedEmbeds[embedId]) {
        var loading = container.querySelector('.' + EMBED_CLASS + '-loading');
        if (loading) {
          showTimeout(container, finalUrl);
          // Keep the iframe in case it loads eventually
          container.appendChild(iframe);
        }
      }
    }, LOAD_TIMEOUT_MS);
  };

  // ==========================================================================
  // INIT — route each embed to the right mode
  // ==========================================================================

  var embedCounter = 0;

  var initContainer = function (container) {
    var mode = (container.getAttribute('data-mode') || 'dynamic').toLowerCase();
    if (mode === 'dynamic') {
      createDynamic(container, embedCounter++);
    } else {
      createIframe(container, embedCounter++);
    }
  };

  var init = function () {
    var embeds = document.querySelectorAll('.' + EMBED_CLASS + '[data-src]');

    // Use IntersectionObserver for lazy initialization (if available)
    if ('IntersectionObserver' in window) {
      var observer = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) {
              observer.unobserve(entry.target);
              initContainer(entry.target);
            }
          });
        },
        { rootMargin: '200px' } // Start loading 200px before visible
      );
      embeds.forEach(function (container) {
        if (container.getAttribute('data-gem-initialized')) return;
        observer.observe(container);
      });
      window.__gemEmbedObserver = observer;
      window.addEventListener('beforeunload', function () {
        observer.disconnect();
      });
    } else {
      // Fallback: init all immediately
      embeds.forEach(function (container) {
        initContainer(container);
      });
    }
  };

  var onMessage = function (event) {
    var data = event && event.data;
    if (!data || data.source !== 'gem-embed') return;

    var embedId = data.embedId;
    if (!embedId) return;

    var container = document.querySelector('.' + EMBED_CLASS + '[data-embed-id="' + embedId + '"]');
    if (!container) return;

    var iframe = container.querySelector('iframe');
    if (!iframe) return;

    if (data.type === 'resize') {
      var height = parseInt(data.height, 10);
      if (!isFinite(height) || height <= 0) return;
      iframe.style.height = height + 'px';
      iframe.setAttribute('height', '' + height);
    }

    if (data.type === 'ready') {
      if (!loadedEmbeds[embedId]) {
        loadedEmbeds[embedId] = true;
        var loadingReady = container.querySelector('.' + EMBED_CLASS + '-loading');
        if (loadingReady) loadingReady.remove();
        iframe.style.opacity = '1';
      }
      if (window.__GEM_EMBED_DEBUG__) {
        console.log('[GEM Embed] ready', embedId, data.route);
      }
      return;
    }

    if (data.type === 'error') {
      // Cancel the timeout, mark as loaded (to prevent timeout overlay), show error UI
      loadedEmbeds[embedId] = true;
      showError(container, data.message || '');
      // Keep iframe hidden behind error UI
      iframe.style.display = 'none';
      return;
    }

    // Mark as loaded on any message from the embed (resize or unknown)
    if (!loadedEmbeds[embedId]) {
      loadedEmbeds[embedId] = true;
      var loading = container.querySelector('.' + EMBED_CLASS + '-loading');
      if (loading) loading.remove();
      iframe.style.opacity = '1';
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.addEventListener('message', onMessage, false);
})();
