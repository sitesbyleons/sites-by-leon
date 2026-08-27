import type { DataClient } from '@leon/platform-core';

import { ISHOTYOUU_FALLBACK_WORK, ishotyouuLibraryStills, type IshotyouuFallbackFrame } from './content/ishotyouu-fallback';

export type StudioWorkStill = {
  id: string;
  workspace_id: string;
  image_url: string;
  storage_path: string | null;
  instagram_url: string;
  alt_text: string;
  sort_order: number;
};

export const WORK_SIDECAR_IMAGE = /^\/work\/[A-Za-z0-9][A-Za-z0-9._-]*\.(jpe?g|png|webp|avif)$/i;
export const WORK_STILLS_PAGE_SIZE = 12;
const INSTAGRAM_POST = /^https?:\/\/(?:www\.)?instagram\.com\/(p|reel)\/([A-Za-z0-9_-]+)\/?/i;

export function isSidecarWorkImage(url: string) {
  return WORK_SIDECAR_IMAGE.test(url.trim());
}

export function normalizeInstagramUrl(value: string) {
  const match = value.trim().match(INSTAGRAM_POST);
  if (!match) return null;
  const kind = match[1].toLowerCase() === 'reel' ? 'reel' : 'p';
  return `https://www.instagram.com/${kind}/${match[2]}/`;
}

export function instagramShortcode(value: string) {
  const url = normalizeInstagramUrl(value);
  if (!url) return null;
  return url.match(/\/(?:p|reel)\/([A-Za-z0-9_-]+)\//i)?.[1] ?? null;
}

export function libraryStillsForInstagramUrl(value: string): IshotyouuFallbackFrame[] {
  const code = instagramShortcode(value);
  if (!code) return [];
  return ishotyouuLibraryStills().filter((frame) => instagramShortcode(frame.instagramUrl) === code);
}

export function stillToFrame(still: Pick<StudioWorkStill, 'image_url' | 'alt_text' | 'instagram_url'>) {
  return {
    src: still.image_url,
    alt: still.alt_text,
    instagramUrl: still.instagram_url,
  };
}

export function publicWorkFrames(saved: Pick<StudioWorkStill, 'image_url' | 'alt_text' | 'instagram_url'>[]) {
  return saved.length ? saved.map(stillToFrame) : ISHOTYOUU_FALLBACK_WORK;
}

export async function listWorkStills(client: DataClient, workspaceId: string): Promise<StudioWorkStill[]> {
  const result = await client
    .from('studio_work_stills')
    .select('id,workspace_id,image_url,storage_path,instagram_url,alt_text,sort_order')
    .eq('workspace_id', workspaceId)
    .order('sort_order');
  if (result.error) return [];
  return (result.data ?? []) as StudioWorkStill[];
}
