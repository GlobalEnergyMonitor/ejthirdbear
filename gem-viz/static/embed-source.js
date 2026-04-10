/* eslint-env browser */
/**
 * GEM Embed Loader v4
 * Drop-in script for embedding GEM visualizations on any page.
 * Renders widgets directly via Shadow DOM (Flourish-style, no iframes).
 *
 * Usage:
 *   <div class="gem-embed" data-src="/embed/entity?id=E12345"></div>
 *   <script src="https://gem-viz.fly.dev/embed.js"></script>
 *
 * Features:
 *   - Shadow DOM CSS isolation
 *   - Loading skeleton while content initializes
 *   - IntersectionObserver: embeds only mount when scrolled into view
 *   - Auto dark-mode detection (prefers-color-scheme)
 *   - Double-init guard (safe to include script multiple times)
 *   - Load timeout with fallback link after 15s
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
  var isLocalDev = /^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname) &&
    /^(localhost|127\.0\.0\.1)$/i.test((function () {
      try {
        return new URL(baseUrl || window.location.origin).hostname;
      } catch {
        return window.location.hostname;
      }
    })());

  // Detect host page dark mode preference
  var prefersDark =
    window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;

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
  // WIDGET MODULE LOADING
  // ==========================================================================

  var widgetModulePromise = null;
  var versionPromise = null;
  var versionInfo = null;

  /** Fetch deploy version from server (for cache busting widget imports). */
  var getVersion = function () {
    if (versionPromise) return versionPromise;
    versionPromise = fetch(baseUrl + '/version.json', { cache: 'no-cache' })
      .then(function (r) { return r.ok ? r.json() : {}; })
      .then(function (j) {
        versionInfo = j;
        if (j.commit) {
          console.log(
            '[GEM Embed] ' + (j.semver ? 'v' + j.semver + ' ' : '') +
            '(' + j.commit + ')' +
            ' | built ' + (j.buildTime || j.timestamp || '') +
            ' | ' + (j.message || '')
          );
        }
        return j.version || j.commit || '';
      })
      .catch(function () { return ''; });
    return versionPromise;
  };

  /**
   * Load the widget module from the server (cached per deploy version).
   * Returns the { configure, mountWidget, parseSrc } exports.
   */
  var loadWidgetModule = function () {
    if (widgetModulePromise) return widgetModulePromise;
    if (isLocalDev) {
      var devUrl = baseUrl + '/src/widgets/index.ts?t=' + Date.now();
      widgetModulePromise = import(/* webpackIgnore: true */ devUrl).catch(function (err) {
        widgetModulePromise = null;
        throw err;
      });
      return widgetModulePromise;
    }
    widgetModulePromise = getVersion().then(function (v) {
      var url = baseUrl + '/widgets/index.js' + (v ? '?v=' + v : '?v=' + Date.now());
      return import(/* webpackIgnore: true */ url);
    }).catch(function (err) {
      widgetModulePromise = null;
      throw err;
    });
    return widgetModulePromise;
  };

  // ==========================================================================
  // MOUNT WIDGET INTO SHADOW DOM
  // ==========================================================================

  var mountEmbed = function (container) {
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
    var linkBase = container.getAttribute('data-link-base');
    var linkTarget = container.getAttribute('data-link-target');

    var theme = themeAttr || (prefersDark ? 'dark' : 'light');

    // Show loading skeleton
    container.innerHTML = '';
    showLoading(container, parseInt(height, 10));

    // Timeout fallback
    setTimeout(function () {
      if (!loadedEmbeds[embedId]) {
        showTimeout(container, baseUrl + dataSrc);
      }
    }, LOAD_TIMEOUT_MS);

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

        // Check widget is available
        var available = typeof mod.listWidgets === 'function' ? mod.listWidgets() : [];
        if (available.length && available.indexOf(parsed.type) === -1) {
          throw new Error('Unknown widget type: ' + parsed.type + '. Available: ' + available.join(', '));
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
        if (linkBase) parsed.props.linkBase = linkBase;
        if (linkTarget) parsed.props.linkTarget = linkTarget;

        // Create Shadow DOM
        var shadow = container.attachShadow({ mode: 'open' });

        // Remove loading skeleton (it's in the light DOM)
        var loadingEl = container.querySelector('.' + EMBED_CLASS + '-loading');
        if (loadingEl) loadingEl.remove();

        // Mark as loaded
        loadedEmbeds[embedId] = true;

        // Stamp version on container for inspection
        if (versionInfo && versionInfo.commit) {
          container.setAttribute('data-gem-version', versionInfo.commit);
          container.setAttribute('data-gem-built', versionInfo.buildTime || versionInfo.timestamp || '');
        }

        // Mount widget into shadow root
        return mod.mountWidget(shadow, parsed.type, parsed.props).then(function () {
          // Add version footer inside shadow DOM
          if (versionInfo && versionInfo.commit) {
            var vEl = document.createElement('div');
            vEl.className = 'gem-version-stamp';
            vEl.textContent = 'GEM' +
              (versionInfo.semver ? ' v' + versionInfo.semver : '') +
              ' (' + versionInfo.commit + ')' +
              (versionInfo.buildTime ? ' · ' + versionInfo.buildTime : '');
            vEl.title = versionInfo.message || '';
            var vs = vEl.style;
            vs.fontSize = '10px';
            vs.color = '#9ca3af';
            vs.textAlign = 'right';
            vs.padding = '4px 8px 2px';
            vs.fontFamily = 'system-ui, sans-serif';
            vs.opacity = '0.6';
            shadow.appendChild(vEl);
          }
        });
      })
      .catch(function (err) {
        if (!err) return;
        console.error('[GEM Embed] Failed to mount widget:', err.message || err);
        showError(container, err.message || 'Widget failed to load');
      });
  };

  // ==========================================================================
  // INIT — lazy-load embeds via IntersectionObserver
  // ==========================================================================

  var init = function () {
    var embeds = document.querySelectorAll('.' + EMBED_CLASS + '[data-src]');

    if ('IntersectionObserver' in window) {
      var observer = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) {
              observer.unobserve(entry.target);
              mountEmbed(entry.target);
            }
          });
        },
        { rootMargin: '200px' }
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
      embeds.forEach(function (container) {
        mountEmbed(container);
      });
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Watch for dynamically-added .gem-embed elements (e.g. SPA frameworks,
  // Svelte/React hydration, Drupal AJAX page updates).
  if ('MutationObserver' in window) {
    var mo = new MutationObserver(function (mutations) {
      mutations.forEach(function (m) {
        m.addedNodes.forEach(function (node) {
          if (node.nodeType !== 1) return;
          // Check the added node itself
          if (node.classList && node.classList.contains(EMBED_CLASS) && node.getAttribute('data-src')) {
            if (!node.getAttribute('data-gem-initialized')) mountEmbed(node);
          }
          // Check descendants of the added node
          if (node.querySelectorAll) {
            node.querySelectorAll('.' + EMBED_CLASS + '[data-src]').forEach(function (el) {
              if (!el.getAttribute('data-gem-initialized')) mountEmbed(el);
            });
          }
        });
      });
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }
})();
