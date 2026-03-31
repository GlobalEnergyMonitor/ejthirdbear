/**
 * Shared formatting helpers for CoalPlantCard and its tab components.
 */
import { getStatusGroupId } from '$lib/data-config/tracker-schema';

export function formatCO2(value: number | null): string | null {
  if (value == null) return null;
  return value >= 1 ? `${value.toFixed(1)} Mt` : `${(value * 1000).toFixed(0)} kt`;
}

export function formatMW(mw: number): string {
  return `${mw.toLocaleString()} MW`;
}

export function statusClass(status: string): string {
  const group = getStatusGroupId(status);
  if (group === 'retired' && status === 'mothballed') return 'mothballed';
  return group;
}

export function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}
