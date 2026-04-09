<script>
  /**
   * SiteFooter - Footer navigation with secondary links
   */
  import { link } from '$lib/links';
  import { investigationCart } from '$lib/investigationCart';

  const cartCount = $derived($investigationCart.length);

  const footerLinks = [
    { path: 'explore', label: 'Explore' },
    { path: 'compose', label: 'Asset Filter' },
    { path: 'network', label: 'Ownership Network' },
    { path: 'report', label: 'Report', showBadge: true },
    { path: 'sitemap', label: 'Sitemap' },
    { path: 'about', label: 'About' },
  ];
</script>

<footer class="site-footer">
  <div class="footer-content">
    <div class="footer-brand">
      <span class="brand-name">GEM Viz</span>
      <span class="brand-org">Global Energy Monitor</span>
    </div>
    <nav class="footer-links">
      {#each footerLinks as { path, label, showBadge }}
        <a href={link(path)}>
          {label}
          {#if showBadge && cartCount > 0}
            <span class="badge">{cartCount}</span>
          {/if}
        </a>
      {/each}
    </nav>
  </div>
</footer>

<style>
  .site-footer {
    border-top: 1px solid var(--color-border);
    background: var(--color-gray-50);
    padding: 32px 40px;
    margin-top: auto;
  }

  .footer-content {
    max-width: var(--container-content);
    margin: 0 auto;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 24px;
  }

  .footer-brand {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .brand-name {
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--color-text-secondary);
  }

  .brand-org {
    font-size: 11px;
    color: var(--color-text-tertiary);
  }

  .footer-links {
    display: flex;
    gap: 24px;
    flex-wrap: wrap;
  }

  .footer-links a {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--color-text-secondary);
    text-decoration: none;
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .footer-links a:hover {
    color: var(--color-black);
    text-decoration: underline;
  }

  .badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 14px;
    height: 14px;
    padding: 0 3px;
    background: var(--color-black);
    color: var(--color-white);
    font-size: 9px;
  }

  @media (max-width: 768px) {
    .site-footer {
      padding: 24px 20px;
    }

    .footer-content {
      flex-direction: column;
      align-items: flex-start;
      gap: 16px;
    }

    .footer-links {
      gap: 16px;
    }
  }

  @media print {
    .site-footer {
      display: none;
    }
  }
</style>
