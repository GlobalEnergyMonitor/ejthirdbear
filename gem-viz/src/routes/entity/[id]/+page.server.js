import { error } from '@sveltejs/kit';

export const prerender = false;

export async function load({ params }) {
  throw error(404, `Entity pages are not yet prerendered`);
}
