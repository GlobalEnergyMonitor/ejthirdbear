/**
 * Ad hoc API exploration tools backed by the API root endpoint registry.
 */

import {
  API_BASE,
  buildApiUrl,
  fetchApiJson,
  clampLimit,
  type ToolArgs,
  type ToolResult,
  type ToolHandler,
} from './tool-utils';

type ApiIndexEntry = {
  url: string;
  description: string;
};

const API_INDEX_PATH = '/';
const ALLOWED_PREFIXES = ['/entities', '/assets', '/ownership', '/catalog', '/segments', '/metadata'];

let cachedApiIndex: Record<string, ApiIndexEntry> | null = null;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function getApiIndex(): Promise<Record<string, ApiIndexEntry>> {
  if (cachedApiIndex) return cachedApiIndex;

  const raw = await fetchApiJson(`${API_BASE}${API_INDEX_PATH}`);
  const endpointsRaw = asRecord(raw.endpoints);

  cachedApiIndex = Object.fromEntries(
    Object.entries(endpointsRaw).flatMap(([key, value]) => {
      const entry = asRecord(value);
      if (typeof entry.url !== 'string' || typeof entry.description !== 'string') return [];
      return [[key, { url: entry.url, description: entry.description } satisfies ApiIndexEntry]];
    })
  );

  return cachedApiIndex;
}

function getEndpointFamily(path: string): string {
  const normalized = normalizePath(path);
  const [segment] = normalized.split('/').filter(Boolean);
  if (!segment) return 'root';
  return segment;
}

function getPathParams(path: string): string[] {
  return [...path.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]).filter(Boolean);
}

function normalizePath(path: string): string {
  if (!path.startsWith('/')) return `/${path}`;
  return path;
}

function isAllowedPath(path: string): boolean {
  return ALLOWED_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

function substitutePathParams(template: string, pathParams: Record<string, unknown>): string {
  let resolved = template;
  for (const [key, value] of Object.entries(pathParams)) {
    resolved = resolved.replaceAll(`{${key}}`, encodeURIComponent(String(value)));
  }
  return resolved;
}

function buildPreview(data: unknown, previewLimit: number) {
  if (Array.isArray(data)) {
    return data.slice(0, previewLimit);
  }

  if (data && typeof data === 'object') {
    const record = data as Record<string, unknown>;
    if (Array.isArray(record.results)) {
      return {
        ...record,
        results: record.results.slice(0, previewLimit),
      };
    }
  }

  return data;
}

function buildDataSummary(data: unknown) {
  if (Array.isArray(data)) {
    return {
      kind: 'array',
      itemCount: data.length,
      topLevelKeys: [],
    };
  }

  if (data && typeof data === 'object') {
    const record = data as Record<string, unknown>;
    const topLevelKeys = Object.keys(record);
    const results = Array.isArray(record.results) ? record.results : null;

    return {
      kind: results ? 'object-with-results' : 'object',
      itemCount:
        typeof record.totalCount === 'number'
          ? record.totalCount
          : typeof record.count === 'number'
            ? record.count
            : results
              ? results.length
              : null,
      topLevelKeys,
    };
  }

  return {
    kind: typeof data,
    itemCount: null,
    topLevelKeys: [],
  };
}

function summarizeQueryParams(queryParams: Record<string, unknown>) {
  return Object.entries(queryParams)
    .filter(([, value]) => value != null && value !== '')
    .map(([key, value]) => ({
      key,
      value: Array.isArray(value) ? value.join(', ') : String(value),
    }));
}

async function discoverApiEndpoints(args: ToolArgs): Promise<ToolResult> {
  const index = await getApiIndex();
  const query = typeof args.query === 'string' ? args.query.trim().toLowerCase() : '';

  const endpoints = Object.entries(index)
    .filter(([key, entry]) => {
      if (!query) return true;
      return (
        key.toLowerCase().includes(query) ||
        entry.url.toLowerCase().includes(query) ||
        entry.description.toLowerCase().includes(query)
      );
    })
    .map(([key, entry]) => ({
      key,
      url: entry.url,
      description: entry.description,
      family: getEndpointFamily(entry.url),
      pathParams: getPathParams(entry.url),
      templated: entry.url.includes('{'),
    }));

  const familyCounts = Object.entries(
    endpoints.reduce<Record<string, number>>((acc, endpoint) => {
      acc[endpoint.family] = (acc[endpoint.family] || 0) + 1;
      return acc;
    }, {})
  )
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([family, count]) => ({ family, count }));

  return {
    success: true,
    data: {
      type: 'api_endpoint_index',
      apiName: 'Ownership Tracing API',
      baseUrl: API_BASE,
      totalEndpoints: endpoints.length,
      familyCounts,
      query: query || null,
      endpoints,
    },
  };
}

async function queryApiAdHoc(args: ToolArgs): Promise<ToolResult> {
  const index = await getApiIndex();
  const endpointKey = typeof args.endpoint_key === 'string' ? args.endpoint_key.trim() : '';
  const endpointPathArg = typeof args.path === 'string' ? args.path.trim() : '';
  const pathParams = asRecord(args.path_params);
  const queryParams = asRecord(args.query_params);
  const previewLimit = clampLimit(args.preview_limit, 10, 50);

  let pathTemplate = '';
  if (endpointKey && index[endpointKey]) {
    pathTemplate = index[endpointKey].url;
  } else if (endpointPathArg) {
    pathTemplate = normalizePath(endpointPathArg);
  } else {
    return {
      success: false,
      error: 'Provide endpoint_key from the API index or a relative path to query.',
    };
  }

  const resolvedPath = substitutePathParams(pathTemplate, pathParams);
  if (resolvedPath.includes('{')) {
    return {
      success: false,
      error: `Missing required path params for ${pathTemplate}`,
    };
  }

  if (!isAllowedPath(resolvedPath)) {
    return {
      success: false,
      error: `Path not allowed for ad hoc queries: ${resolvedPath}`,
    };
  }

  const url = buildApiUrl(resolvedPath, queryParams, resolvedPath !== '/');
  const data = await fetchApiJson(url);
  const summary = buildDataSummary(data);
  const resolvedEntry =
    endpointKey && index[endpointKey]
      ? {
          key: endpointKey,
          description: index[endpointKey].description,
        }
      : null;

  return {
    success: true,
    data: {
      type: 'api_ad_hoc_result',
      endpointKey: resolvedEntry?.key || endpointKey || null,
      endpointDescription: resolvedEntry?.description || null,
      family: getEndpointFamily(resolvedPath),
      path: resolvedPath,
      url,
      queryParams: summarizeQueryParams(queryParams),
      topLevelKeys: summary.topLevelKeys,
      resultKind: summary.kind,
      itemCount: summary.itemCount,
      preview: buildPreview(data, previewLimit),
    },
  };
}

export const apiExplorerHandlers: Record<string, ToolHandler> = {
  discover_api_endpoints: discoverApiEndpoints,
  query_api_ad_hoc: queryApiAdHoc,
};
