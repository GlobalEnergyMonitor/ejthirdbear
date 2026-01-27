import { writable } from 'svelte/store';

/** Store to control command palette open state */
export const commandPaletteOpen = writable(false);

/** Open the command palette */
export function openCommandPalette() {
  commandPaletteOpen.set(true);
}

/** Close the command palette */
export function closeCommandPalette() {
  commandPaletteOpen.set(false);
}

/** Toggle the command palette */
export function toggleCommandPalette() {
  commandPaletteOpen.update((v) => !v);
}
