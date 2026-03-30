/**
 * Types for the Coal Plant tracker API responses.
 * Used by CoalPlantCard and the fetchCoalPlantLocation API helper.
 */

export interface CoalPlantFields {
  plant_name: string;
  plant_name_2: string | null;
  plant_name_3: string | null; // comma-separated list of additional names
  unit_name: string;
  status: string;
  capacity_megawatts: string | null;
  start_year: string | null;
  retired_year: string | null;
  planned_retirement: string | null;
  phaseout_commitment: string | null;
  'net-zero_commitment'?: string | null;
  net_zero_year?: string | null;
  combustion_technology: string | null;
  coal_type: string | null;
  coal_source: string | null;
  alternate_fuel: string | null;
  cogeneration: string | null; // "yes" | "no" | "not found" (CHP)
  captive: string | null;
  captive_industry_use: string | null;
  captive_residential_use: string | null;
  owner: string | null;
  owner_gem_entity_id: string | null;
  parent: string | null;
  parent_gem_entity_id: string | null;
  annual_co2_million_tonnes__annum: string | null;
  lifetime_co2_million_tonnes: string | null;
  capacity_factor: string | null;
  plant_age_years: string | null;
  remaining_plant_lifetime_years: string | null;
  heat_rate_btu: string | null;
  emission_factor_co2: string | null;
  wiki_url: string | null;
  location: string | null;
  subnational_unit: string | null;
  local_area: string | null;
  major_area: string | null;
  country_area: string;
  subregion: string | null;
  region: string | null;
  gem_location_id: string;
  gem_unit_phase_id: string;
  database: string | null;
  latitude: string;
  longitude: string;
  location_accuracy: string | null;
}

export interface CoalPlantUnit {
  asset_id: string;
  asset_name: string;
  asset_type?: string;
  operating_status: string;
  country: string;
  state_province: string | null;
  latitude: number;
  longitude: number;
  capacity_value: number;
  capacity_unit: string;
  location_id: string;
  unit_id: string;
  coal_plant_fields: CoalPlantFields;
}

export interface CoalPlantLocation {
  location_id: string;
  asset_type: string;
  asset_name: string;
  country: string;
  state_province: string | null;
  latitude: number;
  longitude: number;
  unit_count: number;
  url: string;
  units: CoalPlantUnit[];
}
