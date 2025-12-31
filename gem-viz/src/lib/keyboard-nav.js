/**
 * Keyboard Navigation
 *
 * Power user shortcuts for the application.
 * Attach to the window in your root layout.
 *
 * Shortcuts:
 *   /         - Focus search
 *   g h       - Go home
 *   g e       - Go to explore
 *   g c       - Go to compose (filters)
 *   g x       - Go to export
 *   g r       - Go to conglomerates (rankings)
 *   Escape    - Close modals, clear focus
 *   ?         - Show keyboard shortcuts
 *   p         - Print current page
 *
 * @example
 * import { initKeyboardNav } from '$lib/keyboard-nav';
 * onMount(() => initKeyboardNav());
 */

import { goto } from '$app/navigation';
import { browser } from '$app/environment';

let pendingKey = null;
let pendingTimeout = null;

const routes = {
  h: '/',
  e: '/explore',
  c: '/compose',
  x: '/export',
  r: '/conglomerates',
};

/**
 * Check if user is in an input field
 */
function isTyping() {
  const active = /** @type {HTMLElement | null} */ (document.activeElement);
  if (!active) return false;
  const tag = active.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || active.isContentEditable;
}

/**
 * Focus the search input if it exists
 */
function focusSearch() {
  const searchInput = /** @type {HTMLInputElement | null} */ (
    document.querySelector(
      'input[type="search"], input[placeholder*="Search"], .quick-search input'
    )
  );
  if (searchInput) {
    searchInput.focus();
    searchInput.select();
    return true;
  }
  return false;
}

/**
 * Show keyboard shortcuts modal
 */
function showShortcuts() {
  // Check if modal already exists
  let modal = document.getElementById('keyboard-shortcuts-modal');
  if (modal) {
    modal.remove();
    return;
  }

  modal = document.createElement('div');
  modal.id = 'keyboard-shortcuts-modal';
  modal.innerHTML = `
    <div class="shortcuts-overlay"></div>
    <div class="shortcuts-content">
      <h3>Keyboard Shortcuts</h3>
      <div class="shortcuts-grid">
        <div class="shortcut-group">
          <h4>Navigation</h4>
          <div class="shortcut"><kbd>g</kbd> <kbd>h</kbd> <span>Go home</span></div>
          <div class="shortcut"><kbd>g</kbd> <kbd>e</kbd> <span>Explore</span></div>
          <div class="shortcut"><kbd>g</kbd> <kbd>c</kbd> <span>Compose filters</span></div>
          <div class="shortcut"><kbd>g</kbd> <kbd>x</kbd> <span>Export</span></div>
          <div class="shortcut"><kbd>g</kbd> <kbd>r</kbd> <span>Rankings</span></div>
        </div>
        <div class="shortcut-group">
          <h4>Actions</h4>
          <div class="shortcut"><kbd>⌘</kbd> <kbd>K</kbd> <span>Command palette</span></div>
          <div class="shortcut"><kbd>/</kbd> <span>Focus search</span></div>
          <div class="shortcut"><kbd>p</kbd> <span>Print page</span></div>
          <div class="shortcut"><kbd>Esc</kbd> <span>Close / clear</span></div>
          <div class="shortcut"><kbd>?</kbd> <span>Show shortcuts</span></div>
        </div>
      </div>
      <button class="close-shortcuts">Close</button>
    </div>
  `;

  // Styles
  const style = document.createElement('style');
  style.textContent = `
    #keyboard-shortcuts-modal {
      position: fixed;
      inset: 0;
      z-index: 9999;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .shortcuts-overlay {
      position: absolute;
      inset: 0;
      background: rgba(0, 0, 0, 0.5);
    }
    .shortcuts-content {
      position: relative;
      background: white;
      padding: 24px 32px;
      max-width: 480px;
      width: 90%;
      box-shadow: 0 4px 24px rgba(0, 0, 0, 0.2);
    }
    .shortcuts-content h3 {
      margin: 0 0 20px 0;
      font-size: 14px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .shortcuts-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
    }
    .shortcut-group h4 {
      margin: 0 0 12px 0;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #666;
    }
    .shortcut {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 8px;
      font-size: 13px;
    }
    .shortcut kbd {
      display: inline-block;
      padding: 3px 7px;
      background: #f0f0f0;
      border: 1px solid #ccc;
      font-family: system-ui, sans-serif;
      font-size: 11px;
      min-width: 24px;
      text-align: center;
    }
    .shortcut span {
      color: #666;
    }
    .close-shortcuts {
      margin-top: 20px;
      padding: 8px 16px;
      background: #000;
      color: white;
      border: none;
      font-size: 12px;
      cursor: pointer;
      width: 100%;
    }
    .close-shortcuts:hover {
      background: #333;
    }
  `;

  document.body.appendChild(style);
  document.body.appendChild(modal);

  // Close handlers
  const close = () => {
    modal.remove();
    style.remove();
  };

  modal.querySelector('.shortcuts-overlay').addEventListener('click', close);
  modal.querySelector('.close-shortcuts').addEventListener('click', close);
}

/**
 * Handle keydown events
 */
function handleKeydown(event) {
  // Don't intercept when typing
  if (isTyping()) {
    // Escape clears focus from inputs
    if (event.key === 'Escape') {
      /** @type {HTMLElement | null} */ (document.activeElement)?.blur();
    }
    return;
  }

  // Don't intercept with modifiers (except shift for ?)
  if (event.ctrlKey || event.altKey || event.metaKey) {
    return;
  }

  const key = event.key.toLowerCase();

  // Handle two-key sequences (g + letter)
  if (pendingKey === 'g') {
    clearTimeout(pendingTimeout);
    pendingKey = null;

    if (routes[key]) {
      event.preventDefault();
      goto(routes[key]);
      return;
    }
  }

  // Start two-key sequence
  if (key === 'g') {
    event.preventDefault();
    pendingKey = 'g';
    pendingTimeout = setTimeout(() => {
      pendingKey = null;
    }, 1000);
    return;
  }

  // Single-key shortcuts
  switch (key) {
    case '/':
      event.preventDefault();
      focusSearch();
      break;

    case '?':
      event.preventDefault();
      showShortcuts();
      break;

    case 'escape': {
      // Close modals
      const modal = document.getElementById('keyboard-shortcuts-modal');
      if (modal) {
        modal.remove();
      }
      // Clear any selection
      window.getSelection()?.removeAllRanges();
      break;
    }

    case 'p':
      event.preventDefault();
      window.print();
      break;
  }
}

/**
 * Initialize keyboard navigation
 * Call this in your root layout's onMount
 */
export function initKeyboardNav() {
  if (!browser) return () => {};

  window.addEventListener('keydown', handleKeydown);

  return () => {
    window.removeEventListener('keydown', handleKeydown);
  };
}
