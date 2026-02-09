/**
 * Gembot Tool Definitions
 * OpenRouter/Claude tool definitions for the chat API
 */

import { TRACKERS, STATUS_VALUES, COUNTRIES } from '$lib/data-config/tracker-schema';

export const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'search_entities',
      description:
        'Search for companies/entities by name. Use this to find entity IDs for further queries.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search term (company name or partial name)' },
          country: { type: 'string', description: 'Optional: Filter by headquarters country', enum: COUNTRIES },
          limit: { type: 'number', description: 'Max results to return (default 10)' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_entity_details',
      description: 'Get detailed information about a specific entity/company by its ID.',
      parameters: {
        type: 'object',
        properties: {
          entity_id: { type: 'string', description: 'The entity ID (e.g., E100000000650)' },
        },
        required: ['entity_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_entity_portfolio',
      description: "Get what an entity owns - its subsidiaries and direct holdings.",
      parameters: {
        type: 'object',
        properties: {
          entity_id: { type: 'string', description: 'The entity ID to look up' },
        },
        required: ['entity_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_entity_owners',
      description: 'Get who owns an entity - trace ownership upward.',
      parameters: {
        type: 'object',
        properties: {
          entity_id: { type: 'string', description: 'The entity ID to trace owners for' },
        },
        required: ['entity_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_ownership_graph',
      description: 'Get the full ownership graph for an entity or asset. Direction "up" traces to owners, "down" traces to owned entities/assets.',
      parameters: {
        type: 'object',
        properties: {
          root_id: { type: 'string', description: 'The entity or asset ID to start from' },
          direction: { type: 'string', enum: ['up', 'down'], description: 'Direction to traverse' },
          max_depth: { type: 'number', description: 'Maximum depth to traverse (default 5)' },
        },
        required: ['root_id', 'direction'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_assets',
      description: 'Search for energy assets (plants, mines, pipelines). Geographic filtering is COUNTRY-level only.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search term - matches asset names' },
          status: { type: 'string', description: 'Filter by status', enum: STATUS_VALUES as unknown as string[] },
          country: { type: 'string', description: 'Filter by country (ONLY country level)' },
          limit: { type: 'number', description: 'Max results (default 20)' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_asset_details',
      description: 'Get detailed information about a specific asset by its ID.',
      parameters: {
        type: 'object',
        properties: {
          asset_id: { type: 'string', description: 'The asset ID' },
        },
        required: ['asset_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_top_owners',
      description: 'Get the biggest owners ranked by asset count. For country-specific queries, use get_top_owners_by_country instead.',
      parameters: {
        type: 'object',
        properties: {
          tracker: { type: 'string', enum: TRACKERS as unknown as string[], description: 'Filter to a specific asset type' },
          limit: { type: 'number', description: 'How many top owners to return (default 10)' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_top_owners_by_country',
      description: 'Get the biggest owners of assets IN A SPECIFIC COUNTRY.',
      parameters: {
        type: 'object',
        properties: {
          country: { type: 'string', description: 'The country to search in' },
          tracker: { type: 'string', enum: TRACKERS as unknown as string[], description: 'Filter to a specific asset type' },
          limit: { type: 'number', description: 'How many top owners to return (default 10)' },
        },
        required: ['country'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_country_breakdown',
      description: 'Get asset counts and capacity by country. Shows geographic distribution.',
      parameters: {
        type: 'object',
        properties: {
          tracker: { type: 'string', enum: TRACKERS as unknown as string[], description: 'Filter to a specific asset type' },
          limit: { type: 'number', description: 'How many top countries to return (default 15)' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_status_breakdown',
      description: 'Get counts by asset status (operating, proposed, construction, retired, etc).',
      parameters: {
        type: 'object',
        properties: {
          tracker: { type: 'string', enum: TRACKERS as unknown as string[], description: 'Filter to a specific asset type' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_tracker_summary',
      description: 'Get high-level statistics for all asset types.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_owner_geographic_footprint',
      description: "Get which countries an owner has assets in.",
      parameters: {
        type: 'object',
        properties: {
          entity_id: { type: 'string', description: 'The entity ID to analyze' },
        },
        required: ['entity_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'compare_entities',
      description: 'Compare two or more entities side by side.',
      parameters: {
        type: 'object',
        properties: {
          entity_ids: { type: 'array', items: { type: 'string' }, description: 'Array of entity IDs to compare (2-4)' },
        },
        required: ['entity_ids'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'find_common_owners',
      description: 'Find entities that own assets in multiple specified countries or trackers.',
      parameters: {
        type: 'object',
        properties: {
          countries: { type: 'array', items: { type: 'string' }, description: 'Countries to find common owners across' },
          tracker: { type: 'string', enum: TRACKERS as unknown as string[], description: 'Filter to a specific asset type' },
        },
        required: ['countries'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generate_screener_url',
      description: 'Generate a URL to the visual screener tool with pre-filled filters.',
      parameters: {
        type: 'object',
        properties: {
          tracker: { type: 'string', enum: TRACKERS as unknown as string[], description: 'Asset type to screen' },
          status: { type: 'string', enum: STATUS_VALUES as unknown as string[], description: 'Filter by status' },
          country: { type: 'string', description: 'Filter by country' },
        },
        required: ['tracker'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generate_map',
      description: 'Generate an interactive map showing asset locations.',
      parameters: {
        type: 'object',
        properties: {
          entity_ids: { type: 'array', items: { type: 'string' }, description: 'Entity IDs - works best for operators' },
          asset_ids: { type: 'array', items: { type: 'string' }, description: 'Specific asset IDs from search_assets' },
          title: { type: 'string', description: 'Optional title for the map' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_investigation_cart',
      description: "Get the current contents of the user's investigation cart.",
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_to_cart',
      description: "Add assets or entities to the user's investigation cart.",
      parameters: {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string', description: 'Asset ID or Entity ID' },
                name: { type: 'string', description: 'Name of the item' },
                type: { type: 'string', enum: ['asset', 'entity'], description: 'Type of item' },
                tracker: { type: 'string', description: 'For assets: the tracker type' },
                metadata: { type: 'object', properties: { country: { type: 'string' }, status: { type: 'string' }, capacity: { type: 'number' } } },
              },
              required: ['id', 'name', 'type'],
            },
            description: 'Items to add to the cart',
          },
        },
        required: ['items'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'remove_from_cart',
      description: "Remove specific items from the user's investigation cart.",
      parameters: {
        type: 'object',
        properties: {
          ids: { type: 'array', items: { type: 'string' }, description: 'IDs of items to remove' },
        },
        required: ['ids'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'clear_cart',
      description: "Clear all items from the user's investigation cart.",
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
];

export interface CartItem {
  id: string;
  name: string;
  type: 'asset' | 'entity';
  tracker?: string;
  metadata?: { country?: string; status?: string; capacity?: number };
}
