/** Public Atlas pages linked from the changelog, the settings tab and the welcome wizard. */
export const ATLAS_GITHUB_URL = 'https://github.com/atlas-vtt/atlas-vtt';
export const ATLAS_DISCORD_URL = 'https://discord.gg/p8unR7zQVr';
/** The guides, shown in the map view's documentation panel. */
export const ATLAS_DOCS_URL = 'https://atlas-vtt.dev/docs';
export const ATLAS_PATREON_URL = 'https://www.patreon.com/cw/atlas_vtt';
export const ATLAS_WEBSITE_URL = 'https://atlas-vtt.dev';
/** The Atlas plugin for Stream Deck: its page on the website, with the download and how to set it up. */
export const ATLAS_STREAM_DECK_URL = 'https://atlas-vtt.dev/stream-deck';
/** Online play: what it is and how to join the closed beta. */
export const ATLAS_ONLINE_URL = 'https://atlas-vtt.dev/online';

/** One guide of the documentation, by its path under it, such as `guides/dice`. */
export function atlasGuideUrl(path: string): string {
  return `${ATLAS_DOCS_URL}/${path}`;
}
