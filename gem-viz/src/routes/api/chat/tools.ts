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
        'Search for companies/entities by name. Use this to find entity IDs for further queries. Returns entity ID, name, full name, and HQ country.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description:
              'Search term (company name or partial name). Also accepts entity IDs like E100000000650.',
          },
          country: {
            type: 'string',
            description: 'Filter by headquarters country',
            enum: COUNTRIES,
          },
          include_portfolio: {
            type: 'boolean',
            description:
              'If true, also fetch how many subsidiaries/holdings each result has (slower but more useful for investigation)',
          },
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
      description:
        'Get what an entity owns - its subsidiaries and direct holdings. Use include_assets to also search for physical assets (plants, mines, pipelines) associated with this entity.',
      parameters: {
        type: 'object',
        properties: {
          entity_id: { type: 'string', description: 'The entity ID to look up' },
          include_assets: {
            type: 'boolean',
            description:
              'If true, also search for physical assets owned by this entity (default: false)',
          },
        },
        required: ['entity_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_entity_owners',
      description:
        'Get who owns an entity - trace ownership upward. Returns direct parent owners with ownership percentages.',
      parameters: {
        type: 'object',
        properties: {
          entity_id: { type: 'string', description: 'The entity ID to trace owners for' },
          include_ultimate: {
            type: 'boolean',
            description:
              'If true, also trace the full ownership chain upward to find ultimate parent(s) (default: false)',
          },
        },
        required: ['entity_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_ownership_graph',
      description:
        'Get the full ownership graph for an entity or asset. Direction "up" traces to ultimate owners, "down" traces to subsidiaries/assets. Returns nodes and edges with ownership percentages.',
      parameters: {
        type: 'object',
        properties: {
          root_id: { type: 'string', description: 'The entity or asset ID to start from' },
          direction: {
            type: 'string',
            enum: ['up', 'down', 'both'],
            description:
              'Direction to traverse: "up" for owners, "down" for holdings, "both" for full picture',
          },
          max_depth: {
            type: 'number',
            description:
              'Maximum depth to traverse (default 5, max 10). Higher depth = more complete but slower.',
          },
        },
        required: ['root_id', 'direction'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_assets',
      description:
        'Search for energy assets (plants, mines, pipelines). Geographic filtering is COUNTRY-level only. Returns owners[] for each asset with entity_id, name, and ownership_share. Supports multi-value filters (e.g., multiple statuses or countries).',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search term - matches asset names (e.g., "adani", "bowline point")',
          },
          tracker: {
            type: 'string',
            enum: TRACKERS as unknown as string[],
            description: 'Filter by asset type (single value)',
          },
          statuses: {
            type: 'array',
            items: { type: 'string', enum: STATUS_VALUES as unknown as string[] },
            description:
              'Filter by one or more statuses (e.g., ["operating", "retired"]). All lowercase.',
          },
          status: {
            type: 'string',
            description: 'Filter by single status (DEPRECATED: use statuses[] instead)',
            enum: STATUS_VALUES as unknown as string[],
          },
          countries: {
            type: 'array',
            items: { type: 'string' },
            description: 'Filter by one or more countries (e.g., ["China", "India"])',
          },
          country: {
            type: 'string',
            description: 'Filter by single country (DEPRECATED: use countries[] instead)',
          },
          include_facets: {
            type: 'boolean',
            description:
              'If true, also return faceted counts (status breakdown, country breakdown, type breakdown) for the current filters. Useful for understanding the full picture beyond the returned page.',
          },
          limit: { type: 'number', description: 'Max results (default 20, max 500)' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_asset_details',
      description:
        'Get detailed information about a specific asset by its ID. Returns location, capacity, status, owner info, and coordinates.',
      parameters: {
        type: 'object',
        properties: {
          asset_id: {
            type: 'string',
            description: 'The asset ID (e.g., G12345 for plants, P0061 for pipelines)',
          },
          include_ownership_chain: {
            type: 'boolean',
            description:
              'If true, also trace the ownership chain upward from the direct owner to ultimate parent (default: false)',
          },
        },
        required: ['asset_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_top_owners',
      description:
        'Get the biggest owners ranked by asset count or capacity. Samples up to 2000 assets for speed. For country-specific queries, use get_top_owners_by_country instead.',
      parameters: {
        type: 'object',
        properties: {
          tracker: {
            type: 'string',
            enum: TRACKERS as unknown as string[],
            description: 'Filter to a specific asset type',
          },
          metric: {
            type: 'string',
            enum: ['assets', 'capacity'],
            description: 'Rank by asset count or total capacity (default: assets)',
          },
          limit: {
            type: 'number',
            description: 'How many top owners to return (default 10, max 50)',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_top_owners_by_country',
      description:
        'Get the biggest owners of assets IN A SPECIFIC COUNTRY. Returns entity names, IDs, and asset counts ranked by holdings.',
      parameters: {
        type: 'object',
        properties: {
          country: {
            type: 'string',
            description: 'The country to search in (e.g., "India", "United States")',
          },
          tracker: {
            type: 'string',
            enum: TRACKERS as unknown as string[],
            description: 'Filter to a specific asset type',
          },
          status: {
            type: 'string',
            enum: STATUS_VALUES as unknown as string[],
            description: 'Filter by status (e.g., "operating" for active assets only)',
          },
          limit: {
            type: 'number',
            description: 'How many top owners to return (default 10, max 50)',
          },
        },
        required: ['country'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_country_breakdown',
      description:
        'Get exact asset counts by country using API facets. Shows geographic distribution ranked by count. Use for "where are X located?" or "which countries have the most Y?" Supports cross-filtering by status.',
      parameters: {
        type: 'object',
        properties: {
          tracker: {
            type: 'string',
            enum: TRACKERS as unknown as string[],
            description: 'Filter to a specific asset type',
          },
          status: {
            type: 'string',
            enum: STATUS_VALUES as unknown as string[],
            description:
              'Cross-filter by status (e.g., "operating" to see countries with operating assets only)',
          },
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
      description:
        'Get exact counts by asset status (operating, proposed, construction, retired, etc) using API facets. Returns all status values with their counts. Perfect for "how many X are operating?" or "what is the pipeline of new Y?" Supports cross-filtering by country.',
      parameters: {
        type: 'object',
        properties: {
          tracker: {
            type: 'string',
            enum: TRACKERS as unknown as string[],
            description: 'Filter to a specific asset type',
          },
          country: {
            type: 'string',
            description:
              'Cross-filter by country (e.g., "China" to see status breakdown for China only)',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_tracker_summary',
      description:
        'Get high-level statistics for all 8 asset types in a single API call. Returns exact asset counts per type and overall status breakdown. Use for "overview of the database" or "how many assets does GEM track?"',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_owner_geographic_footprint',
      description:
        'Get which countries an owner has assets in, with asset counts per country. Searches up to 500 assets associated with the entity name.',
      parameters: {
        type: 'object',
        properties: {
          entity_id: { type: 'string', description: 'The entity ID to analyze' },
          tracker: {
            type: 'string',
            enum: TRACKERS as unknown as string[],
            description:
              'Filter to a specific asset type (e.g., only show countries where entity has coal plants)',
          },
        },
        required: ['entity_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'compare_entities',
      description:
        'Compare two or more entities side by side on subsidiaries, geographic reach, and top countries. Returns a structured comparison for easy analysis.',
      parameters: {
        type: 'object',
        properties: {
          entity_ids: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of entity IDs to compare (2-4)',
          },
          tracker: {
            type: 'string',
            enum: TRACKERS as unknown as string[],
            description:
              'Focus comparison on a specific asset type (e.g., compare coal holdings only)',
          },
        },
        required: ['entity_ids'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'find_common_owners',
      description:
        'Find entities that own assets in ALL of the specified countries. Great for identifying multinational operators or investors with cross-border portfolios.',
      parameters: {
        type: 'object',
        properties: {
          countries: {
            type: 'array',
            items: { type: 'string' },
            description: 'Countries to find common owners across (2-4 countries)',
          },
          tracker: {
            type: 'string',
            enum: TRACKERS as unknown as string[],
            description: 'Filter to a specific asset type',
          },
          min_assets: {
            type: 'number',
            description:
              'Minimum total assets an owner must have across all countries to be included (default: 2). Higher = more significant players only.',
          },
        },
        required: ['countries'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generate_screener_url',
      description:
        'Generate a URL to the visual screener tool with pre-filled filters. The screener shows ownership stakes across asset classes with interactive filtering.',
      parameters: {
        type: 'object',
        properties: {
          tracker: {
            type: 'string',
            enum: TRACKERS as unknown as string[],
            description: 'Asset type to screen',
          },
          status: {
            type: 'string',
            enum: STATUS_VALUES as unknown as string[],
            description: 'Filter by status',
          },
          country: { type: 'string', description: 'Filter by country' },
          description: {
            type: 'string',
            description: 'Brief description of what this screener link shows (displayed to user)',
          },
        },
        required: ['tracker'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generate_map',
      description:
        'Generate an interactive map showing asset locations. Can map by entity (all their assets), by specific asset IDs, or by search query.',
      parameters: {
        type: 'object',
        properties: {
          entity_ids: {
            type: 'array',
            items: { type: 'string' },
            description: 'Entity IDs — maps all assets they own',
          },
          asset_ids: {
            type: 'array',
            items: { type: 'string' },
            description: 'Specific asset IDs from search_assets',
          },
          query: {
            type: 'string',
            description:
              'Search term to find and map assets (e.g., "adani coal"). Alternative to providing IDs.',
          },
          tracker: {
            type: 'string',
            enum: TRACKERS as unknown as string[],
            description: 'Filter mapped assets to a specific type',
          },
          country: { type: 'string', description: 'Filter mapped assets to a specific country' },
          title: { type: 'string', description: 'Title for the map' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'open_compose_control',
      description:
        'Open or update the embedded Compose control deck inside Gembot. Use this when the user wants an interactive filter UI, wants to tune sliders live, or wants the compose view opened without leaving chat.',
      parameters: {
        type: 'object',
        properties: {
          mode: {
            type: 'string',
            enum: ['replace', 'merge', 'clear'],
            description:
              'How to apply filters to the compose deck. Use replace for a fresh filter set, merge to add filters to an existing set, or clear to reset the deck.',
          },
          trackers: {
            type: 'array',
            items: { type: 'string', enum: TRACKERS as unknown as string[] },
            description: 'One or more asset tracker types to select in the compose deck.',
          },
          statuses: {
            type: 'array',
            items: { type: 'string', enum: STATUS_VALUES as unknown as string[] },
            description: 'One or more statuses to select in the compose deck.',
          },
          countries: {
            type: 'array',
            items: { type: 'string' },
            description: 'Asset countries to select in the compose deck.',
          },
          state_provinces: {
            type: 'array',
            items: { type: 'string' },
            description: 'State or province filters to apply when useful.',
          },
          owner_countries: {
            type: 'array',
            items: { type: 'string' },
            description: 'Owner headquarters countries to select.',
          },
          owners: {
            type: 'array',
            items: { type: 'string' },
            description: 'Owner names to select.',
          },
          capacity_min: {
            type: 'number',
            description: 'Minimum capacity slider value in MW.',
          },
          capacity_max: {
            type: 'number',
            description: 'Maximum capacity slider value in MW.',
          },
          share_min: {
            type: 'number',
            description: 'Minimum ownership share slider value in percent.',
          },
          share_max: {
            type: 'number',
            description: 'Maximum ownership share slider value in percent.',
          },
          start_year_min: {
            type: 'number',
            description: 'Minimum start year slider value.',
          },
          start_year_max: {
            type: 'number',
            description: 'Maximum start year slider value.',
          },
          search: {
            type: 'string',
            description: 'Free text project or owner search to prefill.',
          },
          focus: {
            type: 'string',
            enum: ['filters', 'results'],
            description: 'Which part of the compose deck should be emphasized.',
          },
          panel_title: {
            type: 'string',
            description: 'Short title shown at the top of the embedded compose deck.',
          },
          message: {
            type: 'string',
            description: 'Short note to show in the deck after applying the filters.',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'discover_api_endpoints',
      description:
        'Read the Ownership API root endpoint registry to discover available endpoints, families, templates, and descriptions. Use this when the user wants an unusual backend query, schema details, or you need to inspect what routes exist before building an ad hoc request.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description:
              'Optional text filter for endpoint keys, URLs, or descriptions (for example: "catalog", "ownership", "assets").',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_api_ad_hoc',
      description:
        'Run a safe GET-only ad hoc query against the GEM Ownership API using a discovered endpoint key or relative path. Supports path params and query params for flexible exploration across entities, assets, ownership, catalog, segments, and metadata. Use this when built-in tools are too rigid but the backend likely has the answer.',
      parameters: {
        type: 'object',
        properties: {
          endpoint_key: {
            type: 'string',
            description:
              'Endpoint key from discover_api_endpoints, such as "assets", "entities_detail", "catalog_sources", or "metadata".',
          },
          path: {
            type: 'string',
            description:
              'Optional relative API path to query directly, such as "/catalog/sources/1", "/metadata", or "/entities/E100000000650/owners". Use this when the discovered endpoint list needs a concrete resource path.',
          },
          path_params: {
            type: 'object',
            description:
              'Path params used to fill endpoint templates like /entities/{id} or /assets/{id}. Example: {"id":"E100000000687"}.',
          },
          query_params: {
            type: 'object',
            description:
              'Arbitrary GET query params. Arrays should be passed as JSON arrays so repeated params can be generated. Example: {"root":"E100000000650","direction":"down","max_depth":2} for ownership_graph.',
          },
          preview_limit: {
            type: 'number',
            description:
              'How many list items to include in the preview payload (default 10, max 50).',
          },
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
                metadata: {
                  type: 'object',
                  properties: {
                    country: { type: 'string' },
                    status: { type: 'string' },
                    capacity: { type: 'number' },
                  },
                },
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
