/**
 * Types for the Coal Mine tracker API responses.
 * Used by CoalMineCard and fetchCoalMineAsset.
 *
 * Field names match the `code_friendly_name` values from:
 *   GET /catalog/metadata/coal-mines/
 * and the `coal_mine_fields` object returned by:
 *   GET /assets/{mineId}?format=json
 *
 * Notes:
 *   - Numeric fields (capacity_mtpa, production_mtpa, etc.) are returned as
 *     strings, and use "-" (not null) to indicate "no data". Use parseMineNum()
 *     from coal-mine-utils.ts before any arithmetic.
 *   - `coal_mine_fields.status` is often null; prefer the top-level
 *     `operating_status` / `operating_sub_status` for status logic.
 *   - `owners` is a comma-separated string, not an array.
 *   - Future expansion rows will share the same mine `location_id` and will
 *     be surfaced as additional entries — designed to slot into a
 *     `expansions?: CoalMineExpansion[]` array on CoalMineAsset.
 */

export interface CoalMineFields {
  // ── Identity ────────────────────────────────────────────────────────────
  gem_mine_id: string;
  mine_name: string;
  mine_name_non_eng: string | null;
  mine_name_akas: string | null;
  complex_name: string | null;
  msha_id: string | null; // Mine Safety & Health Administration ID (US)

  // ── Status ──────────────────────────────────────────────────────────────
  /** Human-readable status from the dataset ("Active", "Abandoned", …).
   *  Often null — prefer top-level operating_status / operating_sub_status. */
  status: string | null;
  status_detail: string | null;
  mine_site_status: string | null; // Dataset status label ("Abandoned", "Active", …)
  project_phase: string | null; // Future: "Existing", "Expansion", "Proposed"
  project_type: string | null;
  reason_for_closure: string | null;

  // ── Geography ───────────────────────────────────────────────────────────
  country_area: string;
  state_province: string | null;
  prefecture_district: string | null;
  location: string | null;
  region: string | null;
  subregion: string | null;
  coalfield: string | null;
  latitude: string;
  longitude: string;
  location_accuracy: string | null;
  iso_code: string | null;

  // ── Operations ──────────────────────────────────────────────────────────
  mine_type: string | null; // Surface / Underground / Combined
  mining_method: string | null; // Strip, Longwall, Open pit, etc.
  opening_year: string | null;
  closing_year: string | null;

  // ── Size & production ───────────────────────────────────────────────────
  /** Capacity in Mtpa. May be "-" for no data — use parseMineNum(). */
  capacity_mtpa: string | null;
  /** Annual production in Mtpa. May be "-" — use parseMineNum(). */
  production_mtpa: string | null;
  /** Annual production in millions of short tons. */
  coal_output_annual_mst: string | null;
  year_of_production: string | null;
  mine_size_km2: string | null;
  mine_size_km2_2: string | null; // Secondary size estimate
  mine_depth_m: string | null;
  mine_depth_m_2: string | null; // Secondary depth estimate
  depth_accuracy: string | null; // "Estimate", "Exact", etc.
  workforce_size: string | null;
  workforce_accuracy: string | null;

  // ── Coal properties ─────────────────────────────────────────────────────
  coal_type: string | null; // Bituminous, Sub-bituminous, Lignite, Anthracite
  coal_grade: string | null; // Thermal, Metallurgical, Mixed
  percentage_of_thermal_coal: string | null;
  percentage_of_met_coal: string | null;

  // ── Reserves & mine life ────────────────────────────────────────────────
  total_reserves_proven_and_probable_mt: string | null;
  total_resource_inferred_indicated_measured: string | null;
  reserve_to_production_ratio_r_p: string | null;
  reported_life_of_mine: string | null;
  reported_year_of_mine_life: string | null;

  // ── Methane ─────────────────────────────────────────────────────────────
  'gas-level_rating': string | null;
  'gas-level_rating_appraisal_year': string | null;
  gem_coal_mine_methane_emissions_estimate_mcm_yr: string | null;
  gem_coal_mine_methane_emissions_estimate_m_tonnes_yr: string | null;
  cmm_emissions_co2e_20_years: string | null;
  cmm_emissions_co2e_100_years: string | null;
  reported_coal_mine_methane_emissions_thousand_tonnes_per_year: string | null;
  year_of_reported_coal_mine_methane_emissions: string | null;
  methane_emissions_factor_updated: string | null;
  methane_gas_content_m3tonne: string | null;
  has_associated_cmm_mitigation_data: string | null;
  has_associated_plume_data: string | null;

  // ── Ownership ───────────────────────────────────────────────────────────
  /** Comma-separated owner names. Split on ',' to get individual owners. */
  owners: string | null;
  owners_non_eng: string | null;
  owner_gem_entity_id: string | null;
  parent_company: string | null;
  company_hqs: string | null;

  // ── End users ───────────────────────────────────────────────────────────
  coal_plant_steel_plant_terminal: string | null;
  coal_plant_steel_plant_terminal_gem_wiki: string | null;
  primary_consumer_destination: string | null;

  // ── Reference ───────────────────────────────────────────────────────────
  gem_wiki_page_eng: string | null;
  gem_wiki_page_non_eng: string | null;
  source_id: string | null;
}

/**
 * Top-level response from GET /assets/{mineId}?format=json
 *
 * `location_id` is the same as `asset_id` for mines (unlike coal plants
 * where location_id differs from the compound unit id).
 *
 * Future: `expansions` will hold additional phase/expansion rows once the
 * API surfaces them under a shared parent mine id.
 */
export interface CoalMineAsset {
  asset_id: string;
  asset_name: string;
  asset_type: string;
  /** Coarse status group: "operating" | "retired" | "planned" | "cancelled" */
  operating_status: string;
  /** Granular sub-status: "abandoned", "mothballed", "construction", … */
  operating_sub_status: string | null;
  country: string;
  state_province: string | null;
  latitude: number;
  longitude: number;
  /** For mines, location_id === asset_id */
  location_id: string;
  coal_mine_fields: CoalMineFields;
  // Future: expansions?: CoalMineExpansion[]
}
