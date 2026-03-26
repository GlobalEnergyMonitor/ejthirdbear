/**
 * Centralized map configuration — basemap styles, tile URLs, defaults.
 */

/** CartoDB Positron — light, minimal basemap used for most maps */
export const BASEMAP_POSITRON = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';

/** CartoDB Voyager — slightly richer basemap used for the globe page */
export const BASEMAP_VOYAGER = 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json';

/** CartoDB light raster tiles (for static thumbnail maps) */
export const RASTER_TILE_URL = 'https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png';

/** Natural Earth countries GeoJSON (low-res, ~110m) */
export const NATURAL_EARTH_COUNTRIES =
  'https://d2ad6b4ur7yvpq.cloudfront.net/naturalearth-3.3.0/ne_110m_admin_0_countries.geojson';
