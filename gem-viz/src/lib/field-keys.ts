/**
 * Canonical field name lookup keys for API ↔ display name resolution.
 *
 * The REST API uses snake_case, older CSV exports use display names.
 * Each array is tried in order by pickKey() — first non-empty wins.
 *
 * Shared by ownership-api.ts, compose-api.ts, and widget-api.ts
 * so field name variants stay in sync across all normalizers.
 */

export const FK_ID = ['GEM Unit Phase ID', 'GEM Unit ID', 'GEM unit ID', 'gem_unit_id', 'asset_id', 'id'] as const;
export const FK_NAME = ['Facility Name', 'Project', 'Unit Name', 'asset_name', 'name'] as const;
export const FK_FACILITY_TYPE = ['Facility Type', 'Tracker', 'facility_type', 'asset_type'] as const;
export const FK_STATUS = ['Status', 'status', 'operating_status'] as const;
export const FK_SUB_STATUS = ['operating_sub_status', 'sub_status'] as const;
export const FK_CAPACITY = ['Capacity', 'Capacity (MW)', 'capacity', 'capacity_value'] as const;
export const FK_CAPACITY_UNIT = ['Capacity Unit', 'capacity_unit'] as const;
export const FK_COUNTRY = ['Country Area', 'Country', 'country'] as const;
export const FK_LATITUDE = ['Latitude', 'lat', 'latitude'] as const;
export const FK_LONGITUDE = ['Longitude', 'lon', 'longitude'] as const;
export const FK_OWNER = ['Owner', 'Immediate Project Owner', 'owner'] as const;
export const FK_OWNER_ENTITY_ID = ['Owner GEM Entity ID', 'Immediate Project Owner GEM Entity ID', 'owner_entity_id'] as const;
export const FK_PARENT = ['Parent', 'parent'] as const;
export const FK_PARENT_ENTITY_ID = ['Parent GEM Entity ID', 'parent_entity_id'] as const;

export const FK_ENTITY_ID = ['Entity ID', 'GEM Entity ID', 'entity_id', 'id'] as const;
export const FK_ENTITY_NAME = ['Name', 'Entity Name', 'entity_name', 'name'] as const;
export const FK_FULL_NAME = ['Full Name', 'full_name'] as const;
export const FK_HQ_COUNTRY = ['Headquarters Country', 'Headquarters country', 'headquarters_country'] as const;
