import { parseGmMessage, type GmMessage } from '../../../../src/app/online/protocol/index.ts';
import type { DrawingStroke, NotePin, TextElement, TokenEntity } from '../../../../src/app/types';
import type { FogOperation } from '../../../../src/app/types/fogTypes';
import type { InitiativeEntry } from '../../../../src/app/types/initiativeTypes';
import type { WallSegment } from '../../../../src/app/types/wallTypes';
import { describe, expect, it } from 'vitest';
import { fakeLayers } from './fakeAtlasTab.ts';
import { sha256Hex } from '../../../../src/app/online/gm/assetServe.ts';
import { MAP_LAYER_INTERVAL_MS } from '../../../../src/app/online/gm/MapLayerShare.ts';
import { roundPlace } from '../../../../src/app/online/gm/scenePicture.ts';
import { GENERIC_SOURCE, gmPerception } from './gmLighting.ts';
import { sceneState, shareHarness, token, type Sent } from './shareHarness.ts';

/** A seeded generator (mulberry32), so a failing trial can be replayed by its seed. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 2 ** 32;
  };
}

const TRIALS = 30;
const STEPS = 6;
const MAP = { width: 3000, height: 3000 };
/** Committed fog covers this square all along; what lies wholly inside it is never sent. */
const FOGGED = { x: 2200, y: 2200, size: 600 };
const FOG: Record<string, FogOperation> = {
  cover: { id: 'cover', kind: 'fog', timestamp: 1, isErasing: false, type: 'rectangle', x: FOGGED.x, y: FOGGED.y, width: FOGGED.size, height: FOGGED.size },
};

interface Marked {
  readonly id: string;
  /** A word that appears in nothing else the GM has. */
  readonly mark: string;
  readonly hidden: boolean;
  readonly path: string;
  readonly bytes: Uint8Array<ArrayBuffer>;
}

function word(random: () => number): string {
  return Math.floor(random() * 2 ** 48).toString(36).padStart(10, '0');
}

const colourOf = (random: () => number): string => `#${Math.floor(random() * 0xffffff).toString(16).padStart(6, '0')}`;
const inFog = (random: () => number): number => FOGGED.x + 100 + random() * (FOGGED.size - 200);
const free = (random: () => number): number => 50 + random() * 1800;

function walls(random: () => number): Record<string, WallSegment> {
  return Object.fromEntries(Array.from({ length: 16 }, (_, index): [string, WallSegment] => {
    const x = free(random);
    const y = free(random);
    const type = index % 3 === 0 ? 'secret-door' : index % 3 === 1 ? 'door' : 'solid';
    const closed = random() < 0.5;
    return [`w${index}`, { id: `w${index}`, kind: 'wall', type, p1: { x, y }, p2: { x: x + 60, y: y + 20 }, closed, ...(type !== 'solid' && random() < 0.5 && { locked: true }) }];
  }));
}

const traffic = (sent: readonly Sent[]): string => sent.filter(({ body }) => body.t !== 'asset-refused').map(({ body }) => JSON.stringify(body)).join('\n');
const ofKind = <T extends GmMessage['t']>(sent: readonly Sent[], t: T): Extract<GmMessage, { t: T }>[] =>
  sent.flatMap(({ body }) => (body.t === t ? [body as Extract<GmMessage, { t: T }>] : []));

describe("what players are sent of the map's layers", () => {
  it(`never holds a secret door, a lock, a pin, a hidden token's entry or what fog covers whole (${TRIALS} generated scenes)`, async () => {
    for (let trial = 1; trial <= TRIALS; trial += 1) {
      const random = seeded(trial);
      const tokens: Marked[] = Array.from({ length: 3 + Math.floor(random() * 8) }, () => {
        const key = word(random);
        return { id: `tok_${key}`, mark: `Name ${key}`, hidden: random() < 0.4, path: `art/${key}.webp`, bytes: new Uint8Array(24).map(() => Math.floor(random() * 256)) };
      });
      const hashes = new Map(await Promise.all(tokens.map(async (entry) => [entry.id, await sha256Hex(entry.bytes)] as const)));
      const images = new Map([['maps/cave.webp', new Uint8Array([9, 9, 9])], ...tokens.map((entry) => [entry.path, entry.bytes] as const)]);
      const pins: Record<string, NotePin> = Object.fromEntries(Array.from({ length: 4 }, () => {
        const key = word(random);
        return [`pin_${key}`, { id: `pin_${key}`, kind: 'pin', x: free(random), y: free(random), notePath: `Notes/Secret ${key}.md`, label: `Pin ${key}` } as unknown as NotePin];
      }));
      const fogged = { colour: colourOf(random), text: `Trap ${word(random)}` };
      const drawings: Record<string, DrawingStroke> = {
        hidden: { id: 'hidden', kind: 'drawing', timestamp: 1, type: 'pen', points: [{ x: inFog(random), y: inFog(random) }, { x: inFog(random), y: inFog(random) }], color: fogged.colour, width: 4, opacity: 1 },
        shown: { id: 'shown', kind: 'drawing', timestamp: 2, type: 'pen', points: [{ x: free(random), y: free(random) }, { x: free(random), y: free(random) }], color: '#ffffff', width: 4, opacity: 1 },
      };
      const texts: Record<string, TextElement> = {
        hidden: { id: 'hidden', kind: 'text', x: FOGGED.x + FOGGED.size / 2, y: FOGGED.y + FOGGED.size / 2, text: fogged.text, fontSize: 12, fontFamily: 'serif', color: '#ffffff' },
        shown: { id: 'shown', kind: 'text', x: 100, y: 100, text: 'Tavern', fontSize: 24, fontFamily: 'serif', color: '#ffffff' },
      };
      const lit = trial % 2 === 0;
      const showNames = trial % 3 === 0;
      const sceneWalls = walls(random);
      const scene = (): ReturnType<typeof sceneState> => {
        const entities: Record<string, TokenEntity> = Object.fromEntries(tokens.map((entry) => [entry.id, {
          ...token(entry.id, { x: free(random), y: free(random), imagePath: entry.path, isHidden: entry.hidden, ...(random() < 0.4 && { vision: { enabled: true, senses: [{ id: 'tremorsense', range: 60 }] } }) }),
          kind: 'character', name: entry.mark,
        }]));
        const entries: InitiativeEntry[] = tokens.map((entry, order) => ({
          id: `e${order}`, tokenId: entry.id, name: entry.mark, initiative: order, initiativeModifier: 0, imagePath: entry.path, isActive: order === 0, isNPC: true, order,
        }));
        return {
          ...sceneState({
            lighting: { enabled: lit, ambient: random() * 0.6 },
            objects: { ...sceneState().objects, fog: FOG, walls: sceneWalls, pins, drawings, texts, tokens: entities },
          }),
          initiative: { entries, currentIndex: 0, round: 1, isActive: true, config: { autoSort: true } },
          initiativeTrackerOpen: true,
        } as ReturnType<typeof sceneState>;
      };
      let current = scene();
      const table = shareHarness(current, images);
      table.settings = { ...table.settings, showNames };
      table.layers = fakeLayers({ state: () => current, source: GENERIC_SOURCE, bounds: MAP, grid: () => ({ size: 70, type: 'square' }) });
      table.share.start();
      const hiddenPlaces = new Set<number>();
      for (let step = 0; step < STEPS; step += 1) {
        current = scene();
        for (const entry of tokens) if (entry.hidden) hiddenPlaces.add(roundPlace(current.objects.tokens[entry.id]?.x ?? 0));
        table.perception = gmPerception(current, GENERIC_SOURCE, MAP);
        await table.set(current);
        await table.advance(MAP_LAYER_INTERVAL_MS);
        for (const hash of hashes.values()) table.share.receive('alice', { t: 'asset-request', hash });
        await table.settle();
      }

      const sent = traffic(table.sent);
      const label = `trial ${trial}`;
      expect(table.sent.every(({ body }) => parseGmMessage(JSON.parse(JSON.stringify(body))) !== null), `${label}: malformed message`).toBe(true);
      for (const kind of ['grid', 'annotations', 'initiative'] as const) expect(ofKind(table.sent, kind).length, `${label}: ${kind}`).toBeGreaterThan(0);
      expect(ofKind(table.sent, 'doors').length > 0, `${label}: door badges only in a lit scene`).toBe(lit);
      expect(sent, `${label}: a lock`).not.toContain('locked');
      expect(sent, `${label}: a secret door`).not.toContain('secret');
      const ordinary = new Set(Object.values(sceneWalls).filter((wall) => wall.type === 'door').map((wall) => JSON.stringify([wall.p1.x, wall.p1.y, wall.p2.x, wall.p2.y])));
      for (const message of ofKind(table.sent, 'doors')) {
        for (const door of message.doors) expect(ordinary.has(JSON.stringify(door.p)), `${label}: a badge on no ordinary door`).toBe(true);
      }
      for (const pin of Object.values(pins)) {
        expect(sent, `${label}: a pin`).not.toContain(pin.id);
        expect(sent, `${label}: a pin's note`).not.toContain(pin.notePath);
      }
      expect(sent, `${label}: a drawing fog covers`).not.toContain(fogged.colour);
      expect(sent, `${label}: a text fog covers`).not.toContain(fogged.text);
      expect(sent, `${label}: a text players see`).toContain('Tavern');
      const served = new Set(ofKind(table.sent, 'asset-chunk').map((chunk) => chunk.hash));
      for (const entry of tokens) {
        expect(sent, `${label}: a GM token id`).not.toContain(entry.id);
        expect(sent, `${label}: a token's vault path`).not.toContain(entry.path);
        if (entry.hidden) {
          expect(sent, `${label}: a hidden token's name`).not.toContain(entry.mark);
          expect(sent, `${label}: a hidden token's portrait`).not.toContain(hashes.get(entry.id));
          expect(served.has(hashes.get(entry.id) ?? ''), `${label}: a hidden token's art served`).toBe(false);
        } else {
          expect(sent.includes(entry.mark), `${label}: a listed name only with nameplates`).toBe(showNames);
          expect(served.has(hashes.get(entry.id) ?? ''), `${label}: a listed portrait served`).toBe(true);
        }
      }
      for (const message of ofKind(table.sent, 'sensed')) {
        expect(lit, `${label}: outlines only in a lit scene`).toBe(true);
        for (const mark of message.tokens) expect(hiddenPlaces.has(mark.x), `${label}: a hidden token's outline`).toBe(false);
      }
    }
  });
});
