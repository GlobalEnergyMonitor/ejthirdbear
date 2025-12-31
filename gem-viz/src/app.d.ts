// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
declare global {
  // eslint-disable-next-line no-unused-vars
  namespace App {
    // interface Error {}
    // interface Locals {}
    // interface PageData {}
    // interface PageState {}
    // interface Platform {}
  }

  // Build-time constants injected by Vite
  const __BUILD_TIME__: string;
  const __BUILD_HASH__: string;
  const __APP_VERSION__: string;
}

export {};
