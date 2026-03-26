/**
 * Gembot utility functions
 * Extracted from +page.svelte to reduce file size
 */

import maplibregl from 'maplibre-gl';
import { colorByTracker, colors } from '$lib/design-tokens';
import { BASEMAP_POSITRON } from '$lib/map-config';

// Suggested queries for quick start
export const SUGGESTIONS = [
  { icon: '›', label: 'Who owns coal plants in India?' },
  { icon: '›', label: "What's in BlackRock's energy portfolio?" },
  { icon: '›', label: 'Show me retiring coal plants in Germany' },
  { icon: '›', label: 'Find gas pipelines under construction' },
  { icon: '›', label: 'Who are the biggest steel plant owners?' },
];

// Quick entity searches
export const QUICK_ENTITIES = [
  { name: 'BlackRock', id: 'E100000000650' },
  { name: 'Vanguard', id: 'E100000000651' },
  { name: 'State Grid Corporation', id: 'E100000001234' },
  { name: 'Adani Group', id: 'E100000002345' },
];

export function formatToolName(name: string): string {
  return name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function getToolIcon(_name: string): string {
  // Minimal indicator - no emoji
  return '›';
}

// Format tool args for display
export function formatToolArgs(args: Record<string, unknown> | undefined): string {
  if (!args || Object.keys(args).length === 0) return '';

  const parts: string[] = [];
  for (const [key, value] of Object.entries(args)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      if (value.length > 0) {
        parts.push(`${key}: [${value.length} items]`);
      }
    } else if (typeof value === 'object') {
      parts.push(`${key}: {...}`);
    } else {
      // Truncate long strings
      const strVal = String(value);
      parts.push(`${key}: "${strVal.length > 30 ? strVal.slice(0, 30) + '...' : strVal}"`);
    }
  }
  return parts.join(', ');
}

// Get a short summary of what the tool is doing
export function getToolSummary(toolName: string, args?: Record<string, unknown>): string {
  switch (toolName) {
    case 'search_entities':
      return args?.query
        ? `Search: "${args.query}"${args?.country ? ` (${args.country})` : ''}`
        : 'Search entities';
    case 'search_assets':
      return args?.tracker
        ? `Search ${args.tracker}${args?.country ? ` in ${args.country}` : ''}${args?.q ? `: "${args.q}"` : ''}`
        : 'Search assets';
    case 'get_entity_details':
      return args?.entity_id ? `Entity ${args.entity_id}` : 'Get entity details';
    case 'get_entity_portfolio':
      return args?.entity_id ? `Portfolio: ${args.entity_id}` : 'Get portfolio';
    case 'get_entity_owners':
      return args?.entity_id ? `Owners of ${args.entity_id}` : 'Trace owners';
    case 'get_asset_details':
      return args?.asset_id ? `Asset ${args.asset_id}` : 'Get asset';
    case 'get_ownership_graph':
      return args?.root_id
        ? `Graph: ${args.root_id} (${args?.direction || 'down'})`
        : 'Build graph';
    case 'get_top_owners':
      return `Top ${args?.tracker || 'energy'} owners${args?.country ? ` (${args.country})` : ''}`;
    case 'get_top_owners_by_country':
      return args?.country
        ? `Top ${args?.tracker || 'energy'} owners in ${args.country}`
        : 'Top owners by country';
    case 'get_country_breakdown':
      return args?.entity_id ? `Country breakdown: ${args.entity_id}` : 'Get country breakdown';
    case 'generate_map':
      return args?.title ? `Map: ${args.title}` : 'Generate map';
    case 'get_status_breakdown':
      return args?.entity_id ? `Status breakdown: ${args.entity_id}` : 'Get status breakdown';
    case 'get_tracker_summary':
      return args?.entity_id ? `Tracker summary: ${args.entity_id}` : 'Get tracker summary';
    case 'generate_screener_url':
      return 'Generate screener link';
    case 'get_investigation_cart':
      return 'Reading investigation cart';
    case 'add_to_cart':
      return `Adding ${(args?.items as unknown[])?.length || 0} items to cart`;
    case 'remove_from_cart':
      return `Removing ${(args?.ids as unknown[])?.length || 0} items from cart`;
    case 'clear_cart':
      return 'Clearing investigation cart';
    default:
      return toolName.replace(/_/g, ' ');
  }
}

export interface ToolCall {
  tool: string;
  args?: Record<string, unknown>;
  result?: Record<string, unknown>;
}

// Check if tool result has entity data to render visually
export function hasEntityResults(toolCall: ToolCall): boolean {
  const entitiesTools = ['search_entities', 'get_entity_portfolio', 'get_entity_owners'];
  return entitiesTools.includes(toolCall.tool) && !!toolCall.result;
}

// Check if tool result has asset data to render visually
export function hasAssetResults(toolCall: ToolCall): boolean {
  const assetTools = ['search_assets', 'get_asset_details'];
  return assetTools.includes(toolCall.tool) && !!toolCall.result;
}

// Extract entity items from various tool result shapes
export function getEntityItems(toolCall: ToolCall): Array<Record<string, unknown>> {
  const result = toolCall.result;
  if (!result) return [];

  // search_entities returns { entities: [...] }
  if (result.entities) return result.entities as Array<Record<string, unknown>>;

  // get_entity_portfolio returns { subsidiaries: [...] }
  if (result.subsidiaries) return result.subsidiaries as Array<Record<string, unknown>>;

  // get_entity_owners returns { owners: [...] }
  if (result.owners) return result.owners as Array<Record<string, unknown>>;

  return [];
}

// Extract asset items from tool results
export function getAssetItems(toolCall: ToolCall): Array<Record<string, unknown>> {
  const result = toolCall.result;
  if (!result) return [];

  // search_assets returns { assets: [...] }
  if (result.assets) return result.assets as Array<Record<string, unknown>>;

  // get_asset_details returns a single asset
  if (result.id && result.name) return [result];

  return [];
}

// Check if tool result has analytics data (rankings, breakdowns)
export function hasAnalyticsResults(toolCall: ToolCall): boolean {
  const analyticsTools = [
    'get_top_owners',
    'get_country_breakdown',
    'get_status_breakdown',
    'get_tracker_summary',
    'get_owner_geographic_footprint',
  ];
  return analyticsTools.includes(toolCall.tool) && !!toolCall.result;
}

// Check if tool result has comparison data
export function hasComparisonResults(toolCall: ToolCall): boolean {
  return (
    toolCall.tool === 'compare_entities' &&
    !!(toolCall.result as Record<string, unknown>)?.comparisons
  );
}

// Check if tool result has a screener URL
export function hasScreenerUrl(toolCall: ToolCall): boolean {
  return (
    toolCall.tool === 'generate_screener_url' && !!(toolCall.result as Record<string, unknown>)?.url
  );
}

// Check if tool result has map data
export function hasMapResults(toolCall: ToolCall): boolean {
  return (
    toolCall.tool === 'generate_map' && (toolCall.result as Record<string, unknown>)?.type === 'map'
  );
}

export interface MapFeature {
  id: string;
  name: string;
  lat: number;
  lng: number;
  tracker: string;
  status: string;
  country: string;
  capacity?: number;
  owner?: string;
}

/**
 * Create a map action for Svelte use:action directive
 */
export function createMapAction(mapInstances: Map<string, maplibregl.Map>) {
  return function mapAction(
    container: HTMLElement,
    params: { id: string; features: MapFeature[] }
  ) {
    const { id, features } = params;

    if (mapInstances.has(id) || features.length === 0) {
      return { destroy() {} };
    }

    // Small delay to ensure container is rendered
    setTimeout(() => {
      const map = new maplibregl.Map({
        container,
        style: BASEMAP_POSITRON,
        center: [0, 20],
        zoom: 1,
        maxZoom: 12,
      });

      map.addControl(new maplibregl.NavigationControl(), 'top-right');

      map.on('load', () => {
        // Add source
        map.addSource('assets', {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: features.map((f) => ({
              type: 'Feature' as const,
              geometry: {
                type: 'Point' as const,
                coordinates: [f.lng, f.lat],
              },
              properties: {
                id: f.id,
                name: f.name,
                tracker: f.tracker,
                status: f.status,
                country: f.country,
                capacity: f.capacity,
                owner: f.owner,
                color: colorByTracker.get(f.tracker) || colors.primaryBlue,
              },
            })),
          },
        });

        // Add circle layer
        map.addLayer({
          id: 'assets-circles',
          type: 'circle',
          source: 'assets',
          paint: {
            'circle-radius': 8,
            'circle-color': ['get', 'color'],
            'circle-stroke-color': '#fff',
            'circle-stroke-width': 2,
            'circle-opacity': 0.9,
          },
        });

        // Fit bounds
        if (features.length > 0) {
          const bounds = new maplibregl.LngLatBounds();
          features.forEach((f) => bounds.extend([f.lng, f.lat]));
          map.fitBounds(bounds, { padding: 50, maxZoom: 8 });
        }

        // Add popup on hover
        const popup = new maplibregl.Popup({
          closeButton: false,
          closeOnClick: false,
        });

        map.on('mouseenter', 'assets-circles', (e) => {
          map.getCanvas().style.cursor = 'pointer';
          const props = e.features?.[0]?.properties;
          if (props) {
            popup
              .setLngLat(e.lngLat)
              .setHTML(
                `
                <div style="font-size: 12px; line-height: 1.4;">
                  <strong>${props.name}</strong><br/>
                  ${props.tracker} • ${props.status}<br/>
                  ${props.country}${props.capacity ? ` • ${props.capacity} MW` : ''}
                </div>
              `
              )
              .addTo(map);
          }
        });

        map.on('mouseleave', 'assets-circles', () => {
          map.getCanvas().style.cursor = '';
          popup.remove();
        });
      });

      mapInstances.set(id, map);
    }, 100);

    return {
      destroy() {
        const map = mapInstances.get(id);
        if (map) {
          map.remove();
          mapInstances.delete(id);
        }
      },
    };
  };
}
