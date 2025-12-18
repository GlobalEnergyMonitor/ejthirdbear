<script>
  /**
   * Command Palette (CMD+K)
   *
   * Universal search and command interface.
   * Inspired by Linear, Slack, VS Code command palettes.
   */

  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { link, assetLink, entityLink } from '$lib/links';
  import { investigationCart } from '$lib/investigationCart';
  import { listAssets, listEntities } from '$lib/ownership-api';

  // State
  let open = $state(false);
  let showHelp = $state(false);
  let query = $state('');
  let selectedIndex = $state(0);
  let loading = $state(false);
  let inputEl = $state(null);
  let toast = $state('');

  // Search results
  let assetResults = $state([]);
  let entityResults = $state([]);

  // Recent searches (persisted)
  let recentSearches = $state([]);

  // Track key sequences (e.g., g + h)
  let waitingForSecondKey = false;

  // Commands - static actions
  const commands = [
    // Navigation
    { id: 'home', label: 'Go to Home', shortcut: 'g h', action: () => goto(link('index')), section: 'Navigation' },
    { id: 'explore', label: 'Go to Explore', shortcut: 'g e', action: () => goto(link('explore')), section: 'Navigation' },
    { id: 'report', label: 'Go to Report', shortcut: 'g r', action: () => goto(link('report')), section: 'Navigation' },
    { id: 'export', label: 'Go to Export', shortcut: 'g x', action: () => goto(link('export')), section: 'Navigation' },
    { id: 'about', label: 'Go to About', shortcut: 'g a', action: () => goto(link('about')), section: 'Navigation' },
    { id: 'map-search', label: 'Search by Map', shortcut: 'g m', action: () => goto('/asset/search'), section: 'Navigation' },
    { id: 'back', label: 'Go Back', shortcut: 'b', action: () => history.back(), section: 'Navigation' },
    // Actions
    { id: 'add-cart', label: 'Add to Cart', shortcut: 'a', action: () => addCurrentToCart(), section: 'Actions' },
    { id: 'copy-id', label: 'Copy ID to Clipboard', shortcut: 'c', action: () => copyCurrentId(), section: 'Actions' },
    { id: 'copy-url', label: 'Copy Page URL', shortcut: 'u', action: () => copyUrl(), section: 'Actions' },
    { id: 'clear-cart', label: 'Clear Investigation Cart', action: () => { investigationCart.clear(); close(); }, section: 'Actions' },
    { id: 'print', label: 'Print Current Page', shortcut: '⌘ p', action: () => window.print(), section: 'Actions' },
    // Help
    { id: 'shortcuts', label: 'Show All Shortcuts', shortcut: '?', action: () => toggleHelp(), section: 'Help' },
  ];

  // All results combined for keyboard navigation
  const allResults = $derived.by(() => {
    const results = [];

    // Recent searches first (if no query)
    if (!query && recentSearches.length > 0) {
      results.push({ type: 'section', label: 'Recent' });
      recentSearches.slice(0, 3).forEach(r => results.push({ ...r, type: 'recent' }));
    }

    // Commands (filtered by query)
    const filteredCommands = query
      ? commands.filter(c => c.label.toLowerCase().includes(query.toLowerCase()))
      : commands;

    if (filteredCommands.length > 0) {
      results.push({ type: 'section', label: 'Commands' });
      filteredCommands.forEach(c => results.push({ ...c, type: 'command' }));
    }

    // Entities
    if (entityResults.length > 0) {
      results.push({ type: 'section', label: 'Entities' });
      entityResults.forEach(e => results.push({
        type: 'entity',
        id: e['Entity ID'],
        label: e.Name || e['Entity ID'],
        sublabel: e['Headquarters Country'],
        action: () => navigateTo('entity', e['Entity ID'], e.Name),
      }));
    }

    // Assets
    if (assetResults.length > 0) {
      results.push({ type: 'section', label: 'Assets' });
      assetResults.forEach(a => results.push({
        type: 'asset',
        id: a.gem_unit_id,
        label: a.facility_name || a.gem_unit_id,
        sublabel: [a.facility_type, a.country].filter(Boolean).join(' · '),
        action: () => navigateTo('asset', a.gem_unit_id, a.facility_name),
      }));
    }

    return results;
  });

  // Selectable items (exclude section headers)
  const selectableResults = $derived(allResults.filter(r => r.type !== 'section'));

  // Debounced search
  let searchTimeout;
  async function search(q) {
    if (!q || q.length < 2) {
      assetResults = [];
      entityResults = [];
      return;
    }

    loading = true;
    clearTimeout(searchTimeout);

    searchTimeout = setTimeout(async () => {
      try {
        const [assets, entities] = await Promise.all([
          listAssets({ q, limit: 5 }).catch(() => ({ results: [] })),
          listEntities({ q, limit: 5 }).catch(() => ({ results: [] })),
        ]);

        assetResults = assets.results || [];
        entityResults = entities.results || [];
      } catch (err) {
        console.error('[CommandPalette] Search error:', err);
      } finally {
        loading = false;
      }
    }, 200);
  }

  // Navigate to result
  function navigateTo(type, id, name) {
    // Add to recent searches
    addToRecent({ type, id, label: name || id });

    // Navigate
    if (type === 'asset') {
      goto(assetLink(id));
    } else if (type === 'entity') {
      goto(entityLink(id));
    }

    close();
  }

  // Add to recent searches
  function addToRecent(item) {
    const filtered = recentSearches.filter(r => r.id !== item.id);
    recentSearches = [item, ...filtered].slice(0, 10);
    saveRecent();
  }

  // Persist recent searches
  function saveRecent() {
    try {
      localStorage.setItem('gem-recent-searches', JSON.stringify(recentSearches));
    } catch (e) {}
  }

  function loadRecent() {
    try {
      const stored = localStorage.getItem('gem-recent-searches');
      if (stored) {
        recentSearches = JSON.parse(stored);
      }
    } catch (e) {}
  }

  // Execute selected action
  function executeSelected() {
    const item = selectableResults[selectedIndex];
    if (item?.action) {
      item.action();
    }
  }

  // Keyboard handler
  function handleKeydown(e) {
    if (!open) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        selectedIndex = Math.min(selectedIndex + 1, selectableResults.length - 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        selectedIndex = Math.max(selectedIndex - 1, 0);
        break;
      case 'Enter':
        e.preventDefault();
        executeSelected();
        break;
      case 'Escape':
        e.preventDefault();
        close();
        break;
    }
  }

  // Global keyboard handler for opening
  function handleGlobalKeydown(e) {
    // CMD+K or Ctrl+K to open
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      toggle();
      return;
    }

    // / to open (when not in input)
    if (e.key === '/' && !isInputFocused()) {
      e.preventDefault();
      openPalette();
      return;
    }

    // Shortcut sequences (g + key)
    if (!open && e.key === 'g' && !isInputFocused()) {
      waitingForSecondKey = true;
      setTimeout(() => { waitingForSecondKey = false; }, 500);
      return;
    }

    if (waitingForSecondKey && !isInputFocused()) {
      const shortcutMap = {
        'h': () => goto(link('index')),
        'e': () => goto(link('explore')),
        'r': () => goto(link('report')),
        'x': () => goto(link('export')),
        'a': () => goto(link('about')),
        'm': () => goto('/asset/search'),
      };

      if (shortcutMap[e.key]) {
        e.preventDefault();
        shortcutMap[e.key]();
      }
      waitingForSecondKey = false;
    }

    // Direct shortcuts (single key, no modifier)
    if (!isInputFocused() && !open) {
      switch (e.key) {
        case 'a': // Add to cart
          e.preventDefault();
          addCurrentToCart();
          return;

        case 'c': // Copy ID
          e.preventDefault();
          copyCurrentId();
          return;

        case 'u': // Copy URL
          e.preventDefault();
          copyUrl();
          return;

        case 'b': // Back
          e.preventDefault();
          history.back();
          return;

        case 'j': // Next section
          e.preventDefault();
          scrollToSection('next');
          return;

        case 'k': // Previous section
          e.preventDefault();
          scrollToSection('prev');
          return;

        case '?': // Help
          e.preventDefault();
          showHelp = !showHelp;
          return;

        case 'o': // Open first owner (on asset page)
          e.preventDefault();
          openFirstOwner();
          return;

        case 't': // Scroll to top
          e.preventDefault();
          window.scrollTo({ top: 0, behavior: 'smooth' });
          showToast('Top');
          return;

        case 's': // Jump to summary section
          e.preventDefault();
          scrollToElement('.summary, .portfolio-summary, h2');
          return;

        case 'e': // Toggle expand/collapse all details
          e.preventDefault();
          toggleAllDetails();
          return;

        case 'n': // Next asset in list (on asset pages)
          e.preventDefault();
          navigateRelated('next');
          return;

        case 'p': // Previous asset in list
          e.preventDefault();
          navigateRelated('prev');
          return;

        case 'f': // Focus search in current context
          e.preventDefault();
          focusLocalSearch();
          return;

        case '1':
        case '2':
        case '3':
        case '4':
        case '5':
        case '6':
        case '7':
        case '8':
        case '9':
          e.preventDefault();
          jumpToSection(parseInt(e.key));
          return;

        case 'Escape':
          if (showHelp) {
            showHelp = false;
          }
          return;
      }
    }
  }

  // Navigate to first owner on asset page
  function openFirstOwner() {
    const ownerLink = document.querySelector('.owner-link, .entity-link');
    if (ownerLink) {
      ownerLink.click();
    } else {
      showToast('No owner link found');
    }
  }

  // Get current page info from URL
  function getCurrentPageInfo() {
    const path = $page.url.pathname;
    const assetMatch = path.match(/\/asset\/([^/]+)/);
    const entityMatch = path.match(/\/entity\/([^/]+)/);

    if (assetMatch) {
      return { type: 'asset', id: assetMatch[1] };
    } else if (entityMatch) {
      return { type: 'entity', id: entityMatch[1] };
    }
    return null;
  }

  // Add current page item to cart
  function addCurrentToCart() {
    const info = getCurrentPageInfo();
    if (!info) {
      showToast('Not on an asset or entity page');
      return;
    }

    // Get name from page title or fall back to ID
    const pageTitle = document.querySelector('h1')?.textContent || info.id;

    investigationCart.add({
      id: info.id,
      name: pageTitle,
      type: info.type,
    });

    showToast(`Added ${info.type} to cart`);
    close();
  }

  // Copy current page ID to clipboard
  async function copyCurrentId() {
    const info = getCurrentPageInfo();
    if (!info) {
      showToast('Not on an asset or entity page');
      return;
    }

    try {
      await navigator.clipboard.writeText(info.id);
      showToast(`Copied: ${info.id}`);
    } catch (err) {
      showToast('Failed to copy');
    }
    close();
  }

  // Copy current URL to clipboard
  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      showToast('URL copied');
    } catch (err) {
      showToast('Failed to copy');
    }
    close();
  }

  // Toggle help modal
  function toggleHelp() {
    close();
    showHelp = !showHelp;
  }

  // Show toast notification
  function showToast(message) {
    toast = message;
    setTimeout(() => { toast = ''; }, 2000);
  }

  // Scroll to section by index
  function scrollToSection(direction) {
    const sections = document.querySelectorAll('section, .viz-section, .breakdown-section, h2, h3');
    if (sections.length === 0) return;

    let targetSection = null;

    if (direction === 'next') {
      for (const section of sections) {
        const rect = section.getBoundingClientRect();
        if (rect.top > 100) {
          targetSection = section;
          break;
        }
      }
    } else {
      const sectionsArray = Array.from(sections).reverse();
      for (const section of sectionsArray) {
        const rect = section.getBoundingClientRect();
        if (rect.top < -10) {
          targetSection = section;
          break;
        }
      }
    }

    if (targetSection) {
      targetSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  // Scroll to an element by selector
  function scrollToElement(selector) {
    const el = document.querySelector(selector);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      showToast('Section not found');
    }
  }

  // Jump to nth section (1-9)
  function jumpToSection(n) {
    const sections = document.querySelectorAll('section, .viz-section, h2');
    const target = sections[n - 1];
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      showToast(`Section ${n}`);
    } else {
      showToast(`No section ${n}`);
    }
  }

  // Toggle all details/disclosure elements
  function toggleAllDetails() {
    const details = document.querySelectorAll('details');
    if (details.length === 0) {
      showToast('No expandable sections');
      return;
    }

    // Check if most are open or closed
    const openCount = Array.from(details).filter(d => d.open).length;
    const shouldOpen = openCount < details.length / 2;

    details.forEach(d => { d.open = shouldOpen; });
    showToast(shouldOpen ? 'Expanded all' : 'Collapsed all');
  }

  // Navigate to related assets (next/prev in a list)
  function navigateRelated(direction) {
    // Look for asset links in siblings or nearby lists
    const assetLinks = document.querySelectorAll('a[href*="/asset/"]');
    const currentPath = window.location.pathname;

    // Find current position
    const linksArray = Array.from(assetLinks);
    const currentIndex = linksArray.findIndex(a => a.getAttribute('href') === currentPath);

    if (currentIndex === -1 && linksArray.length > 0) {
      // We're on an asset page, try to find it in a list
      // For now just go to first/last
      if (direction === 'next' && linksArray[0]) {
        goto(linksArray[0].getAttribute('href'));
      } else {
        showToast('No related assets found');
      }
      return;
    }

    const nextIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;
    if (nextIndex >= 0 && nextIndex < linksArray.length) {
      goto(linksArray[nextIndex].getAttribute('href'));
    } else {
      showToast(direction === 'next' ? 'Last asset' : 'First asset');
    }
  }

  // Focus local search input if present
  function focusLocalSearch() {
    const searchInput = document.querySelector(
      '.filter-input, .search-input, input[type="search"], input[placeholder*="Search"], input[placeholder*="Filter"]'
    );
    if (searchInput) {
      searchInput.focus();
      searchInput.select();
    } else {
      // Fall back to opening command palette
      openPalette();
    }
  }

  function isInputFocused() {
    const active = document.activeElement;
    return active?.tagName === 'INPUT' || active?.tagName === 'TEXTAREA' || active?.isContentEditable;
  }

  function toggle() {
    if (open) {
      close();
    } else {
      openPalette();
    }
  }

  function openPalette() {
    open = true;
    query = '';
    selectedIndex = 0;
    assetResults = [];
    entityResults = [];
    // Focus input after render
    setTimeout(() => inputEl?.focus(), 10);
  }

  function close() {
    open = false;
    query = '';
  }

  // Watch query changes
  $effect(() => {
    search(query);
    selectedIndex = 0;
  });

  onMount(() => {
    loadRecent();
    window.addEventListener('keydown', handleGlobalKeydown);
    return () => {
      window.removeEventListener('keydown', handleGlobalKeydown);
    };
  });
</script>

{#if open}
  <!-- Backdrop -->
  <div class="palette-backdrop" onclick={close} onkeydown={(e) => e.key === 'Escape' && close()} role="button" tabindex="-1" aria-label="Close palette"></div>

  <!-- Palette -->
  <div class="palette" onkeydown={handleKeydown} role="dialog" aria-label="Command palette" tabindex="-1">
    <div class="palette-header">
      <input
        bind:this={inputEl}
        bind:value={query}
        type="text"
        class="palette-input"
        placeholder="Search assets, entities, or type a command..."
        spellcheck="false"
        autocomplete="off"
      />
      {#if loading}
        <span class="loading-indicator">...</span>
      {/if}
    </div>

    <div class="palette-results">
      {#if allResults.length === 0 && query}
        <div class="no-results">No results for "{query}"</div>
      {:else}
        {#each allResults as item, i}
          {#if item.type === 'section'}
            <div class="result-section">{item.label}</div>
          {:else}
            {@const selectableIndex = selectableResults.indexOf(item)}
            <button
              class="result-item"
              class:selected={selectableIndex === selectedIndex}
              onclick={() => item.action?.()}
              onmouseenter={() => { selectedIndex = selectableIndex; }}
            >
              <span class="result-icon" class:entity={item.type === 'entity'} class:asset={item.type === 'asset'} class:recent={item.type === 'recent'}>
                {#if item.type === 'entity' || (item.type === 'recent' && item.id?.startsWith?.('E'))}E
                {:else if item.type === 'asset' || (item.type === 'recent' && item.id?.startsWith?.('G'))}G
                {:else if item.type === 'command'}⌘
                {:else}↩
                {/if}
              </span>
              <span class="result-content">
                <span class="result-label">{item.label}</span>
                {#if item.sublabel}
                  <span class="result-sublabel">{item.sublabel}</span>
                {/if}
              </span>
              {#if item.shortcut}
                <span class="result-shortcut">{item.shortcut}</span>
              {/if}
            </button>
          {/if}
        {/each}
      {/if}
    </div>

    <div class="palette-footer">
      <span class="hint"><kbd>↑↓</kbd> navigate</span>
      <span class="hint"><kbd>↵</kbd> select</span>
      <span class="hint"><kbd>esc</kbd> close</span>
    </div>
  </div>
{/if}

<!-- Subtle hint (when closed) - only visible on hover near corner -->
<button class="palette-trigger" onclick={openPalette} title="Command palette (⌘K)">
  <span class="trigger-label">⌘K</span>
</button>

<!-- Toast notification -->
{#if toast}
  <div class="toast">{toast}</div>
{/if}

<!-- Help modal -->
{#if showHelp}
  <div class="help-backdrop" onclick={() => showHelp = false} onkeydown={(e) => e.key === 'Escape' && (showHelp = false)} role="button" tabindex="-1" aria-label="Close help"></div>
  <div class="help-modal">
    <div class="help-header">
      <h2>Keyboard Shortcuts</h2>
      <button class="help-close" onclick={() => showHelp = false}>×</button>
    </div>

    <div class="help-content">
      <div class="shortcut-group">
        <h3>Navigation</h3>
        <div class="shortcut-row"><kbd>⌘</kbd><kbd>K</kbd> <span>Command palette</span></div>
        <div class="shortcut-row"><kbd>/</kbd> <span>Quick search</span></div>
        <div class="shortcut-row"><kbd>g</kbd><kbd>h</kbd> <span>Go home</span></div>
        <div class="shortcut-row"><kbd>g</kbd><kbd>e</kbd> <span>Go to explore</span></div>
        <div class="shortcut-row"><kbd>g</kbd><kbd>r</kbd> <span>Go to report</span></div>
        <div class="shortcut-row"><kbd>g</kbd><kbd>x</kbd> <span>Go to export</span></div>
        <div class="shortcut-row"><kbd>g</kbd><kbd>m</kbd> <span>Map search</span></div>
        <div class="shortcut-row"><kbd>g</kbd><kbd>a</kbd> <span>Go to about</span></div>
        <div class="shortcut-row"><kbd>b</kbd> <span>Go back</span></div>
      </div>

      <div class="shortcut-group">
        <h3>Page Navigation</h3>
        <div class="shortcut-row"><kbd>j</kbd> <span>Next section</span></div>
        <div class="shortcut-row"><kbd>k</kbd> <span>Previous section</span></div>
        <div class="shortcut-row"><kbd>1</kbd>-<kbd>9</kbd> <span>Jump to section #</span></div>
        <div class="shortcut-row"><kbd>t</kbd> <span>Scroll to top</span></div>
        <div class="shortcut-row"><kbd>s</kbd> <span>Jump to summary</span></div>
        <div class="shortcut-row"><kbd>f</kbd> <span>Focus filter/search</span></div>
      </div>

      <div class="shortcut-group">
        <h3>Asset/Entity</h3>
        <div class="shortcut-row"><kbd>o</kbd> <span>Open first owner</span></div>
        <div class="shortcut-row"><kbd>n</kbd> <span>Next asset</span></div>
        <div class="shortcut-row"><kbd>p</kbd> <span>Previous asset</span></div>
        <div class="shortcut-row"><kbd>e</kbd> <span>Expand/collapse all</span></div>
      </div>

      <div class="shortcut-group">
        <h3>Actions</h3>
        <div class="shortcut-row"><kbd>a</kbd> <span>Add to cart</span></div>
        <div class="shortcut-row"><kbd>c</kbd> <span>Copy ID</span></div>
        <div class="shortcut-row"><kbd>u</kbd> <span>Copy URL</span></div>
        <div class="shortcut-row"><kbd>⌘</kbd><kbd>P</kbd> <span>Print</span></div>
      </div>

      <div class="shortcut-group">
        <h3>Palette</h3>
        <div class="shortcut-row"><kbd>↑</kbd><kbd>↓</kbd> <span>Navigate results</span></div>
        <div class="shortcut-row"><kbd>↵</kbd> <span>Select result</span></div>
        <div class="shortcut-row"><kbd>Esc</kbd> <span>Close</span></div>
      </div>
    </div>

    <div class="help-footer">
      Press <kbd>?</kbd> to toggle this help
    </div>
  </div>
{/if}

<style>
  /* Backdrop */
  .palette-backdrop {
    position: fixed;
    inset: 0;
    background: color-mix(in srgb, var(--color-white) 90%, transparent);
    z-index: 9998;
    backdrop-filter: blur(2px);
  }

  /* Palette */
  .palette {
    position: fixed;
    top: 18%;
    left: 50%;
    transform: translateX(-50%);
    width: 90%;
    max-width: 520px;
    max-height: 65vh;
    background: var(--color-white);
    border: 1px solid var(--color-black);
    z-index: 9999;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    font-family: Georgia, serif;
  }

  /* Header/Input */
  .palette-header {
    display: flex;
    align-items: center;
    padding: 12px 16px;
    border-bottom: 1px solid var(--color-gray-100);
  }

  .palette-input {
    flex: 1;
    border: none;
    outline: none;
    font-size: 15px;
    font-family: Georgia, serif;
    background: transparent;
  }

  .palette-input::placeholder {
    color: var(--color-gray-400);
    font-style: italic;
  }

  .loading-indicator {
    color: var(--color-gray-400);
    font-size: 12px;
  }

  /* Results */
  .palette-results {
    flex: 1;
    overflow-y: auto;
    padding: 6px;
  }

  .no-results {
    padding: 16px;
    text-align: center;
    color: var(--color-text-tertiary);
    font-size: 12px;
    font-style: italic;
  }

  .result-section {
    padding: 8px 10px 4px;
    font-size: 9px;
    font-weight: normal;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: var(--color-text-tertiary);
  }

  .result-item {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 8px 10px;
    border: none;
    background: transparent;
    text-align: left;
    cursor: pointer;
    border-radius: 2px;
    font-family: Georgia, serif;
    font-size: 13px;
  }

  .result-item:hover,
  .result-item.selected {
    background: var(--color-gray-50);
  }

  .result-item.selected {
    background: var(--color-gray-100);
  }

  .result-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    background: var(--color-gray-100);
    border-radius: 2px;
    font-size: 10px;
    font-weight: normal;
    font-family: monospace;
    color: var(--color-text-secondary);
    flex-shrink: 0;
  }

  .result-icon.entity {
    background: var(--color-entity-bg, #e8d5f0);
    color: var(--color-entity-text, #7b1fa2);
  }

  .result-icon.asset {
    background: var(--color-asset-bg, #d5e5f5);
    color: var(--color-asset-text, #1565c0);
  }

  .result-content {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .result-label {
    font-weight: normal;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--color-gray-700);
  }

  .result-sublabel {
    font-size: 11px;
    color: var(--color-text-tertiary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .result-shortcut {
    font-size: 10px;
    color: var(--color-gray-400);
    font-family: monospace;
    padding: 1px 4px;
    background: var(--color-gray-100);
    border: 1px solid var(--color-border);
    border-radius: 2px;
  }

  /* Footer */
  .palette-footer {
    display: flex;
    gap: 12px;
    padding: 8px 12px;
    border-top: 1px solid var(--color-gray-100);
  }

  .hint {
    font-size: 10px;
    color: var(--color-gray-400);
  }

  .hint kbd {
    display: inline-block;
    padding: 1px 4px;
    font-family: monospace;
    font-size: 9px;
    background: var(--color-gray-50);
    border: 1px solid var(--color-gray-200);
    border-radius: 2px;
    margin-right: 3px;
  }

  /* Subtle floating trigger - nearly invisible until needed */
  .palette-trigger {
    position: fixed;
    bottom: 12px;
    right: 12px;
    padding: 4px 8px;
    background: transparent;
    color: var(--color-gray-300);
    border: 1px solid transparent;
    border-radius: 3px;
    cursor: pointer;
    font-family: monospace;
    font-size: 10px;
    opacity: 0;
    transition: opacity 0.3s, color 0.2s, border-color 0.2s;
    z-index: 100;
  }

  /* Show on hover near the corner area */
  .palette-trigger:hover,
  .palette-trigger:focus {
    opacity: 1;
    color: var(--color-text-secondary);
    border-color: var(--color-border);
  }

  /* Also show when user hovers near bottom-right of page */
  @media (hover: hover) {
    .palette-trigger {
      opacity: 0.3;
    }
  }

  .trigger-label {
    font-weight: 500;
    letter-spacing: 0.5px;
  }

  @media (max-width: 600px) {
    .palette {
      top: 10%;
      width: 95%;
      max-height: 80vh;
    }

    .palette-trigger {
      bottom: 10px;
      right: 10px;
      padding: 6px 10px;
    }
  }

  @media print {
    .palette-trigger {
      display: none;
    }
  }

  /* Toast notification - minimal and unobtrusive */
  .toast {
    position: fixed;
    bottom: 40px;
    right: 12px;
    padding: 5px 10px;
    background: color-mix(in srgb, var(--color-black) 70%, transparent);
    color: color-mix(in srgb, var(--color-white) 90%, transparent);
    font-size: 11px;
    font-family: monospace;
    border-radius: 3px;
    z-index: 10000;
    animation: toastIn 0.15s ease-out, toastOut 0.15s ease-in 1.7s forwards;
    pointer-events: none;
  }

  @keyframes toastIn {
    from { opacity: 0; transform: translateY(4px); }
    to { opacity: 1; transform: translateY(0); }
  }

  @keyframes toastOut {
    from { opacity: 1; }
    to { opacity: 0; }
  }

  /* Help modal - refined and minimal */
  .help-backdrop {
    position: fixed;
    inset: 0;
    background: color-mix(in srgb, var(--color-white) 85%, transparent);
    z-index: 9998;
    backdrop-filter: blur(2px);
  }

  .help-modal {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 90%;
    max-width: 480px;
    max-height: 75vh;
    background: var(--color-white);
    border: 1px solid var(--color-black);
    z-index: 9999;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    font-family: Georgia, serif;
  }

  .help-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid var(--color-gray-100);
  }

  .help-header h2 {
    margin: 0;
    font-size: 13px;
    font-weight: normal;
    font-style: italic;
    color: var(--color-gray-700);
  }

  .help-close {
    background: none;
    border: none;
    font-size: 18px;
    cursor: pointer;
    color: var(--color-text-tertiary);
    line-height: 1;
    padding: 0;
  }

  .help-close:hover {
    color: var(--color-black);
  }

  .help-content {
    flex: 1;
    overflow-y: auto;
    padding: 12px 16px;
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 16px;
  }

  .shortcut-group h3 {
    margin: 0 0 6px 0;
    font-size: 9px;
    font-weight: normal;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: var(--color-text-tertiary);
  }

  .shortcut-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 2px 0;
    font-size: 11px;
  }

  .shortcut-row kbd {
    display: inline-block;
    min-width: 16px;
    padding: 1px 4px;
    font-family: monospace;
    font-size: 10px;
    text-align: center;
    background: var(--color-gray-50);
    border: 1px solid var(--color-gray-200);
    border-radius: 2px;
    color: var(--color-gray-600);
  }

  .shortcut-row span {
    color: var(--color-text-secondary);
    font-family: Georgia, serif;
  }

  .help-footer {
    padding: 8px 16px;
    border-top: 1px solid var(--color-gray-100);
    font-size: 10px;
    color: var(--color-text-tertiary);
    text-align: center;
    font-style: italic;
  }

  .help-footer kbd {
    display: inline-block;
    padding: 1px 4px;
    font-family: monospace;
    font-size: 10px;
    background: var(--color-gray-50);
    border: 1px solid var(--color-gray-200);
    border-radius: 2px;
    margin: 0 2px;
    font-style: normal;
  }

  @media (max-width: 500px) {
    .help-content {
      grid-template-columns: 1fr;
    }

    .help-modal {
      max-height: 85vh;
    }
  }
</style>
