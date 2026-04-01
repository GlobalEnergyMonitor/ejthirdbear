# GEM Viz

Interactive visualization platform for Global Energy Monitor data, powered by the GEM Ownership REST API.

## Features

- **Ownership Screener**: Filter and rank asset owners across 8 tracker types
- **ControlChain**: Searchable ownership tree explorer for assets and entities
- **Tracker FieldGuide**: Per-tracker field documentation and data distributions
- **Tracker Cards**: Rich, tracker-specific detail cards on asset pages (Coal Plant first)
- **Entity Explorer**: Ownership trees, portfolio flowers, network graphs
- **Interactive Maps**: MapLibre GL with geographic filtering
- **Compose**: Custom filtered views with charts and data export
- **Embeddable**: Any page works as an iframe via `?embed=true`

## Development

```bash
npm install
npm run dev
# Open http://localhost:3737
```

See [DEVELOPMENT.md](./DEVELOPMENT.md) for architecture details.

## Deploy

```bash
fly deploy
```

See [DEPLOY.md](./DEPLOY.md) for deployment configuration.

## Tech Stack

- **Framework**: SvelteKit 2 + Svelte 5
- **Data**: GEM Ownership REST API
- **Maps**: MapLibre GL
- **Styling**: Design tokens + utility classes
- **Build**: Vite
- **Deploy**: Fly.io (SSR)

## Routes

| Route | Description |
| --- | --- |
| `/` | Home — tracker overview with globe grid |
| `/explore` | Interactive dashboard with live API queries |
| `/controlchain` | Search assets/entities and explore ownership trees |
| `/fieldguide` | Tracker FieldGuide index (all trackers) |
| `/fieldguide/[tracker]` | Per-tracker field docs and data distributions |
| `/screener` | Ownership screener (multi-step wizard) |
| `/compose` | Custom data views with filters and charts |
| `/entity/[id]` | Entity detail — portfolio, ownership tree, map |
| `/asset/[id]` | Asset detail — tracker card, owners, structure |
| `/network` | Full ownership network graph |
| `/globe` | 3D globe visualization |
| `/report` | Build reports from selected assets/entities |
| `/embed/*` | Embeddable versions of key visualizations |

## Tracker Cards

The asset detail page (`/asset/[id]`) renders tracker-specific detail cards when available. These provide rich, specialized views beyond the generic asset metadata.

**How it works:** `TrackerCard.svelte` checks a registry for the asset's `facilityType`, dynamically loads the matching card component, fetches tracker-specific data, and renders it. If no card exists for a tracker type, nothing renders.

**Adding a new tracker card:**

1. Create the card component in `src/lib/components/cards/` (e.g., `GasPlantCard.svelte`)
2. Add an entry to the `registry` in `src/lib/components/cards/tracker-card-registry.ts`:

```ts
'Oil & Gas Plant': {
  loadComponent: () => import('./GasPlantCard.svelte'),
  fetchProps: async (asset) => {
    // fetch tracker-specific data, return as props object
    return { /* props for GasPlantCard */ };
  },
  label: 'Gas Plant Details',
},
```

3. Done — the asset page picks it up automatically.

**Currently implemented:** Coal Plant (via `CoalPlantCard.svelte` + `/locations/` API endpoint).

## Embeds

Any visualization can be made embeddable as a standalone iframe. Embeds live under `/embed/*` and share a layout that handles theming, auto-height, and cross-origin iframe support.

**Existing embeds:** asset, entity, ownership-flower, ownership-graph, network-3d, asset-ring, asset-search, project-card, tracker-factsheet, viz (generic).

**Creating a new embed:**

1. Create `src/routes/embed/my-widget/+page.svelte` — no `+page.ts` needed (inherits `ssr=false`, `prerender=false` from the embed layout):

```svelte
<script lang="ts">
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { errorMessage, boolParam, intParam } from '../embed-utils';

  // All config via URL params
  const id = $derived($page.url.searchParams.get('id'));
  const limit = $derived(intParam($page.url.searchParams.get('limit'), 10));

  let loading = $state(true);
  let error = $state<string | null>(null);
  let data = $state<any>(null);

  onMount(async () => {
    if (!id) { error = 'Missing required parameter: id'; loading = false; return; }
    try {
      const { getAsset } = await import('$lib/ownership-api');
      data = await getAsset(id);
    } catch (err) {
      error = errorMessage(err, 'Failed to load');
    } finally {
      loading = false;
    }
  });
</script>

<svelte:head>
  <title>My Widget — GEM Embed</title>
  <meta name="robots" content="noindex" />
</svelte:head>

{#if loading}
  <div class="embed-loading">Loading…</div>
{:else if error}
  <div class="embed-error"><p>{error}</p><p class="embed-hint">Example: ?id=G12345</p></div>
{:else}
  <!-- your component here -->
{/if}
```

2. That's it. The embed layout (`EmbedShell`) automatically handles:
   - `?theme=dark` — dark mode
   - `?padding=16` — container padding (px)
   - `?autoHeight=true` — postMessage to parent iframe with content height
   - `?branding=true` — "Powered by GEM" footer
   - COEP/COOP headers skipped for `/embed/` routes (cross-origin iframe support)

3. Use the embed:

```html
<iframe src="https://gem-viz.fly.dev/embed/my-widget?id=G12345&theme=dark"
        style="width:100%;border:none;" />
```

**Shared CSS classes** (provided by EmbedShell, no import needed): `.embed-loading`, `.embed-error`, `.embed-hint`, `.embed-empty`.

**Helpers** from `embed-utils.ts`: `errorMessage(err, fallback)`, `intParam(val, default)`, `boolParam(val, default)`, `loadEntityPortfolio(entityId)`.

## Tracker Metadata Configuration

The file `src/lib/data-config/tracker-metadata.ts` controls which trackers appear across the app — FieldGuide tabs, FieldGuide index cards, and anywhere `trackerMetadata` is referenced.

**How it works:** The `trackerMetadata` object maps URL slugs to tracker info (name, description, color, citation, etc.). Only trackers present in this object appear in the UI.

**Currently enabled:**

| Slug | Name | API catalog metadata |
| --- | --- | --- |
| `coal-plant` | Coal Plant | Yes (`coal-plants`) |
| `coal-mine` | Coal Mine | Yes (`coal-mines`) |

**Currently commented out** (no API catalog metadata yet):

| Slug | Name |
| --- | --- |
| `gas-plant` | Gas Plant |
| `iron-mine` | Iron Mine |
| `steel-plant` | Steel Plant |
| `gas-pipeline` | Gas Pipeline |
| `bioenergy` | Bioenergy Power |

**To re-enable a tracker:** Uncomment its entry in `trackerMetadata` in `tracker-metadata.ts`. The tracker will immediately appear in FieldGuide tabs and index. Verify that the API has catalog metadata for it at `GET /catalog/metadata?format=json` first.

## Changelog

See [CHANGELOG.md](./CHANGELOG.md).

---

(c) 2025-2026 Global Energy Monitor
