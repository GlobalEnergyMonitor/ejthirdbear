<script>
  /**
   * ASSET CLASS SCREENER - Step 1: Select Asset Class
   *
   * Thin wrapper: layout + step-nav + shared ScreenerStep1 component.
   * All picker state, selection logic, and URL building lives in ScreenerStep1.
   */

  import { goto } from '$app/navigation';
  import ScreenerLayout from '$lib/components/nav/ScreenerLayout.svelte';
  import ScreenerStepNav from '$lib/components/nav/ScreenerStepNav.svelte';
  import ScreenerStep1 from '$lib/components/screener/ScreenerStep1.svelte';
  import { buildScreenerUrl, readScreenerHash, writeScreenerHash } from '$lib/screener-url';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { GEM_DATA_EMAIL } from '$lib/external-links';
  import SeoMeta from '$lib/components/nav/SeoMeta.svelte';

  /** @type {ScreenerStep1 | null} */
  let step1 = $state(null);

  // Mirror of ScreenerStep1's selection for the header badge + nav param
  let selectedClassId = $state(null);
  let selectionSummary = $state('');
  /** @type {import('$lib/data-config/screener-types').ScreenerSelectedClass[]} */
  let currentClassData = $state([]);

  // Hash restore (embed mode)
  let initialClassId = $state(null);
  let initialGeoFilters = $state([]);

  const isEmbed = $derived($page.url.searchParams.get('embed') === 'true');
  const classesParamForNav = $derived(
    currentClassData.length > 0 ? JSON.stringify(currentClassData) : ''
  );

  function onSelectionChange(classData) {
    if (!classData || classData.length === 0) {
      selectedClassId = null;
      selectionSummary = '';
      currentClassData = [];
      if (isEmbed) writeScreenerHash({});
      return;
    }
    currentClassData = classData;
    selectedClassId = step1?.getSelectedClassId() ?? classData[0].id ?? null;
    selectionSummary = step1?.getSelectionSummary() ?? '';
    if (isEmbed) writeScreenerHash({ classes: JSON.stringify(classData) });
  }

  function navigateTo(path, classData) {
    if (classData.length === 0) return;
    const classesJson = JSON.stringify(classData);
    const targetPath = path.startsWith('/') ? path.slice(1) : path;
    const url = buildScreenerUrl(targetPath, { classes: classesJson });
    goto(isEmbed ? url + (url.includes('?') ? '&' : '?') + 'embed=true' : url);
  }

  function handleShowAllOwners(classData) {
    navigateTo('/screener/results', classData);
  }
  function handleSearchSpecificOwners(classData) {
    navigateTo('/screener/owners', classData);
  }
  function clearSelection() {
    step1?.clearSelection();
  }

  onMount(() => {
    if (!isEmbed) return;
    const h = readScreenerHash();
    if (h.classes) {
      try {
        const parsed = JSON.parse(h.classes);
        const first = parsed?.[0];
        if (first?.id || first?.assetClassId) {
          initialClassId = first.id || first.assetClassId;
          if (first.filters?.geography) {
            initialGeoFilters = Array.isArray(first.filters.geography)
              ? first.filters.geography
              : [first.filters.geography];
          }
        }
      } catch {
        /* ignore */
      }
    }
  });

  function buildMailto(subject, bodyLines) {
    const subjectEncoded = encodeURIComponent(subject);
    const bodyEncoded = encodeURIComponent(bodyLines.join('\n'));
    return `mailto:${GEM_DATA_EMAIL}?subject=${subjectEncoded}&body=${bodyEncoded}`;
  }

  const requestAssetClassHref = $derived.by(() =>
    buildMailto('Asset Class Screener request', [
      'Hi GEM team,',
      '',
      'I would like to request an additional asset class in the screener.',
      '',
      `Current selection: ${selectionSummary || 'None'}`,
      '',
      'Requested asset class:',
      'Use case:',
      'Desired filters/statuses:',
      '',
      'Thanks,',
    ])
  );

  const contactUsHref = $derived.by(() =>
    buildMailto('Asset Class Screener feedback', [
      'Hi GEM team,',
      '',
      'I have feedback about the Asset Class Screener.',
      '',
      `Current selection: ${selectionSummary || 'None'}`,
      '',
      'Message:',
      '',
      'Thanks,',
    ])
  );
</script>

<svelte:head>
  <title>Asset Class Screener — Global Energy Monitor</title>
  <meta
    name="description"
    content="Screen and analyze corporate ownership in specific classes of energy assets such as coal plants, gas infrastructure, and steel facilities."
  />
  <SeoMeta
    title="Asset Class Screener — Global Energy Monitor"
    description="Screen and analyze corporate ownership in specific classes of energy assets such as coal plants, gas infrastructure, and steel facilities."
    image="/og/screener.png"
  />
</svelte:head>

{#snippet supportCta()}
  <section class="support-cta" aria-label="Screener feedback and requests">
    <div class="support-text">
      <h2>Not seeing what you need?</h2>
      <p>
        If a class is missing, send a request and include your use case. You can also share general
        screener feedback.
      </p>
    </div>
    <div class="support-actions">
      <a class="support-btn primary" href={requestAssetClassHref}>Request additional asset class</a>
      <a class="support-btn" href={contactUsHref}>Contact us</a>
    </div>
  </section>
{/snippet}

{#snippet pickerBody()}
  <ScreenerStep1
    bind:this={step1}
    onShowAllOwners={handleShowAllOwners}
    onSearchSpecificOwners={handleSearchSpecificOwners}
    {onSelectionChange}
    {initialClassId}
    {initialGeoFilters}
    {supportCta}
  />
{/snippet}

{#if isEmbed}
  <div class="screener-embed-shell">
    <ScreenerStepNav currentStep={1} classesParam={classesParamForNav} isEmbed={true} />
    {@render pickerBody()}
  </div>
{:else}
  <ScreenerLayout
    currentStep={1}
    subtitle="Evaluate companies' ownership stakes in classes of fossil fuel assets. Start by selecting an asset class below."
  >
    {#snippet headerRight()}
      <div class="selection-badge" class:has-selection={selectedClassId}>
        {#if selectedClassId}
          <span class="selection-text">{selectionSummary}</span>
          <button class="clear-btn" onclick={clearSelection}>&times;</button>
        {:else}
          <span class="selection-text">None selected yet</span>
        {/if}
      </div>
    {/snippet}
    {@render pickerBody()}
  </ScreenerLayout>
{/if}

<style>
  .screener-embed-shell {
    width: 100%;
    font-family: var(--font-family);
  }
  .screener-embed-shell :global(.picker-section) {
    padding: var(--space-4) var(--space-5) 0;
  }

  .selection-badge {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: var(--space-3);
    align-items: center;
    padding: var(--space-4) var(--space-6);
    background: var(--gem-teal);
    color: white;
    border-radius: var(--radius-sm);
    font-size: var(--font-size-lg);
    min-width: 180px;
    max-width: 420px;
  }

  .selection-badge.has-selection {
    background: var(--gem-primary-blue);
  }

  .selection-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .clear-btn {
    font-size: var(--font-size-xl);
    color: rgba(255, 255, 255, 0.7);
    background: none;
    border: none;
    cursor: pointer;
    line-height: 1;
    padding: 0;
    min-width: 32px;
    min-height: 32px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .clear-btn:hover {
    color: white;
  }

  .support-cta {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: var(--space-4);
    padding: var(--space-5);
    margin: 0 0 var(--space-6) 0;
    border: 1px solid var(--color-gray-200, #e5e7eb);
    border-radius: var(--radius-sm);
    background: var(--color-bg-secondary, #f8fafc);
  }

  .support-text h2 {
    margin: 0 0 var(--space-1) 0;
    font-size: var(--font-size-lg);
    color: var(--color-text-primary);
  }

  .support-text p {
    margin: 0;
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
    line-height: 1.5;
    max-width: 56ch;
  }

  .support-actions {
    display: flex;
    gap: var(--space-2);
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .support-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    text-decoration: none;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-border, #cbd5e1);
    color: var(--color-text-primary);
    background: var(--color-bg-primary, #fff);
    font-size: var(--font-size-sm);
    font-weight: 600;
    white-space: nowrap;
  }

  .support-btn.primary {
    background: var(--gem-primary-blue);
    color: white;
    border-color: var(--gem-primary-blue);
  }

  .support-btn:hover {
    border-color: var(--color-gray-400, #9ca3af);
  }

  .support-btn.primary:hover {
    filter: brightness(0.95);
  }

  @media (max-width: 768px) {
    .selection-badge {
      max-width: 100%;
    }

    .support-btn {
      min-height: 44px;
    }

    .support-cta {
      flex-direction: column;
      align-items: stretch;
    }

    .support-actions {
      justify-content: flex-start;
    }
  }
</style>
