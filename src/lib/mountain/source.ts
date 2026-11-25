/**
 * Where the built mountain files live. Locally they're served from public/mountains; in production
 * set NEXT_PUBLIC_MOUNTAINS_URL to a CDN or bucket (absolute, e.g. https://cdn.example.com/mountains)
 * so the multi-megabyte JSON stays out of the app bundle and the git repo.
 */
export const MOUNTAINS_URL = (process.env.NEXT_PUBLIC_MOUNTAINS_URL || "/mountains").replace(/\/$/, "");

export const mountainUrl = (slug: string) => `${MOUNTAINS_URL}/${slug}.json`;

/** index.json next to the mountain files: what's there, without opening every file. */
export const MOUNTAIN_INDEX = "index.json";

export interface MountainIndexEntry {
  slug: string;
  name: string;
  resorts: string[];
}
