<script>
  import { base } from '$app/paths';

  export let data;

  const { entity, columns } = data;

  // Define priority columns for display
  const priorityFields = [
    'full_name',
    'entity_type',
    'legal_entity_type',
    'registration_country',
    'headquarters_country',
    'publicly_listed',
    'parent_entity',
    'subsidiary_count'
  ];

  // External IDs (often country-specific)
  const externalIdFields = columns.filter(c => {
    const lower = c.toLowerCase();
    return lower.includes('lei') ||
           lower.includes('cik') ||
           lower.includes('cnpj') ||
           lower.includes('cin') ||
           lower.includes('isin') ||
           lower.includes('cusip');
  });

  // Group remaining columns
  const specialCols = [...priorityFields, ...externalIdFields];
  const otherCols = columns.filter(c => !specialCols.includes(c) && entity[c]);

  // Format field names for display
  function formatField(fieldName) {
    return fieldName
      .replace(/_/g, ' ')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  // Check if value should be displayed
  function shouldDisplay(value) {
    return value !== null && value !== undefined && value !== '';
  }
</script>

<svelte:head>
  <title>{entity['full_name'] || `Entity ${entity['gem entity id']}`} — GEM Viz</title>
</svelte:head>

<main>
  <header>
    <a href="{base}/" class="back-link">← Home</a>
    <span class="entity-type">Entity Profile</span>
  </header>

  <article class="entity-detail">
    <h1>{entity['full_name'] || `ID: ${entity['gem entity id']}`}</h1>

    <div class="meta-grid">
      {#if entity['entity_type'] && shouldDisplay(entity['entity_type'])}
        <div class="meta-item">
          <span class="label">Entity Type</span>
          <span class="value">{entity['entity_type']}</span>
        </div>
      {/if}

      {#if entity['legal_entity_type'] && shouldDisplay(entity['legal_entity_type'])}
        <div class="meta-item">
          <span class="label">Legal Entity Type</span>
          <span class="value">{entity['legal_entity_type']}</span>
        </div>
      {/if}

      {#if entity['registration_country'] && shouldDisplay(entity['registration_country'])}
        <div class="meta-item">
          <span class="label">Registered In</span>
          <span class="value">{entity['registration_country']}</span>
        </div>
      {/if}

      {#if entity['headquarters_country'] && shouldDisplay(entity['headquarters_country'])}
        <div class="meta-item">
          <span class="label">Headquarters</span>
          <span class="value">{entity['headquarters_country']}</span>
        </div>
      {/if}

      {#if entity['publicly_listed'] && shouldDisplay(entity['publicly_listed'])}
        <div class="meta-item">
          <span class="label">Publicly Listed</span>
          <span class="value badge" class:yes={entity['publicly_listed'] === 'yes' || entity['publicly_listed'] === true}>
            {entity['publicly_listed']}
          </span>
        </div>
      {/if}

      {#if entity['parent_entity'] && shouldDisplay(entity['parent_entity'])}
        <div class="meta-item">
          <span class="label">Parent Entity</span>
          <span class="value">{entity['parent_entity']}</span>
        </div>
      {/if}
    </div>

    {#if externalIdFields.length > 0}
      <section class="external-ids">
        <h2>External Identifiers</h2>
        <dl>
          {#each externalIdFields as field}
            {#if shouldDisplay(entity[field])}
              <div class="id-pair">
                <dt>{formatField(field)}</dt>
                <dd>{entity[field]}</dd>
              </div>
            {/if}
          {/each}
        </dl>
      </section>
    {/if}

    {#if otherCols.length > 0}
      <section class="properties">
        <h2>Additional Information</h2>
        <dl>
          {#each otherCols as col}
            {#if shouldDisplay(entity[col])}
              <div class="property">
                <dt>{formatField(col)}</dt>
                <dd>{entity[col]}</dd>
              </div>
            {/if}
          {/each}
        </dl>
      </section>
    {/if}

    <section class="metadata">
      <p class="gem-id">GEM Entity ID: <code>{entity['gem entity id']}</code></p>
    </section>
  </article>
</main>

<style>
  main {
    width: 100%;
    margin: 0;
    padding: 40px;
    max-width: 1200px;
    margin: 0 auto;
  }

  header {
    border-bottom: 1px solid #000;
    padding-bottom: 15px;
    margin-bottom: 30px;
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }

  .back-link {
    color: #000;
    text-decoration: underline;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .back-link:hover {
    text-decoration: none;
  }

  .entity-type {
    font-size: 10px;
    color: #999;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .entity-detail {
    font-family: Georgia, serif;
  }

  h1 {
    font-size: 32px;
    font-weight: normal;
    margin: 0 0 30px 0;
    line-height: 1.2;
  }

  h2 {
    font-size: 18px;
    font-weight: normal;
    margin: 40px 0 20px 0;
    border-bottom: 1px solid #ddd;
    padding-bottom: 10px;
  }

  .meta-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 20px;
    margin-bottom: 40px;
    padding: 20px;
    background: #fafafa;
    border: 1px solid #ddd;
  }

  .meta-item {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .label {
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #999;
    font-weight: bold;
  }

  .value {
    font-size: 14px;
    color: #000;
  }

  .value.badge {
    padding: 4px 8px;
    background: #f0f0f0;
    border-radius: 3px;
    font-size: 12px;
    font-weight: bold;
    display: inline-block;
    width: fit-content;
  }

  .value.badge.yes {
    background: #e8f5e9;
    color: #2e7d32;
  }

  .external-ids {
    margin: 40px 0;
    padding: 20px;
    background: #f5f5f5;
    border: 1px solid #ddd;
  }

  .external-ids dl {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 15px;
  }

  .id-pair {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .id-pair dt {
    font-size: 10px;
    font-weight: bold;
    color: #666;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }

  .id-pair dd {
    font-size: 13px;
    color: #000;
    margin: 0;
    font-family: 'Monaco', 'Courier New', monospace;
    background: #fff;
    padding: 6px;
    border-radius: 2px;
  }

  .properties {
    margin: 40px 0;
  }

  .properties dl {
    display: grid;
    grid-template-columns: 1fr;
    gap: 15px;
  }

  .property {
    display: grid;
    grid-template-columns: 250px 1fr;
    gap: 20px;
    padding: 12px 0;
    border-bottom: 1px solid #f0f0f0;
  }

  .property:last-child {
    border-bottom: none;
  }

  .property dt {
    font-size: 11px;
    font-weight: bold;
    color: #666;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }

  .property dd {
    font-size: 13px;
    color: #000;
    margin: 0;
  }

  .metadata {
    margin-top: 60px;
    padding-top: 20px;
    border-top: 1px solid #ddd;
  }

  .gem-id {
    font-size: 12px;
    color: #999;
  }

  .gem-id code {
    background: #f5f5f5;
    padding: 2px 6px;
    border-radius: 2px;
    font-family: 'Monaco', 'Courier New', monospace;
  }

  @media (max-width: 768px) {
    .property {
      grid-template-columns: 1fr;
      gap: 5px;
    }

    .meta-grid {
      grid-template-columns: 1fr;
    }

    .external-ids dl {
      grid-template-columns: 1fr;
    }
  }
</style>
