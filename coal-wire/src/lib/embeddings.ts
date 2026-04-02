/**
 * Local embedding model — no external API needed.
 *
 * Uses all-MiniLM-L6-v2 (384 dimensions, ~23MB) via @huggingface/transformers.
 * Model downloads on first use and caches to disk at .cache/models/.
 * After that, works fully offline.
 */

import { pipeline, type FeatureExtractionPipeline } from '@huggingface/transformers';

const MODEL_ID = 'Xenova/all-MiniLM-L6-v2';
const CACHE_MAX = 200;

let extractor: FeatureExtractionPipeline | null = null;
let loading: Promise<FeatureExtractionPipeline> | null = null;
const cache = new Map<string, Float32Array>();

/** Embedding dimension for this model. Scripts must match this. */
export const EMBEDDING_DIM = 384;

async function getExtractor(): Promise<FeatureExtractionPipeline> {
  if (extractor) return extractor;
  if (loading) return loading;

  loading = pipeline('feature-extraction', MODEL_ID, {
    dtype: 'fp32',
  }).then((ext) => {
    extractor = ext;
    loading = null;
    return ext;
  });

  return loading;
}

/**
 * Embed a query string using the local model.
 * First call downloads the model (~23MB); subsequent calls are instant.
 */
export async function embedQuery(query: string): Promise<Float32Array | null> {
  const key = query.trim().toLowerCase();
  if (!key) return null;
  if (cache.has(key)) return cache.get(key)!;

  try {
    const ext = await getExtractor();
    const output = await ext(key, { pooling: 'mean', normalize: true });
    const vec = new Float32Array(output.data as Float32Array);

    // LRU eviction
    if (cache.size >= CACHE_MAX) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
    cache.set(key, vec);

    return vec;
  } catch {
    return null;
  }
}

/**
 * Embed a batch of texts. Used by the ingestion scripts.
 */
export async function embedBatch(texts: string[]): Promise<Float32Array[]> {
  const ext = await getExtractor();
  const results: Float32Array[] = [];

  for (const text of texts) {
    const output = await ext(text.slice(0, 512), { pooling: 'mean', normalize: true });
    results.push(new Float32Array(output.data as Float32Array));
  }

  return results;
}
