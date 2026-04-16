/* eslint-env browser */
/**
 * GEM Embed Loader v5
 * Drop-in script for embedding GEM visualizations on any page.
 * Renders widgets directly via Shadow DOM (no iframes).
 *
 * Usage (Custom Element — recommended):
 *   <gem-embed src="/embed/entity?id=E12345" height="600"></gem-embed>
 *   <script src="https://gem-viz.fly.dev/embed.js"></script>
 *
 * Usage (class-based — CMS fallback):
 *   <div class="gem-embed" data-src="/embed/entity?id=E12345"></div>
 *   <script src="https://gem-viz.fly.dev/embed.js"></script>
 *
 * Features:
 *   - <gem-embed> Custom Element with attribute reactivity
 *   - Shadow DOM CSS isolation (constructable stylesheets)
 *   - Loading skeleton while content initializes
 *   - IntersectionObserver: embeds only mount when scrolled into view
 *   - Auto dark-mode detection (prefers-color-scheme)
 *   - CustomEvent protocol: gem:loaded, gem:error, gem:resize, gem:navigate
 *   - Preconnect hints for API + font origins
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
      var basePath = url.pathname.replace(/\/embed(-source)?\.js$/, '');
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

  // Preconnect to known origins for faster widget loading
  var injectPreconnects = function () {
    var origins = [
      { href: 'https://gem-api.thirdbear.net' },
      { href: 'https://fonts.googleapis.com' },
      { href: 'https://fonts.gstatic.com', crossorigin: true }
    ];
    // Also preconnect to widget host if cross-origin
    if (baseUrl) {
      try {
        var embedOrigin = new URL(baseUrl).origin;
        if (embedOrigin !== window.location.origin) {
          origins.push({ href: embedOrigin });
        }
      } catch (e) { /* ignore */ }
    }
    origins.forEach(function (o) {
      if (document.querySelector('link[rel="preconnect"][href="' + o.href + '"]')) return;
      var link = document.createElement('link');
      link.rel = 'preconnect';
      link.href = o.href;
      if (o.crossorigin) link.crossOrigin = '';
      document.head.appendChild(link);
    });
  };
  injectPreconnects();

  // Detect host page dark mode preference
  var prefersDark =
    window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;

  // Inject minimal loading skeleton styles (once)
  var style = document.createElement('style');
  style.textContent =
    '.' + EMBED_CLASS + ':not([data-gem-initialized]){min-height:120px}' +
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
  // CONFIG EXTRACTION — read embed attributes from either element type
  // ==========================================================================

  /** Read config from class-based <div class="gem-embed" data-src="..."> */
  var configFromClassEmbed = function (el) {
    return {
      src: el.getAttribute('data-src'),
      height: el.getAttribute('data-height') || '400',
      theme: el.getAttribute('data-theme'),
      params: el.getAttribute('data-params'),
      linkBase: el.getAttribute('data-link-base'),
      linkTarget: el.getAttribute('data-link-target')
    };
  };

  /** Read config from custom element <gem-embed src="..."> */
  var configFromCustomElement = function (el) {
    return {
      src: el.getAttribute('src'),
      height: el.getAttribute('height') || '400',
      theme: el.getAttribute('theme'),
      params: el.getAttribute('params'),
      linkBase: el.getAttribute('link-base'),
      linkTarget: el.getAttribute('link-target')
    };
  };

  // ==========================================================================
  // MOUNT WIDGET INTO SHADOW DOM
  // ==========================================================================

  /**
   * Mount a widget into a container element.
   * @param {HTMLElement} container - Host element (<gem-embed> or .gem-embed div)
   * @param {Object} [config] - Optional config override; if omitted, reads from data-* attributes
   */
  var mountEmbed = function (container, config) {
    if (!config) config = configFromClassEmbed(container);
    var dataSrc = config.src;
    if (!dataSrc) return;

    if (container.getAttribute('data-gem-initialized')) return;
    container.setAttribute('data-gem-initialized', 'true');

    var embedId = container.getAttribute('data-embed-id') ||
      ('gem-embed-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7));
    container.setAttribute('data-embed-id', embedId);

    var height = config.height;
    var paramsAttr = config.params;
    var linkBase = config.linkBase;
    var linkTarget = config.linkTarget;

    var theme = config.theme || (prefersDark ? 'dark' : 'light');

    // Show loading skeleton
    container.innerHTML = '';
    showLoading(container, parseInt(height, 10));

    // Timeout fallback
    setTimeout(function () {
      if (!loadedEmbeds[embedId]) {
        showTimeout(container, baseUrl + dataSrc);
      }
    }, LOAD_TIMEOUT_MS);

    // Shared mount logic used by both primary path and retry
    var doMount = function (mod) {
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

      // Create Shadow DOM (guard against double-attach for Custom Element remount)
      var shadow = container.shadowRoot || container.attachShadow({ mode: 'open' });

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
      return mod.mountWidget(shadow, parsed.type, parsed.props);
    };

    // Load the widget module and mount
    loadWidgetModule()
      .then(function (mod) {
        return doMount(mod).then(function () {
          var sr = container.shadowRoot;

          // Add version footer inside shadow DOM
          if (sr && versionInfo && versionInfo.commit) {
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
            sr.appendChild(vEl);
          }

          // Dispatch gem:loaded event
          container.dispatchEvent(new CustomEvent('gem:loaded', {
            composed: true,
            bubbles: true,
            detail: { widgetType: dataSrc, embedId: embedId }
          }));

          // Watch for size changes and dispatch gem:resize
          if ('ResizeObserver' in window) {
            var ro = new ResizeObserver(function (entries) {
              var entry = entries[0];
              if (!entry) return;
              var rect = entry.contentRect;
              container.dispatchEvent(new CustomEvent('gem:resize', {
                composed: true,
                bubbles: true,
                detail: { width: Math.round(rect.width), height: Math.round(rect.height), embedId: embedId }
              }));
            });
            ro.observe(container);
            container.__gemResizeObserver = ro;
          }
        });
      })
      .catch(function (err) {
        console.error('[GEM Embed] Failed to mount widget:', err || '(unknown error)');
        showError(container, (err && err.message) || 'Widget failed to load');

        // Dispatch gem:error event
        container.dispatchEvent(new CustomEvent('gem:error', {
          composed: true,
          bubbles: true,
          detail: { message: (err && err.message) || 'Widget failed to load', embedId: embedId }
        }));
      });

    // Watchdog: on some host pages (Drupal/Webflow), the cached module promise
    // can stall when .then() is called during DOM transitions. If the shadow
    // root hasn't been created after 500ms, retry with a fresh dynamic import.
    setTimeout(function () {
      if (container.shadowRoot || !container.isConnected) return;
      var url = baseUrl + '/widgets/index.js?retry=' + Date.now();
      import(/* webpackIgnore: true */ url)
        .then(function (mod) { return doMount(mod); })
        .then(function () {
          container.dispatchEvent(new CustomEvent('gem:loaded', {
            composed: true, bubbles: true,
            detail: { widgetType: dataSrc, embedId: embedId, retried: true }
          }));
        })
        .catch(function (retryErr) {
          console.error('[GEM Embed] Retry also failed:', retryErr || '(unknown)');
        });
    }, 500);
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
        if (container.tagName === 'GEM-EMBED') return; // handled by custom element
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

  // ==========================================================================
  // <gem-embed> CUSTOM ELEMENT
  // ==========================================================================

  if ('customElements' in window && !customElements.get('gem-embed')) {
    var GemEmbed = function () {
      return Reflect.construct(HTMLElement, [], GemEmbed);
    };
    Object.setPrototypeOf(GemEmbed.prototype, HTMLElement.prototype);
    Object.setPrototypeOf(GemEmbed, HTMLElement);

    Object.defineProperty(GemEmbed, 'observedAttributes', {
      get: function () {
        return ['src', 'theme', 'height', 'link-base', 'link-target', 'params'];
      }
    });

    GemEmbed.prototype.connectedCallback = function () {
      var self = this;

      // Support loading="eager" to skip lazy loading
      if (self.getAttribute('loading') === 'eager') {
        Promise.resolve().then(function () {
          if (!self.isConnected) return;
          if (self.getAttribute('data-gem-initialized')) return;
          var cfg = configFromCustomElement(self);
          if (cfg.src) mountEmbed(self, cfg);
        });
        return;
      }

      // Default: lazy load via IntersectionObserver
      if ('IntersectionObserver' in window) {
        if (!self.__gemObserver) {
          self.__gemObserver = new IntersectionObserver(function (entries) {
            if (entries[0].isIntersecting) {
              self.__gemObserver.disconnect();
              self.__gemObserver = null;
              if (!self.getAttribute('data-gem-initialized')) {
                mountEmbed(self, configFromCustomElement(self));
              }
            }
          }, { rootMargin: '200px' });
        }
        self.__gemObserver.observe(self);
      } else {
        mountEmbed(self, configFromCustomElement(self));
      }
    };

    GemEmbed.prototype.disconnectedCallback = function () {
      var self = this;
      // Disconnect lazy-load observer
      if (self.__gemObserver) {
        self.__gemObserver.disconnect();
        self.__gemObserver = null;
      }
      // Disconnect resize observer
      if (self.__gemResizeObserver) {
        self.__gemResizeObserver.disconnect();
        self.__gemResizeObserver = null;
      }
      // Unmount widget
      var shadow = self.shadowRoot;
      if (shadow) {
        loadWidgetModule().then(function (mod) {
          if (typeof mod.unmountWidget === 'function') {
            mod.unmountWidget(shadow);
          }
        }).catch(function () { /* ignore */ });
      }
      // Clean up tracking
      var embedId = self.getAttribute('data-embed-id');
      if (embedId) delete loadedEmbeds[embedId];
      self.removeAttribute('data-gem-initialized');
    };

    GemEmbed.prototype.attributeChangedCallback = function (name, oldValue, newValue) {
      if (oldValue === newValue) return;
      if (!this.getAttribute('data-gem-initialized')) return;
      // Full remount on any attribute change
      this.disconnectedCallback();
      // Clear shadow root content for remount
      if (this.shadowRoot) {
        while (this.shadowRoot.firstChild) this.shadowRoot.lastChild.remove();
      }
      this.connectedCallback();
    };

    customElements.define('gem-embed', GemEmbed);
  }

  // ==========================================================================
  // MUTATION OBSERVER — dynamically-added embeds
  // ==========================================================================

  // Watch for dynamically-added .gem-embed elements (e.g. SPA frameworks,
  // Svelte/React hydration, Drupal AJAX page updates).
  // <gem-embed> custom elements self-mount via connectedCallback — skip them here.
  var setupMutationObserver = function () {
    if (!('MutationObserver' in window) || !document.body) return;
    var mo = new MutationObserver(function (mutations) {
      // Collect new embed elements, then mount after the current DOM mutation
      // batch completes. Mounting synchronously inside the MO callback can fail
      // when the host page (e.g. Drupal/Webflow) is mid-transition — the async
      // widget load promise may not resolve while the mutation batch is active.
      var pending = [];
      mutations.forEach(function (m) {
        m.addedNodes.forEach(function (node) {
          if (node.nodeType !== 1) return;
          // Skip <gem-embed> custom elements — handled by connectedCallback
          if (node.tagName === 'GEM-EMBED') return;
          // Check the added node itself
          if (node.classList && node.classList.contains(EMBED_CLASS) && node.getAttribute('data-src')) {
            if (!node.getAttribute('data-gem-initialized')) pending.push(node);
          }
          // Check descendants of the added node (skip <gem-embed> descendants)
          if (node.querySelectorAll) {
            node.querySelectorAll('.' + EMBED_CLASS + '[data-src]').forEach(function (el) {
              if (el.tagName === 'GEM-EMBED') return;
              if (!el.getAttribute('data-gem-initialized')) pending.push(el);
            });
          }
        });
      });
      if (pending.length) {
        // Defer mount to a new macrotask. On some host pages (Drupal/Webflow),
        // the closure-cached loadWidgetModule() promise stalls when .then() is
        // called during DOM transitions. Load the module via a <script type=module>
        // shim since direct import() can fail from bootstrapper-loaded scripts.
        setTimeout(function () {
          pending.forEach(function (el) {
            if (el.getAttribute('data-gem-initialized') || !el.isConnected) return;
            el.setAttribute('data-gem-initialized', 'true');
            var config = configFromClassEmbed(el);
            if (!config.src) return;
            showLoading(el, parseInt(config.height || '400', 10));

            // Use an inline module script to perform the import — this works
            // reliably cross-origin even when import() from a classic script fails.
            var modScript = document.createElement('script');
            modScript.type = 'module';
            modScript.textContent =
              'import * as mod from "' + baseUrl + '/widgets/index.js?t=' + Date.now() + '";\n' +
              'window.__gemMountQueue = window.__gemMountQueue || [];\n' +
              'window.__gemMountQueue.push(mod);\n' +
              'window.dispatchEvent(new Event("gem:module-ready"));';
            document.head.appendChild(modScript);

            var onReady = function () {
              window.removeEventListener('gem:module-ready', onReady);
              var mod = (window.__gemMountQueue || []).pop();
              if (!mod) return;
              try {
                mod.configure({ appBase: baseUrl || undefined });
                var parsed = mod.parseSrc(config.src);
                if (!parsed.type) throw new Error('Unknown widget: ' + config.src);
                parsed.props.theme = config.theme || (prefersDark ? 'dark' : 'light');
                if (config.linkBase) parsed.props.linkBase = config.linkBase;
                if (config.linkTarget) parsed.props.linkTarget = config.linkTarget;
                var shadow = el.shadowRoot || el.attachShadow({ mode: 'open' });
                el.innerHTML = '';
                mod.mountWidget(shadow, parsed.type, parsed.props).then(function () {
                  el.dispatchEvent(new CustomEvent('gem:loaded', {
                    composed: true, bubbles: true,
                    detail: { embedId: el.getAttribute('data-embed-id') || '' }
                  }));
                });
              } catch (err) {
                console.error('[GEM Embed] Dynamic mount failed:', err || '(unknown)');
                showError(el, (err && err.message) || 'Widget failed to load');
              }
            };
            window.addEventListener('gem:module-ready', onReady);
          });
        }, 16);
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });
  };

  // Defer MO setup if body isn't available yet (script in <head>)
  if (document.body) {
    setupMutationObserver();
  } else {
    document.addEventListener('DOMContentLoaded', setupMutationObserver);
  }
})();
