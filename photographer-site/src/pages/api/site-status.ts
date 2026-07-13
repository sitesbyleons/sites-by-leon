import type { APIRoute } from 'astro';

export const prerender = false;

export const GET: APIRoute = async ({ locals }) =>
  Response.json({ status: locals.siteContext.status });
