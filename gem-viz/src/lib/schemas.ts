/* eslint-disable @typescript-eslint/no-explicit-any */
import { z } from 'zod';

/**
 * Catalog table schema - describes the structure of loaded Excel files
 */
export const CatalogSchema = z.object({
  original_filename: z.string(),
  original_tabname: z.string(),
  db_name: z.string(),
  schema_name: z.string(),
  table_name: z.string(),
  row_count: z.union([z.number(), z.bigint()]),
  column_count: z.union([z.number(), z.bigint()]),
  loaded_at: z.any(), // DuckDB timestamp type
});

export type CatalogEntry = z.infer<typeof CatalogSchema>;

/**
 * Base schema for GEM tracker assets
 * Common fields found across most tracker tables
 */
export const BaseAssetSchema = z.object({
  // Identity
  'GEM unit id': z.string().optional(),
  'GEM location id': z.string().optional(),
  'Wiki page': z.string().optional(),

  // Names
  Project: z.string().optional(),
  Plant: z.string().optional(),
  Mine: z.string().optional(),
  Unit: z.string().optional(),

  // Location
  Country: z.string().optional(),
  Region: z.string().optional(),
  Latitude: z.number().optional(),
  Longitude: z.number().optional(),

  // Ownership
  Owner: z.string().optional(),
  Parent: z.string().optional(),

  // Status & Type
  Status: z.string().optional(),
  Tracker: z.string().optional(),

  // Capacity
  'Capacity (MW)': z.number().optional(),
  'Capacity (Mt)': z.number().optional(),
});

export type BaseAsset = z.infer<typeof BaseAssetSchema>;

/**
 * Coal Plant specific schema
 */
export const CoalPlantSchema = BaseAssetSchema.extend({
  Plant: z.string(),
  'Capacity (MW)': z.number().optional(),
  'Combustion technology': z.string().optional(),
  'Heat rate (Btu per kWh)': z.number().optional(),
});

export type CoalPlant = z.infer<typeof CoalPlantSchema>;

/**
 * Coal Mine specific schema
 */
export const CoalMineSchema = BaseAssetSchema.extend({
  Mine: z.string(),
  'Capacity (Mt)': z.number().optional(),
  'Mine type': z.string().optional(),
});

export type CoalMine = z.infer<typeof CoalMineSchema>;

/**
 * Helper to parse unknown table data with partial validation
 * Returns parsed data with validation errors logged
 */
export function parseTableData<T>(
  schema: z.ZodSchema<T>,
  data: unknown[]
): { parsed: Partial<T>[]; errors: z.ZodError[] } {
  const parsed: Partial<T>[] = [];
  const errors: z.ZodError[] = [];

  for (const row of data) {
    const result = schema.safeParse(row);
    if (result.success) {
      parsed.push(result.data);
    } else {
      // Still include partial data, just log the error
      parsed.push(row as Partial<T>);
      errors.push(result.error);
    }
  }

  return { parsed, errors };
}

/**
 * Dynamic schema builder for unknown table structures
 * Infers types from first row of data
 */
export function inferTableSchema(sampleRow: Record<string, any>) {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const [key, value] of Object.entries(sampleRow)) {
    if (value === null || value === undefined) {
      shape[key] = z.any().optional();
    } else if (typeof value === 'string') {
      shape[key] = z.string().optional();
    } else if (typeof value === 'number') {
      shape[key] = z.number().optional();
    } else if (typeof value === 'bigint') {
      shape[key] = z.bigint().optional();
    } else if (typeof value === 'boolean') {
      shape[key] = z.boolean().optional();
    } else if (value instanceof Date) {
      shape[key] = z.date().optional();
    } else {
      shape[key] = z.any().optional();
    }
  }

  return z.object(shape);
}
