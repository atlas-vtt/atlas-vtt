/**
 * Seeded inputs for comparing the hashes with frozen copies of the code they
 * replaced: strings made of every kind of UTF-16 code unit a hash reads (lone
 * surrogates included), real vault paths, the empty string and one very long string.
 */

/** The linear congruential generator of `tableSightDifferential.test.ts`. */
export function random(seed: number): () => number {
  return (): number => { seed = Math.imul(seed, 1664525) + 1013904223 | 0; return (seed >>> 0) / 4294967296; };
}

/** A whole number from `from` to `to`, both included. */
export function between(rng: () => number, from: number, to: number): number {
  return from + Math.floor(rng() * (to - from + 1));
}

/** Code units by kind, each drawn from its own range; a surrogate pair is two units. */
const UNIT_KINDS: ReadonlyArray<(rng: () => number) => string> = [
  (rng) => String.fromCharCode(between(rng, 0x20, 0x7e)),
  (rng) => String.fromCharCode(between(rng, 0x80, 0xff)),
  (rng) => String.fromCharCode(rng() < 0.5 ? between(rng, 0x100, 0xd7ff) : between(rng, 0xe000, 0xffff)),
  (rng) => String.fromCharCode(between(rng, 0xd800, 0xdbff), between(rng, 0xdc00, 0xdfff)),
  (rng) => String.fromCharCode(between(rng, 0xd800, 0xdbff)),
  (rng) => String.fromCharCode(between(rng, 0xdc00, 0xdfff)),
  () => '\u0000',
];

/** Paths as the vault holds them, the ones the thumbnail names were checked with among them. */
export const VAULT_PATHS: readonly string[] = [
  'atlas-vtt/collections/default/tokens/orc.png',
  'atlas-vtt/collections/default/tokens/caves/orc.png',
  'atlas-vtt/collections/default/tokens/troll.png',
  'atlas-vtt/collections/caves/orc.png',
  'atlas-vtt/assets/goblin.png',
  'atlas-vtt/assets/thumbnails/orc-d7b604c2.webp',
  'atlas-vtt/collections/Cairn/maps/map-1.json',
  'atlas-vtt/collections/Cairn/collection.json',
  'atlas-vtt/collections/Cairn/scenes/Blue Mouth Caves.atlasmap',
  'atlas-vtt/collections/Cairn/snapshots/scene-1/Before the fight.json',
  'atlas-vtt/collections/Dolmenwood/tokens/Wächter der Ölbäume.webp',
  'atlas-vtt/collections/Witherwild/notes/note-7.json',
  'atlas-vtt/collections/Default/tokens/ドラゴン.png',
  'atlas-vtt/library.json',
  'atlas-vtt/.atlas-data/assets-metadata.json',
  'Reference/Cairn/Items/Lantern.md',
  'Maps/Tavern.atlasmap',
  'token',
  '.webp',
  '/',
];

/** One string of exactly `length` code units of seeded kinds; a pair that would not fit is drawn again. */
export function seededString(rng: () => number, length: number): string {
  let text = '';
  while (text.length < length) {
    const unit = UNIT_KINDS[between(rng, 0, UNIT_KINDS.length - 1)]!(rng);
    if (text.length + unit.length <= length) text += unit;
  }
  return text;
}

/** The empty string, the vault paths, one string of 100,000 code units and 2,000 strings of 0 to 64 units. */
export function hashStrings(): string[] {
  const rng = random(0x5eed);
  const strings = ['', ...VAULT_PATHS, seededString(rng, 100_000)];
  for (let n = 0; n < 2000; n++) strings.push(seededString(rng, between(rng, 0, 64)));
  return strings;
}
