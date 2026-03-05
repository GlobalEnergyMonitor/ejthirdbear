/**
 * Command Palette - Static command definitions
 * Extracted to reduce CommandPalette.svelte file size
 */

import { goto } from '$app/navigation';
import { link } from '$lib/links';
import { investigationCart } from '$lib/investigationCart';
import { buildScreenerUrl } from '$lib/screener-url';

export interface Command {
  id: string;
  label: string;
  shortcut?: string;
  action: () => void;
  section: string;
}

/**
 * Create static commands list
 * Pass callbacks for actions that need component state (close, toggleHelp, etc.)
 */
export function createCommands(callbacks: {
  close: () => void;
  toggleHelp: () => void;
  addCurrentToCart: () => void;
  copyCurrentId: () => void;
  copyUrl: () => void;
}): Command[] {
  const { close, toggleHelp, addCurrentToCart, copyCurrentId, copyUrl } = callbacks;

  return [
    // Navigation
    {
      id: 'home',
      label: 'Go to Home',
      shortcut: 'g h',
      action: () => goto(link('index')),
      section: 'Navigation',
    },
    {
      id: 'explore',
      label: 'Go to Explore',
      shortcut: 'g e',
      action: () => goto(link('explore')),
      section: 'Navigation',
    },
    {
      id: 'compose',
      label: 'Go to Compose',
      shortcut: 'g c',
      action: () => goto(link('compose')),
      section: 'Navigation',
    },
    {
      id: 'network',
      label: 'Go to Network',
      shortcut: 'g n',
      action: () => goto(link('network')),
      section: 'Navigation',
    },
    {
      id: 'report',
      label: 'Go to Report',
      shortcut: 'g r',
      action: () => goto(link('report')),
      section: 'Navigation',
    },
    {
      id: 'export',
      label: 'Go to Report Export',
      shortcut: 'g x',
      action: () => goto(`${link('report')}#export`),
      section: 'Navigation',
    },
    {
      id: 'assets',
      label: 'Go to Assets',
      action: () => goto(link('asset')),
      section: 'Navigation',
    },
    {
      id: 'about',
      label: 'Go to About',
      shortcut: 'g a',
      action: () => goto(link('about')),
      section: 'Navigation',
    },
    {
      id: 'map-search',
      label: 'Search by Map',
      shortcut: 'g m',
      action: () => goto(link('asset/search')),
      section: 'Navigation',
    },
    {
      id: 'cards',
      label: 'Go to Cards',
      action: () => goto(link('cards')),
      section: 'Navigation',
    },
    {
      id: 'factsheets',
      label: 'Go to Factsheets',
      action: () => goto(link('factsheet')),
      section: 'Navigation',
    },
    {
      id: 'presets',
      label: 'Go to Presets',
      action: () => goto(link('presets')),
      section: 'Navigation',
    },
    {
      id: 'manifest',
      label: 'Go to Data Manifest',
      action: () => goto(link('manifest')),
      section: 'Navigation',
    },
    {
      id: 'back',
      label: 'Go Back',
      shortcut: 'b',
      action: () => history.back(),
      section: 'Navigation',
    },
    // Screener — jump to tracker results
    ...screenerTrackerCommands(),
    // Actions
    {
      id: 'add-cart',
      label: 'Add to Cart',
      shortcut: 'a',
      action: addCurrentToCart,
      section: 'Actions',
    },
    {
      id: 'copy-id',
      label: 'Copy ID to Clipboard',
      shortcut: 'c',
      action: copyCurrentId,
      section: 'Actions',
    },
    {
      id: 'copy-url',
      label: 'Copy Page URL',
      shortcut: 'u',
      action: copyUrl,
      section: 'Actions',
    },
    {
      id: 'clear-cart',
      label: 'Clear Investigation Cart',
      action: () => {
        investigationCart.clear();
        close();
      },
      section: 'Actions',
    },
    {
      id: 'print',
      label: 'Print Current Page',
      shortcut: '⌘ p',
      action: () => window.print(),
      section: 'Actions',
    },
    // Help
    {
      id: 'shortcuts',
      label: 'Show All Shortcuts',
      shortcut: '?',
      action: toggleHelp,
      section: 'Help',
    },
  ];
}

/**
 * Generate screener commands for each base tracker
 */
function screenerTrackerCommands(): Command[] {
  const trackers = [
    { id: 'coal-plants', label: 'Coal Plants', tracker: 'Coal Plant' },
    { id: 'gas-plants', label: 'Gas Plants', tracker: 'Oil & Gas Plant' },
    { id: 'coal-mines', label: 'Coal Mines', tracker: 'Coal Mine' },
    { id: 'steel-plants', label: 'Iron & Steel Plants', tracker: 'Iron & Steel Plant' },
    { id: 'iron-mines', label: 'Iron Mines', tracker: 'Iron Mine' },
    { id: 'gas-pipelines', label: 'Gas Pipelines', tracker: 'Natural Gas Transmission Pipeline' },
    { id: 'oil-pipelines', label: 'Oil Pipelines', tracker: 'Oil or NGL Pipeline' },
    { id: 'bioenergy-power', label: 'Bioenergy Power', tracker: 'Bioenergy Power' },
  ];

  return trackers.map((t) => ({
    id: `screener-${t.id}`,
    label: t.label,
    action: () => {
      const classes = JSON.stringify([
        { id: t.id, name: t.label, tracker: t.tracker, gemTrackers: [t.tracker] },
      ]);
      goto(buildScreenerUrl('screener/results', { classes }));
    },
    section: 'Screener',
  }));
}

/**
 * Shortcut map for g+key sequences
 */
export const shortcutMap: Record<string, () => void> = {
  h: () => goto(link('index')),
  e: () => goto(link('explore')),
  r: () => goto(link('report')),
  x: () => goto(`${link('report')}#export`),
  a: () => goto(link('about')),
  m: () => goto(link('asset/search')),
};
