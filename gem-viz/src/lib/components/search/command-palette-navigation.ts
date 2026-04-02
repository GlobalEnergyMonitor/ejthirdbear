/**
 * DOM navigation helpers for the Command Palette.
 * Pure functions that query/manipulate the DOM without Svelte state.
 * Returns status messages rather than calling UI callbacks directly.
 */

/** Check if the active element is an input field. */
export function isInputFocused(): boolean {
  const active = document.activeElement as HTMLElement | null;
  return (
    active?.tagName === 'INPUT' || active?.tagName === 'TEXTAREA' || !!active?.isContentEditable
  );
}

/** Extract asset/entity info from a URL pathname. */
export function getCurrentPageInfo(
  pathname: string
): { type: 'asset' | 'entity'; id: string } | null {
  const assetMatch = pathname.match(/\/asset\/([^/]+)/);
  if (assetMatch) return { type: 'asset', id: assetMatch[1] };
  const entityMatch = pathname.match(/\/entity\/([^/]+)/);
  if (entityMatch) return { type: 'entity', id: entityMatch[1] };
  return null;
}

/** Scroll to next/previous section on the page. */
export function scrollToSection(direction: 'next' | 'prev'): void {
  const sections = document.querySelectorAll('section, .viz-section, .breakdown-section, h2, h3');
  if (sections.length === 0) return;

  let target: Element | null = null;

  if (direction === 'next') {
    for (const section of sections) {
      if (section.getBoundingClientRect().top > 100) {
        target = section;
        break;
      }
    }
  } else {
    const reversed = Array.from(sections).reverse();
    for (const section of reversed) {
      if (section.getBoundingClientRect().top < -10) {
        target = section;
        break;
      }
    }
  }

  target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/** Scroll to an element by CSS selector. Returns false if not found. */
export function scrollToElement(selector: string): boolean {
  const el = document.querySelector(selector);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return true;
  }
  return false;
}

/** Jump to the nth section (1-based). Returns a toast message. */
export function jumpToSection(n: number): string {
  const sections = document.querySelectorAll('section, .viz-section, h2');
  const target = sections[n - 1];
  if (target) {
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return `Section ${n}`;
  }
  return `No section ${n}`;
}

/** Toggle all <details> elements. Returns a toast message. */
export function toggleAllDetails(): string {
  const details = document.querySelectorAll('details');
  if (details.length === 0) return 'No expandable sections';

  const openCount = Array.from(details).filter((d) => d.open).length;
  const shouldOpen = openCount < details.length / 2;
  details.forEach((d) => {
    d.open = shouldOpen;
  });
  return shouldOpen ? 'Expanded all' : 'Collapsed all';
}

/**
 * Find the href for a related asset (next/prev in page links).
 * Returns { href } to navigate to, or { message } for a toast.
 */
export function findRelatedAsset(
  direction: 'next' | 'prev',
  currentPath: string
): { href: string } | { message: string } {
  const assetLinks = document.querySelectorAll('a[href*="/asset/"]');
  const linksArray = Array.from(assetLinks);
  const currentIndex = linksArray.findIndex((a) => a.getAttribute('href') === currentPath);

  if (currentIndex === -1 && linksArray.length > 0) {
    if (direction === 'next' && linksArray[0]) {
      const href = linksArray[0].getAttribute('href');
      if (href) return { href };
    }
    return { message: 'No related assets found' };
  }

  const nextIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;
  if (nextIndex >= 0 && nextIndex < linksArray.length) {
    const href = linksArray[nextIndex].getAttribute('href');
    if (href) return { href };
  }
  return { message: direction === 'next' ? 'Last asset' : 'First asset' };
}

/** Focus the first filter/search input on the page. Returns true if found. */
export function focusLocalSearch(): boolean {
  const searchInput = document.querySelector(
    '.filter-input, .search-input, input[type="search"], input[placeholder*="Search"], input[placeholder*="Filter"]'
  ) as HTMLInputElement | null;
  if (searchInput) {
    searchInput.focus();
    searchInput.select();
    return true;
  }
  return false;
}

/** Click the first owner link on the page. Returns true if found. */
export function clickFirstOwnerLink(): boolean {
  const ownerLink = document.querySelector('.owner-link, .entity-link') as HTMLElement | null;
  if (ownerLink) {
    ownerLink.click();
    return true;
  }
  return false;
}
