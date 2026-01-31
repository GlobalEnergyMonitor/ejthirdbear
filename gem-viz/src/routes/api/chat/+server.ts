/**
 * Gembot Chat API - Streaming Edition
 *
 * Handles chat messages and tool calls via OpenRouter (Claude Sonnet 4)
 * Streams responses back via Server-Sent Events for snappy UX
 */

import type { RequestHandler } from './$types';
import { OPENROUTER_API_KEY } from '$env/static/private';
import {
  listEntities,
  getEntity,
  getEntityOwned,
  getEntityOwners,
  getOwnershipGraph,
  listAssets,
  getAsset,
} from '$lib/ownership-api';
import {
  getTopOwnersServer,
  getCountryBreakdownServer,
  getStatusDistributionServer,
  getTrackerStatsServer,
  getOwnerCountryBreakdownServer,
} from '$lib/server/motherduck';
import { TRACKERS, STATUS_VALUES, COUNTRIES } from '$lib/data-config/tracker-schema';

// Model options
const MODEL = 'anthropic/claude-sonnet-4'; // Main orchestrator
const FAST_MODEL = 'anthropic/claude-3.5-haiku'; // Cheap helper for subtasks

/**
 * Quick Haiku call for simple subtasks (disambiguation, summarization)
 */
async function quickModel(prompt: string): Promise<string> {
  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://gem-viz.fly.dev',
      },
      body: JSON.stringify({
        model: FAST_MODEL,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 100,
      }),
    });
    if (!response.ok) return '';
    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  } catch {
    return '';
  }
}

// System prompt that defines Gembot's personality and capabilities
const SYSTEM_PROMPT = `You are Gembot, a friendly research assistant for the Global Energy Monitor (GEM) database. You help journalists and researchers explore data about energy infrastructure - coal plants, gas plants, steel facilities, pipelines, and mines.

=== GEM DATASET GUIDE ===

Global Energy Monitor tracks energy infrastructure worldwide: power plants, mines, pipelines, steel/cement facilities.

CORE CONCEPTS:
- Entity: A company/organization (investors, operators, governments). ID prefix: E (e.g., E100000000650 = BlackRock)
- Asset: Physical infrastructure (plant, mine, pipeline). ID prefixes: G (plants), M (coal mines), P (pipelines, steel, iron)
- Ownership: Links entities to assets/entities. ownershipPct = percentage stake (0-100). Chains can be 5+ levels deep.

THE 7 TRACKERS:
- Coal Plant: GEM unit ID (G prefix), capacity in MW - largest dataset
- Gas Plant: GEM unit ID (G prefix), capacity in MW
- Coal Mine: GEM Mine ID (M prefix), capacity in Mtpa
- Iron Mine: GEM Asset ID (P prefix), capacity in Mtpa
- Steel Plant: Steel Plant ID (P prefix), capacity in ttpa - BF = blast furnace
- Gas Pipeline: ProjectID (P prefix, short like P0061), capacity in Bcm/y
- Bioenergy Power: GEM unit ID (G prefix), capacity in MW

STATUS VALUES:
- Operating: operating, idle, mothballed
- Pipeline: announced, pre-permit, permitted, pre-construction, construction, proposed
- End states: retired, cancelled, shelved
- For simple analysis normalize to: operating / proposed / retired / cancelled

OWNERSHIP MODEL:
- Multiple owners per asset is common (joint ventures)
- Percentages may not sum to 100 (unknown stakes, public float)
- "Parent" = ultimate owner (trace UP the chain)
- "Direct owner" = immediate holder
- To find who controls an asset, walk UP ownership graph until no more parents

QUERY PATTERNS:
- "Who are biggest X owners?" → get_top_owners with tracker filter
- "What does Company X own?" → search entity, then get_entity_portfolio
- "Who owns Asset Y?" → get_ownership_graph direction=up
- "Assets in Country Z" → search_assets with country filter, or get_country_breakdown

GEOGRAPHIC QUERIES:
- The database has COUNTRY-level filtering only, not states/provinces/regions
- For sub-country queries (e.g., "Hudson Valley", "Texas", "Bavaria"):
  1. First acknowledge: "The database tracks assets at the country level, not by region"
  2. Search by country (e.g., "United States") and look for relevant asset names
  3. Asset names often include city/region info (e.g., "Bowline Point power station" is in NY)
  4. Be honest if you can't narrow down to the specific region requested
- For US queries, try searching for nearby major cities or known facility names

KNOWN LIMITATIONS:
- Some ownership percentages are estimated or outdated
- Historical ownership changes not fully tracked
- Analytics tools may return empty if data not yet loaded (try again)
- No sub-country geographic filtering (state, province, region)

=== END GUIDE ===

RESPONSE STYLE:
- Be concise and direct. Skip lengthy introductions.
- Use bullet points and short paragraphs
- Highlight key findings (ownership %, capacity, status)
- When showing results, summarize the top 3-5 most relevant items
- Use **bold** for emphasis on key data points

CORE TOOLS:
- search_entities: Find companies by name
- get_entity_portfolio: What does a company own?
- get_entity_owners: Who owns a company?
- get_ownership_graph: Map ownership chains
- search_assets: Find plants/mines by country, status, type
- get_asset_details: Get specifics on one asset

ANALYTICS TOOLS (use these proactively!):
- get_top_owners: Rankings of biggest players (by assets or capacity)
- get_country_breakdown: Geographic distribution of assets
- get_status_breakdown: Operating vs proposed vs construction vs retired
- get_tracker_summary: High-level overview of all asset types
- get_owner_geographic_footprint: Where does a company have assets?
- compare_entities: Side-by-side comparison of 2-4 companies
- generate_screener_url: Create links to the visual screener tool
- generate_map: Create an interactive map showing asset locations (use when users want to visualize WHERE assets are)

Available asset types: ${TRACKERS.join(', ')}
Available statuses: ${STATUS_VALUES.join(', ')}

PROACTIVE INSIGHTS:
When users ask broad questions, enhance your answer with relevant analytics:
- "Who owns coal plants?" → Use get_top_owners with tracker filter
- "Tell me about China's energy" → Use get_country_breakdown
- "What's the pipeline of new plants?" → Use get_status_breakdown
- "Compare X and Y" → Use compare_entities
- "Show me where X's assets are" → Use generate_map with entity_ids
- "Map the coal plants in India" → Search assets, then generate_map with asset_ids
- After showing results, offer a screener URL for deeper exploration

DISAMBIGUATION:
When searching returns multiple similar entities (e.g. "Mitsubishi" returns Mitsubishi Corp, Mitsubishi Heavy Industries, etc.):
- If one is clearly the main/parent company, use that one
- If genuinely ambiguous, ask the user which they mean
- For conglomerates, the holding company (Corp, Group, Holdings) is usually what people mean

=== SCREENER WORKFLOW GUIDANCE ===

The Asset Class Screener is a powerful visual tool for exploring ownership stakes. When users want to do systematic exploration, guide them through the screener workflow:

SCREENER CAPABILITIES:
1. **Asset Types** (Step 1): Coal Plant, Gas Plant, Steel Plant, Gas Pipeline, Coal Mine, Iron Mine, Bioenergy Power
2. **Geography** (Step 2): Filter by any country where assets are located
3. **Status** (Step 3): operating, proposed, construction, announced, permitted, pre-permit, pre-construction, retired, cancelled, mothballed, idle, shelved
4. **Advanced Filters**: Capacity thresholds, owner headquarters country

COMMON USER JOURNEYS - Recognize these intents and guide accordingly:

**"I'm investigating [Company X]"**
→ First, search for the entity to get their ID
→ Get their portfolio to see what they own
→ Generate a screener URL filtered to see all their asset types
→ Suggest comparing them to competitors

**"What's happening with [asset type] in [country]?"**
→ Use get_country_breakdown for the big picture
→ Use get_status_breakdown to see pipeline vs operating
→ Generate screener URL: tracker + country filter
→ Highlight if there's notable construction activity

**"Who are the biggest players in [asset type]?"**
→ Use get_top_owners with that tracker
→ Show the top 5-10 with their counts
→ Generate screener URL so they can explore the full list
→ Offer to compare the top 2-3

**"Show me [status] assets" (e.g., "proposed coal plants")**
→ Use get_status_breakdown first for context
→ Generate screener URL with status filter
→ Highlight countries with most activity in that status

**"I want to build a watchlist of companies"**
→ Explain the screener's "Add to Investigation" feature
→ Generate a screener URL with their criteria
→ Mention they can add results to their investigation cart
→ The cart persists and can be used to generate reports

SCREENER URL PATTERNS - Generate these proactively:
- After showing analytics results, offer: "Want to explore this interactively? [link]"
- When discussing a specific asset type + country combo
- When comparing companies (link to see all their assets)
- When user seems interested in building a list

REFINING SEARCHES - Help users narrow down:
- If results are too broad: "You could filter to just operating assets, or focus on a specific country"
- If results are sparse: "Try broadening to include all statuses, or look at related asset types"
- For capacity analysis: "The advanced filter lets you set capacity thresholds"

INVESTIGATION WORKFLOW:
1. Screener finds owners matching criteria
2. User can add companies to Investigation Cart (+/✓ buttons)
3. Cart persists across pages
4. From cart, user can generate Report with all selected entities
5. Report shows ownership chains, geographic exposure, and portfolio details

When users seem to be building an investigation, remind them:
- "You can add any of these to your investigation cart in the screener"
- "Once you have a list, the Report feature compiles all their ownership data"

Be honest when data is limited. Never make up ownership percentages.`;

// Tool definitions for OpenRouter/Claude
const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'search_entities',
      description:
        'Search for companies/entities by name. Use this to find entity IDs for further queries.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search term (company name or partial name)',
          },
          country: {
            type: 'string',
            description: 'Optional: Filter by headquarters country',
            enum: COUNTRIES,
          },
          limit: {
            type: 'number',
            description: 'Max results to return (default 10)',
          },
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
          entity_id: {
            type: 'string',
            description: 'The entity ID (e.g., E100000000650)',
          },
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
        "Get what an entity owns - its subsidiaries and direct holdings. Use this to see a company's portfolio.",
      parameters: {
        type: 'object',
        properties: {
          entity_id: {
            type: 'string',
            description: 'The entity ID to look up',
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
        'Get who owns an entity - trace ownership upward. Use this to find parent companies and ultimate owners.',
      parameters: {
        type: 'object',
        properties: {
          entity_id: {
            type: 'string',
            description: 'The entity ID to trace owners for',
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
        'Get the full ownership graph for an entity or asset. Returns nodes and edges for visualization. Direction "up" traces to owners, "down" traces to owned entities/assets.',
      parameters: {
        type: 'object',
        properties: {
          root_id: {
            type: 'string',
            description: 'The entity or asset ID to start from',
          },
          direction: {
            type: 'string',
            enum: ['up', 'down'],
            description: 'Direction to traverse: "up" for owners, "down" for portfolio',
          },
          max_depth: {
            type: 'number',
            description: 'Maximum depth to traverse (default 5)',
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
        'Search for energy assets (plants, mines, pipelines). Note: geographic filtering is COUNTRY-level only - no state/province/region filtering available. For sub-country queries, search by country and use query param to find assets by name (names often include city/region).',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search term - matches asset names. Try city names or facility names for regional searches.',
          },
          status: {
            type: 'string',
            description: 'Filter by status',
            enum: STATUS_VALUES as unknown as string[],
          },
          country: {
            type: 'string',
            description: 'Filter by country (ONLY country level, not state/region)',
          },
          limit: {
            type: 'number',
            description: 'Max results (default 20)',
          },
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
          asset_id: {
            type: 'string',
            description: 'The asset ID',
          },
        },
        required: ['asset_id'],
      },
    },
  },
  // === GLUE TOOLS - Advanced analytics users don't know to ask for ===
  {
    type: 'function',
    function: {
      name: 'get_top_owners',
      description:
        'Get the biggest owners ranked by asset count. Use this for questions like "who are the biggest coal plant owners?" Can filter by asset type. NOTE: For country-specific queries like "top coal owners in India", use get_top_owners_by_country instead.',
      parameters: {
        type: 'object',
        properties: {
          tracker: {
            type: 'string',
            enum: TRACKERS as unknown as string[],
            description: 'Filter to a specific asset type (optional)',
          },
          limit: {
            type: 'number',
            description: 'How many top owners to return (default 10)',
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
        'Get the biggest owners of assets IN A SPECIFIC COUNTRY. Perfect for "who owns coal plants in India?" or "top gas pipeline owners in Germany". Aggregates ownership by searching assets in that country.',
      parameters: {
        type: 'object',
        properties: {
          country: {
            type: 'string',
            description: 'The country to search in (e.g., "India", "Germany", "United States")',
          },
          tracker: {
            type: 'string',
            enum: TRACKERS as unknown as string[],
            description: 'Filter to a specific asset type (e.g., "Coal Plant")',
          },
          limit: {
            type: 'number',
            description: 'How many top owners to return (default 10)',
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
        'Get asset counts and capacity by country. Shows geographic distribution of energy infrastructure. Great for "where are most coal plants located?" or regional analysis.',
      parameters: {
        type: 'object',
        properties: {
          tracker: {
            type: 'string',
            enum: TRACKERS as unknown as string[],
            description: 'Filter to a specific asset type (optional)',
          },
          limit: {
            type: 'number',
            description: 'How many top countries to return (default 15)',
          },
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
        'Get counts by asset status (operating, proposed, construction, retired, etc). Shows pipeline vs operating infrastructure. Good for "how many coal plants are under construction?"',
      parameters: {
        type: 'object',
        properties: {
          tracker: {
            type: 'string',
            enum: TRACKERS as unknown as string[],
            description: 'Filter to a specific asset type (optional)',
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
        'Get high-level statistics for all asset types: total counts, capacity, operating vs proposed. Perfect overview of the entire database.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_owner_geographic_footprint',
      description:
        "Get which countries an owner has assets in. Shows an entity's geographic exposure. Use after finding an entity ID.",
      parameters: {
        type: 'object',
        properties: {
          entity_id: {
            type: 'string',
            description: 'The entity ID to analyze',
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
        'Compare two or more entities side by side - their portfolios, geographic reach, and ownership stakes. Great for competitive analysis.',
      parameters: {
        type: 'object',
        properties: {
          entity_ids: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of entity IDs to compare (2-4 entities)',
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
        'Find entities that own assets in multiple specified countries or trackers. Discovers cross-border or diversified players.',
      parameters: {
        type: 'object',
        properties: {
          countries: {
            type: 'array',
            items: { type: 'string' },
            description: 'Countries to find common owners across',
          },
          tracker: {
            type: 'string',
            enum: TRACKERS as unknown as string[],
            description: 'Filter to a specific asset type',
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
        'Generate a URL to the visual screener tool with pre-filled filters. Use this to send users to explore results interactively. Returns a link they can click.',
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
          country: {
            type: 'string',
            description: 'Filter by country',
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
        'Generate an interactive map showing asset locations. Use this when users want to visualize where assets are located geographically. For best results: 1) First search_assets to get specific asset IDs, then pass those to generate_map. 2) Entity IDs work best for operators whose assets include the company name (like NTPC, RWE, Enel). 3) For investment firms (BlackRock, Vanguard), search for specific assets first.',
      parameters: {
        type: 'object',
        properties: {
          entity_ids: {
            type: 'array',
            items: { type: 'string' },
            description: 'Entity IDs - works best for operators (NTPC, RWE) whose assets include company name',
          },
          asset_ids: {
            type: 'array',
            items: { type: 'string' },
            description: 'Specific asset IDs from search_assets - most reliable for mapping',
          },
          title: {
            type: 'string',
            description: 'Optional title for the map',
          },
        },
        required: [],
      },
    },
  },
  // Cart tools - operations are executed client-side
  {
    type: 'function',
    function: {
      name: 'get_investigation_cart',
      description:
        "Get the current contents of the user's investigation cart. Returns all items they've saved for investigation/export.",
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_to_cart',
      description:
        "Add assets or entities to the user's investigation cart. Use this when the user wants to save items for later investigation or export.",
      parameters: {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string', description: 'Asset ID (G-prefix) or Entity ID (E-prefix)' },
                name: { type: 'string', description: 'Name of the asset or entity' },
                type: { type: 'string', enum: ['asset', 'entity'], description: 'Type of item' },
                tracker: { type: 'string', description: 'For assets: the tracker type (coal, gas, etc.)' },
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
      description:
        "Remove specific items from the user's investigation cart by their IDs.",
      parameters: {
        type: 'object',
        properties: {
          ids: {
            type: 'array',
            items: { type: 'string' },
            description: 'IDs of items to remove from the cart',
          },
        },
        required: ['ids'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'clear_cart',
      description:
        "Clear all items from the user's investigation cart. Use only when explicitly requested.",
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
];

// Execute tool calls and return results
interface CartItem {
  id: string;
  name: string;
  type: 'asset' | 'entity';
  tracker?: string;
  metadata?: { country?: string; status?: string; capacity?: number };
}

async function executeTool(
  name: string,
  args: Record<string, unknown>,
  cart?: CartItem[]
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  try {
    switch (name) {
      case 'search_entities': {
        const result = await listEntities({
          q: args.query as string,
          country: args.country as string | undefined,
          limit: (args.limit as number) || 10,
        });

        const entities = result.results.map((e) => ({
          id: e.id,
          name: e.name,
          fullName: e.fullName,
          headquartersCountry: e.headquartersCountry,
        }));

        // If multiple similar results, use Haiku to pick the best one (limit to first 10)
        let bestMatch = null;
        if (entities.length > 1) {
          const toEvaluate = entities.slice(0, 10);
          const names = toEvaluate.map((e, i) => `${i + 1}. ${e.name} (${e.headquartersCountry || 'unknown'})`).join('\n');
          const hint = await quickModel(
            `User searched for "${args.query}". These entities were found:\n${names}\n\nWhich number is most likely the main/parent company they want? Reply with just the number.`
          );
          const pick = parseInt(hint.trim());
          if (pick >= 1 && pick <= toEvaluate.length) {
            bestMatch = toEvaluate[pick - 1].id;
          }
        }

        return {
          success: true,
          data: {
            total: result.total,
            count: result.count,
            entities,
            bestMatch, // ID of Haiku's recommended pick
          },
        };
      }

      case 'get_entity_details': {
        const entity = await getEntity(args.entity_id as string);
        return {
          success: true,
          data: {
            id: entity.id,
            name: entity.name,
            fullName: entity.fullName,
            headquartersCountry: entity.headquartersCountry,
            raw: entity.raw,
          },
        };
      }

      case 'get_entity_portfolio': {
        const owned = await getEntityOwned(args.entity_id as string);
        return {
          success: true,
          data: {
            entityId: args.entity_id,
            subsidiaries: owned.map((o) => ({
              id: o.entityId,
              name: o.entityName,
              ownershipPct: o.ownershipPct,
            })),
            count: owned.length,
          },
        };
      }

      case 'get_entity_owners': {
        const owners = await getEntityOwners(args.entity_id as string);
        return {
          success: true,
          data: {
            entityId: args.entity_id,
            owners: owners.map((o) => ({
              id: o.ownerEntityId,
              name: o.ownerName,
              ownershipPct: o.ownershipPct,
            })),
            count: owners.length,
          },
        };
      }

      case 'get_ownership_graph': {
        const graph = await getOwnershipGraph({
          root: args.root_id as string,
          direction: args.direction as 'up' | 'down',
          max_depth: (args.max_depth as number) || 5,
        });
        return {
          success: true,
          data: {
            root: graph.root,
            nodeCount: graph.nodes.length,
            edgeCount: graph.edges.length,
            nodes: graph.nodes.slice(0, 50), // Limit for readability
            edges: graph.edges.slice(0, 100),
            truncated: graph.nodes.length > 50,
          },
        };
      }

      case 'search_assets': {
        const result = await listAssets({
          q: args.query as string | undefined,
          status: args.status as string | undefined,
          country: args.country as string | undefined,
          limit: (args.limit as number) || 20,
        });
        return {
          success: true,
          data: {
            total: result.total,
            count: result.count,
            assets: result.results.map((a) => ({
              id: a.id,
              name: a.name,
              type: a.facilityType,
              status: a.status,
              capacity: a.capacity,
              capacityUnit: a.capacityUnit,
              country: a.country,
              owner: a.ownerName,
            })),
          },
        };
      }

      case 'get_asset_details': {
        const asset = await getAsset(args.asset_id as string);
        return {
          success: true,
          data: {
            id: asset.id,
            name: asset.name,
            type: asset.facilityType,
            status: asset.status,
            capacity: asset.capacity,
            capacityUnit: asset.capacityUnit,
            country: asset.country,
            latitude: asset.latitude,
            longitude: asset.longitude,
            owner: asset.ownerName,
            ownerEntityId: asset.ownerEntityId,
            parent: asset.parentName,
            parentEntityId: asset.parentEntityId,
          },
        };
      }

      // === GLUE TOOLS ===

      case 'get_top_owners': {
        const result = await getTopOwnersServer({
          metric: (args.metric as 'assets' | 'capacity') || 'assets',
          tracker: args.tracker as string | null,
          limit: (args.limit as number) || 10,
        });
        if (!result.success) {
          return { success: false, error: result.error || 'Failed to fetch top owners' };
        }
        return {
          success: true,
          data: {
            metric: args.metric || 'assets',
            tracker: args.tracker || 'all',
            owners: result.data?.map((o) => ({
              name: o.owner_name,
              entityId: o.entity_id,
              value: o.value,
              assetCount: o.asset_count,
            })),
          },
        };
      }

      case 'get_top_owners_by_country': {
        const country = args.country as string;
        const tracker = args.tracker as string | undefined;
        const limit = (args.limit as number) || 10;

        // Use REST API to search assets by country (and optionally tracker in query)
        const searchQuery = tracker ? `${tracker}` : undefined;
        const assetsResult = await listAssets({
          q: searchQuery,
          country: country,
          limit: 200, // Get more to aggregate properly
        });

        if (assetsResult.count === 0) {
          return {
            success: true,
            data: {
              country,
              tracker: tracker || 'all',
              owners: [],
              message: `No assets found in ${country}${tracker ? ` for ${tracker}` : ''}`,
            },
          };
        }

        // Aggregate by owner
        const ownerCounts = new Map<string, { name: string; count: number; entityId: string | null }>();
        for (const asset of assetsResult.results) {
          const ownerName = asset.ownerName || 'Unknown';
          const existing = ownerCounts.get(ownerName);
          if (existing) {
            existing.count++;
          } else {
            ownerCounts.set(ownerName, {
              name: ownerName,
              count: 1,
              entityId: asset.ownerEntityId || null,
            });
          }
        }

        // Sort by count and take top N
        const sortedOwners = [...ownerCounts.values()]
          .sort((a, b) => b.count - a.count)
          .slice(0, limit);

        return {
          success: true,
          data: {
            country,
            tracker: tracker || 'all',
            totalAssetsSearched: assetsResult.count,
            owners: sortedOwners.map((o) => ({
              name: o.name,
              entityId: o.entityId,
              assetCount: o.count,
            })),
          },
        };
      }

      case 'get_country_breakdown': {
        const result = await getCountryBreakdownServer({
          tracker: args.tracker as string | null,
          limit: (args.limit as number) || 15,
        });
        if (!result.success) {
          return { success: false, error: result.error || 'Failed to fetch country breakdown' };
        }
        return {
          success: true,
          data: {
            tracker: args.tracker || 'all',
            countries: result.data?.map((c) => ({
              country: c.country,
              assetCount: c.asset_count,
              totalCapacity: c.total_capacity,
            })),
          },
        };
      }

      case 'get_status_breakdown': {
        const result = await getStatusDistributionServer(args.tracker as string | null);
        if (!result.success) {
          return { success: false, error: result.error || 'Failed to fetch status breakdown' };
        }
        return {
          success: true,
          data: {
            tracker: args.tracker || 'all',
            statuses: result.data?.map((s) => ({
              status: s.status,
              count: s.count,
            })),
          },
        };
      }

      case 'get_tracker_summary': {
        const result = await getTrackerStatsServer();
        if (!result.success) {
          return { success: false, error: result.error || 'Failed to fetch tracker stats' };
        }
        return {
          success: true,
          data: {
            trackers: result.data?.map((t) => ({
              tracker: t.tracker,
              totalAssets: t.assetCount,
              totalCapacity: t.totalCapacity,
              operating: t.operatingCount,
              proposed: t.proposedCount,
            })),
          },
        };
      }

      case 'get_owner_geographic_footprint': {
        const result = await getOwnerCountryBreakdownServer(args.entity_id as string);
        if (!result.success) {
          return { success: false, error: result.error || 'Failed to fetch geographic footprint' };
        }
        return {
          success: true,
          data: {
            entityId: args.entity_id,
            countries: result.data?.map((c) => ({
              country: c.value,
              assetCount: c.count,
            })),
            totalCountries: result.data?.length || 0,
          },
        };
      }

      case 'compare_entities': {
        const entityIds = args.entity_ids as string[];
        if (!entityIds || entityIds.length < 2) {
          return { success: false, error: 'Need at least 2 entity IDs to compare' };
        }

        // Fetch data for each entity in parallel
        const comparisons = await Promise.all(
          entityIds.slice(0, 4).map(async (entityId) => {
            const [entity, portfolio, footprint] = await Promise.all([
              getEntity(entityId).catch(() => null),
              getEntityOwned(entityId).catch(() => []),
              getOwnerCountryBreakdownServer(entityId).catch(() => ({ success: true, data: [] })),
            ]);

            return {
              entityId,
              name: entity?.name || entityId,
              headquartersCountry: entity?.headquartersCountry,
              subsidiaryCount: portfolio.length,
              topSubsidiaries: portfolio.slice(0, 3).map((s) => s.entityName),
              geographicReach: footprint.data?.length || 0,
              topCountries: footprint.data?.slice(0, 3).map((c) => c.value) || [],
            };
          })
        );

        return {
          success: true,
          data: { comparisons },
        };
      }

      case 'find_common_owners': {
        // This is a complex query - we'll search for entities with assets in multiple countries
        const countries = args.countries as string[];
        const tracker = args.tracker as string | undefined;

        if (!countries || countries.length < 2) {
          return { success: false, error: 'Need at least 2 countries to find common owners' };
        }

        // For now, return a helpful message - this would need a custom SQL query
        return {
          success: true,
          data: {
            note: 'Cross-country owner analysis',
            countries,
            tracker: tracker || 'all',
            suggestion: `To find common owners across ${countries.join(' and ')}, try searching for major players in each country and comparing their portfolios.`,
          },
        };
      }

      case 'generate_screener_url': {
        const params = new URLSearchParams();
        const tracker = args.tracker as string;
        const status = args.status as string | undefined;
        const country = args.country as string | undefined;

        // Build the screener URL with filters
        const filters = [
          { tracker, field: null, operator: null, value: null, status, geography: country },
        ];
        params.set('classes', JSON.stringify(filters));

        const url = `/screener/results?${params.toString()}`;

        return {
          success: true,
          data: {
            url,
            description: `Screener for ${tracker}${status ? ` (${status})` : ''}${country ? ` in ${country}` : ''}`,
            clickable: true,
          },
        };
      }

      case 'generate_map': {
        const entityIds = (args.entity_ids as string[]) || [];
        const assetIds = (args.asset_ids as string[]) || [];
        const title = args.title as string | undefined;

        if (entityIds.length === 0 && assetIds.length === 0) {
          return { success: false, error: 'Need at least one entity_id or asset_id to generate a map' };
        }

        const mapFeatures: Array<{
          id: string;
          name: string;
          lat: number;
          lng: number;
          tracker: string;
          status: string;
          country: string;
          capacity: number | null;
          owner: string;
        }> = [];

        const seenIds = new Set<string>();

        // For entities: Get entity name, then search for assets by name
        // The ownership graph only returns entity-to-entity relationships, not assets
        for (const entityId of entityIds.slice(0, 3)) {
          try {
            // Get the entity name first
            const entity = await getEntity(entityId);
            const entityName = entity.name || entity.fullName;

            if (entityName) {
              // Search for assets related to this entity
              const assetSearchResult = await listAssets({
                q: entityName,
                limit: 50,
              });

              // Fetch full details for each asset to get coordinates
              for (const assetSummary of assetSearchResult.results) {
                if (seenIds.has(assetSummary.id)) continue;
                seenIds.add(assetSummary.id);

                // Asset summary might have coordinates directly
                if (assetSummary.latitude && assetSummary.longitude) {
                  mapFeatures.push({
                    id: assetSummary.id,
                    name: assetSummary.name,
                    lat: assetSummary.latitude,
                    lng: assetSummary.longitude,
                    tracker: assetSummary.facilityType || 'Unknown',
                    status: assetSummary.status || 'unknown',
                    country: assetSummary.country || 'Unknown',
                    capacity: assetSummary.capacity,
                    owner: assetSummary.ownerName || entityName,
                  });
                } else {
                  // Try fetching full asset details for coordinates
                  try {
                    const asset = await getAsset(assetSummary.id);
                    if (asset.latitude && asset.longitude) {
                      mapFeatures.push({
                        id: asset.id,
                        name: asset.name,
                        lat: asset.latitude,
                        lng: asset.longitude,
                        tracker: asset.facilityType || 'Unknown',
                        status: asset.status || 'unknown',
                        country: asset.country || 'Unknown',
                        capacity: asset.capacity,
                        owner: asset.ownerName || entityName,
                      });
                    }
                  } catch {
                    // Skip assets we can't fetch
                  }
                }
              }
            }
          } catch {
            // Entity fetch failed, skip
          }
        }

        // Fetch specific assets by ID
        for (const assetId of assetIds.slice(0, 20)) {
          if (seenIds.has(assetId)) continue;
          seenIds.add(assetId);

          try {
            const asset = await getAsset(assetId);
            if (asset.latitude && asset.longitude) {
              mapFeatures.push({
                id: asset.id,
                name: asset.name,
                lat: asset.latitude,
                lng: asset.longitude,
                tracker: asset.facilityType || 'Unknown',
                status: asset.status || 'unknown',
                country: asset.country || 'Unknown',
                capacity: asset.capacity,
                owner: asset.ownerName || 'Unknown',
              });
            }
          } catch {
            // Asset not found, skip
          }
        }

        if (mapFeatures.length === 0) {
          return {
            success: true,
            data: {
              type: 'map',
              title: title || 'Asset Map',
              message: 'No assets with coordinates found. Try searching for specific assets by name or ID.',
              features: [],
            },
          };
        }

        return {
          success: true,
          data: {
            type: 'map',
            title: title || `Assets (${mapFeatures.length} locations)`,
            features: mapFeatures,
            bounds: {
              minLat: Math.min(...mapFeatures.map(f => f.lat)),
              maxLat: Math.max(...mapFeatures.map(f => f.lat)),
              minLng: Math.min(...mapFeatures.map(f => f.lng)),
              maxLng: Math.max(...mapFeatures.map(f => f.lng)),
            },
          },
        };
      }

      // Cart tools - return instructions for client-side execution
      case 'get_investigation_cart': {
        const items = cart || [];
        const assetItems = items.filter((i) => i.type === 'asset');
        const entityItems = items.filter((i) => i.type === 'entity');
        return {
          success: true,
          data: {
            type: 'cart_read',
            action: 'get',
            total: items.length,
            assets: assetItems.map((i) => ({ id: i.id, name: i.name, tracker: i.tracker })),
            entities: entityItems.map((i) => ({ id: i.id, name: i.name })),
            summary: items.length === 0
              ? 'Cart is empty'
              : `${items.length} items: ${assetItems.length} assets, ${entityItems.length} entities`,
          },
        };
      }

      case 'add_to_cart': {
        const items = args.items as Array<{
          id: string;
          name: string;
          type: 'asset' | 'entity';
          tracker?: string;
          metadata?: { country?: string; status?: string; capacity?: number };
        }>;

        if (!items || items.length === 0) {
          return { success: false, error: 'No items provided to add' };
        }

        return {
          success: true,
          data: {
            type: 'cart_write',
            action: 'add',
            items,
            message: `Adding ${items.length} item(s) to investigation cart...`,
          },
        };
      }

      case 'remove_from_cart': {
        const ids = args.ids as string[];

        if (!ids || ids.length === 0) {
          return { success: false, error: 'No IDs provided to remove' };
        }

        return {
          success: true,
          data: {
            type: 'cart_write',
            action: 'remove',
            ids,
            message: `Removing ${ids.length} item(s) from investigation cart...`,
          },
        };
      }

      case 'clear_cart': {
        return {
          success: true,
          data: {
            type: 'cart_write',
            action: 'clear',
            message: 'Clearing investigation cart...',
          },
        };
      }

      default:
        return { success: false, error: `Unknown tool: ${name}` };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, error: message };
  }
}

/**
 * Stream SSE events to the client
 */
function createSSEStream() {
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController<Uint8Array>;
  let isClosed = false;

  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
  });

  const send = (event: string, data: unknown) => {
    if (isClosed) return; // Don't send to closed stream
    try {
      const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
      controller.enqueue(encoder.encode(payload));
    } catch (err) {
      console.error('SSE send error:', err);
    }
  };

  const close = () => {
    if (isClosed) return; // Prevent double close
    isClosed = true;
    try {
      controller.close();
    } catch (err) {
      console.error('SSE close error:', err);
    }
  };

  return { stream, send, close };
}

export const POST: RequestHandler = async ({ request }) => {
  if (!OPENROUTER_API_KEY) {
    return new Response(JSON.stringify({ error: 'OpenRouter API key not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const { messages, cart } = await request.json();
    const { stream, send, close } = createSSEStream();

    // Process in background, streaming events
    (async () => {
      try {
        // Build cart context if items exist
        let cartContext = '';
        if (cart && cart.length > 0) {
          const assetItems = cart.filter((i: { type: string }) => i.type === 'asset');
          const entityItems = cart.filter((i: { type: string }) => i.type === 'entity');
          cartContext = `\n\n## User's Investigation Cart (${cart.length} items)\nThe user has saved these items for investigation:\n`;
          if (assetItems.length > 0) {
            cartContext += `\nAssets (${assetItems.length}):\n${assetItems.map((i: { id: string; name: string; tracker?: string }) => `- ${i.name} (${i.id})${i.tracker ? ` [${i.tracker}]` : ''}`).join('\n')}`;
          }
          if (entityItems.length > 0) {
            cartContext += `\nEntities (${entityItems.length}):\n${entityItems.map((i: { id: string; name: string }) => `- ${i.name} (${i.id})`).join('\n')}`;
          }
          cartContext += '\n\nYou can use add_to_cart, remove_from_cart, or clear_cart to modify this list. Use get_investigation_cart if the user asks what\'s in their cart.';
        } else {
          cartContext = '\n\n## User\'s Investigation Cart\nThe cart is currently empty. Use add_to_cart to add items when the user wants to save assets or entities for investigation.';
        }

        // Build the messages array with system prompt and cart context
        const apiMessages = [{ role: 'system', content: SYSTEM_PROMPT + cartContext }, ...messages];

        // Signal we're starting
        send('status', { stage: 'thinking', message: 'Processing your request...' });

        // Initial API call
        let response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://gem-viz.fly.dev',
            'X-Title': 'GEM Gembot',
          },
          body: JSON.stringify({
            model: MODEL,
            messages: apiMessages,
            tools: TOOLS,
            tool_choice: 'auto',
            max_tokens: 4096,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          send('error', { message: `AI error: ${response.status}` });
          close();
          return;
        }

        let result = await response.json();
        let assistantMessage = result.choices[0].message;

        // Handle tool calls in a loop (for multi-step reasoning)
        const toolCallResults: Array<{ tool: string; args: unknown; result: unknown }> = [];
        let iterations = 0;
        const MAX_ITERATIONS = 5;

        // Maintain running conversation history through tool loop
        let conversationHistory = [...apiMessages];

        while (assistantMessage.tool_calls && iterations < MAX_ITERATIONS) {
          iterations++;
          send('status', { stage: 'tools', iteration: iterations, message: `Running tools (step ${iterations})...` });

          // Execute each tool call with streaming updates
          const toolResults = await Promise.all(
            assistantMessage.tool_calls.map(
              async (toolCall: { id: string; function: { name: string; arguments: string } }) => {
                let args: Record<string, unknown> = {};
                try {
                  args = toolCall.function.arguments ? JSON.parse(toolCall.function.arguments) : {};
                } catch (parseErr) {
                  console.error('Failed to parse tool arguments:', toolCall.function.arguments, parseErr);
                  // Continue with empty args rather than failing
                }

                // Stream tool start event
                send('tool_start', {
                  tool: toolCall.function.name,
                  args,
                  id: toolCall.id
                });

                const result = await executeTool(toolCall.function.name, args, cart);

                // Stream tool result event
                const toolResult = {
                  tool: toolCall.function.name,
                  args,
                  result: result.data || result.error,
                };
                send('tool_result', toolResult);
                toolCallResults.push(toolResult);

                return {
                  role: 'tool',
                  tool_call_id: toolCall.id,
                  content: JSON.stringify(result),
                };
              }
            )
          );

          // Add this iteration's messages to the running history
          conversationHistory.push(assistantMessage);
          conversationHistory.push(...toolResults);

          send('status', { stage: 'thinking', message: 'Analyzing results...' });

          response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${OPENROUTER_API_KEY}`,
              'Content-Type': 'application/json',
              'HTTP-Referer': 'https://gem-viz.fly.dev',
              'X-Title': 'GEM Gembot',
            },
            body: JSON.stringify({
              model: MODEL,
              messages: conversationHistory,
              tools: TOOLS,
              tool_choice: 'auto',
              max_tokens: 4096,
            }),
          });

          if (!response.ok) {
            send('error', { message: 'AI continuation error' });
            break;
          }

          result = await response.json();
          if (!result.choices?.[0]?.message) {
            break;
          }
          assistantMessage = result.choices[0].message;
        }

        // If we have content already (no tool calls on last iteration), stream it
        // Otherwise, make a final streaming request for the response
        if (assistantMessage?.content) {
          send('status', { stage: 'writing', message: 'Writing response...' });

          // Stream the text we already have
          const text = assistantMessage.content;
          const chunkSize = 15;
          for (let i = 0; i < text.length; i += chunkSize) {
            send('text_delta', { content: text.slice(i, i + chunkSize) });
            await new Promise(r => setTimeout(r, 5));
          }

          send('done', {
            message: assistantMessage.content,
            toolCalls: toolCallResults,
            usage: result?.usage,
          });
        } else if (toolCallResults.length > 0) {
          // Tools were called but no final response yet - make a streaming request
          // Force text-only response with tool_choice: 'none'
          send('status', { stage: 'writing', message: 'Writing response...' });

          // Use the accumulated conversation history (already has all tool interactions)
          // Make streaming request for final response - NO MORE TOOL CALLS
          const streamResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${OPENROUTER_API_KEY}`,
              'Content-Type': 'application/json',
              'HTTP-Referer': 'https://gem-viz.fly.dev',
              'X-Title': 'GEM Gembot',
            },
            body: JSON.stringify({
              model: MODEL,
              messages: conversationHistory,
              tools: TOOLS,
              tool_choice: 'none', // Force text response, no more tool calls
              stream: true,
              max_tokens: 4096,
            }),
          });

          if (streamResponse.ok && streamResponse.body) {
            const reader = streamResponse.body.getReader();
            const decoder = new TextDecoder();
            let fullContent = '';
            let buffer = '';

            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                  const trimmedLine = line.trim();
                  if (!trimmedLine) continue;
                  if (trimmedLine === 'data: [DONE]') continue;
                  if (!trimmedLine.startsWith('data: ')) continue;

                  const jsonStr = trimmedLine.slice(6);
                  if (!jsonStr) continue;

                  try {
                    const json = JSON.parse(jsonStr);
                    const delta = json.choices?.[0]?.delta?.content;
                    if (delta) {
                      fullContent += delta;
                      send('text_delta', { content: delta });
                    }
                  } catch {
                    // Ignore parse errors - might be partial chunk
                  }
                }
              }

              // Process any remaining buffer
              if (buffer.trim() && buffer.trim().startsWith('data: ') && buffer.trim() !== 'data: [DONE]') {
                const jsonStr = buffer.trim().slice(6);
                if (jsonStr) {
                  try {
                    const json = JSON.parse(jsonStr);
                    const delta = json.choices?.[0]?.delta?.content;
                    if (delta) {
                      fullContent += delta;
                      send('text_delta', { content: delta });
                    }
                  } catch {
                    // Final chunk parse error, ignore
                  }
                }
              }
            } catch (err) {
              console.error('Stream reading error:', err);
            }

            send('done', {
              message: fullContent,
              toolCalls: toolCallResults,
              usage: null,
            });
          } else {
            send('error', { message: 'Failed to stream final response' });
          }
        } else {
          // No tools, no content - something went wrong
          send('done', {
            message: assistantMessage?.content || 'No response generated',
            toolCalls: [],
            usage: result?.usage,
          });
        }

        close();
      } catch (err) {
        console.error('Stream error:', err);
        send('error', { message: 'Internal error processing request' });
        close();
      }
    })();

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (err) {
    console.error('Chat API error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
