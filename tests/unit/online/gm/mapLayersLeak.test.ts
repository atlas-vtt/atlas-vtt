import { parseGmMessage, type GmMessage } from '../../../../src/app/online/protocol/index.ts';
import type { DrawingStroke, NotePin, TextElement, TokenEntity } from '../../../../src/app/types';
import type { FogOperation } from '../../../../src/app/types/fogTypes';
import type { InitiativeEntry } from '../../../../src/app/types/initiativeTypes';
import type { WallSegment } from '../../../../src/app/types/wallTypes';
import { describe, expect, it } from 'vitest';
import type { LiveDrawing } from '../../../../src/app/annotations/madeDrawing';
import { UnderWay } from '../../../../src/app/annotations/underWay';
import { fogCoverage } from '../../../../src/app/fog/fogCoverage';
import { MARKS_INTERVAL_MS } from '../../../../src/app/online/protocol/index.ts';
import { formerParseAnnotations } from '../../../oracles/annotationsBaseline/parseAnnotations.ts';
import { fakeLayers } from './fakeAtlasTab.ts';
import { FakeLaser } from './markHarness.ts';
import { sha256Hex } from '../../../../src/app/online/gm/assetServe.ts';
import { assetIdOf } from '../../../../src/app/online/gm/assets/assetIds.ts';
import { SALT } from './fakeAssetStore.ts';
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

const traffic = (sent: readonly Sent[]): string => sent.map(({ body }) => JSON.stringify(body)).join('\n');
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
      const artIds = new Map(await Promise.all([...hashes].map(async ([id, hash]) => [id, await assetIdOf(SALT, hash)] as const)));
      const images = new Map([['maps/cave.webp', new Uint8Array([9, 9, 9])], ...tokens.map((entry) => [entry.path, entry.bytes] as const)]);
      const pins: Record<string, NotePin> = Object.fromEntries(Array.from({ length: 4 }, () => {
        const key = word(random);
        return [`pin_${key}`, { id: `pin_${key}`, kind: 'pin', x: free(random), y: free(random), notePath: `Notes/Secret ${key}.md`, label: `Pin ${key}` } as unknown as NotePin];
      }));
      const fogged = { colour: colourOf(random), text: `Trap ${word(random)}` };
      // What the GM keeps to themselves (`hidden`) and what lies on the map, each in a colour or with words nothing else has.
      const secret = { colour: colourOf(random), stamp: colourOf(random), text: `Ambush ${word(random)}`, switched: colourOf(random), switchedText: `Cache ${word(random)}` };
      const floor = { colour: colourOf(random), text: `Crypt ${word(random)}` };
      // On the map and kept from the players, or under fog whole: told in no field at all.
      const secretFloor = { colour: colourOf(random), text: `Vault ${word(random)}`, fogged: colourOf(random), foggedText: `Pit ${word(random)}` };
      const room = { colour: colourOf(random) };
      // Drawings while they are made: one players will see, one kept from them, one on the map, one under fog.
      const strokes = { shown: colourOf(random), hidden: colourOf(random), onMap: colourOf(random), fogged: colourOf(random), cellsHidden: colourOf(random) };
      const line = (): { x: number; y: number }[] => [{ x: free(random), y: free(random) }, { x: free(random), y: free(random) }];
      const corner = { x: free(random), y: free(random) };
      const outline = [corner, { x: corner.x + 80, y: corner.y }, { x: corner.x + 80, y: corner.y + 60 }, { x: corner.x, y: corner.y + 60 }, corner];
      const drawingsAt = (step: number): Record<string, DrawingStroke> => ({
        hidden: { id: 'hidden', kind: 'drawing', timestamp: 1, type: 'pen', points: [{ x: inFog(random), y: inFog(random) }, { x: inFog(random), y: inFog(random) }], color: fogged.colour, width: 4, opacity: 1 },
        shown: { id: 'shown', kind: 'drawing', timestamp: 2, type: 'pen', points: line(), color: '#ffffff', width: 4, opacity: 1 },
        secret: { id: 'secret', kind: 'drawing', timestamp: 3, type: 'pen', points: line(), color: secret.colour, width: 4, opacity: 1, hidden: true },
        secretStamp: { id: 'secretStamp', kind: 'drawing', timestamp: 4, type: 'icon', icon: 'skull', points: [{ x: free(random), y: free(random) }], color: secret.stamp, width: 70, opacity: 1, hidden: true },
        floor: { id: 'floor', kind: 'drawing', timestamp: 5, type: 'line', points: line(), color: floor.colour, width: 4, opacity: 1, layer: 'map' },
        // Shown at first, then kept from the players: nothing of it may go out once it is.
        switched: { id: 'switched', kind: 'drawing', timestamp: 6, type: 'pen', points: line(), color: secret.switched, width: 4, opacity: 1, ...(step >= STEPS / 2 && { hidden: true as const }) },
        // A shape players see goes out as the line a pen would have drawn, with its look beside it and nothing of its maker's.
        room: { id: 'room', kind: 'drawing', timestamp: 7, type: 'rectangle', points: outline, color: room.colour, width: 4, opacity: 1, fill: 'soft', dash: 'dashed', group: 'g1', order: 3, locked: true, by: 'p'.repeat(20) },
        secretFloor: { id: 'secretFloor', kind: 'drawing', timestamp: 8, type: 'line', points: [...outline], color: secretFloor.colour, width: 0, opacity: 0.4, fill: 'solid', cells: true, layer: 'map', hidden: true },
        foggedFloor: { id: 'foggedFloor', kind: 'drawing', timestamp: 9, type: 'pen', points: [{ x: inFog(random), y: inFog(random) }, { x: inFog(random), y: inFog(random) }], color: secretFloor.fogged, width: 4, opacity: 1, layer: 'map' },
      });
      const textsAt = (step: number): Record<string, TextElement> => ({
        hidden: { id: 'hidden', kind: 'text', x: FOGGED.x + FOGGED.size / 2, y: FOGGED.y + FOGGED.size / 2, text: fogged.text, fontSize: 12, fontFamily: 'serif', color: '#ffffff' },
        shown: { id: 'shown', kind: 'text', x: 100, y: 100, text: 'Tavern', fontSize: 24, fontFamily: 'serif', color: '#ffffff' },
        secret: { id: 'secret', kind: 'text', x: free(random), y: free(random), text: secret.text, fontSize: 24, fontFamily: 'serif', color: '#ffffff', hidden: true },
        floor: { id: 'floor', kind: 'text', x: free(random), y: free(random), text: floor.text, fontSize: 24, fontFamily: 'serif', color: '#ffffff', layer: 'map' },
        secretFloor: { id: 'secretFloor', kind: 'text', x: free(random), y: free(random), text: secretFloor.text, fontSize: 24, fontFamily: 'serif', color: '#ffffff', layer: 'map', hidden: true, width: 80, breaks: [3], outline: true },
        foggedFloor: { id: 'foggedFloor', kind: 'text', x: FOGGED.x + FOGGED.size / 2, y: FOGGED.y + FOGGED.size / 2, text: secretFloor.foggedText, fontSize: 12, fontFamily: 'serif', color: '#ffffff', layer: 'map' },
        switched: { id: 'switched', kind: 'text', x: free(random), y: free(random), text: secret.switchedText, fontSize: 24, fontFamily: 'serif', color: '#ffffff', ...(step >= STEPS / 2 && { hidden: true as const }) },
      });
      let drawings = drawingsAt(0);
      let texts = textsAt(0);
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
      const underWay = new UnderWay();
      const fog = fogCoverage(FOG);
      table.marks = { measurements: null, laser: new FakeLaser(), laserLook: () => ({ color: '#ff0059', size: 16 }), footprints: () => [], seen: () => () => true, stroke: underWay, fog: () => fog };
      const stroke = (color: string, more: Partial<LiveDrawing> = {}): LiveDrawing => ({ type: 'line', points: line(), color, width: 4, opacity: 1, ...more });
      const fogLine = [{ x: inFog(random), y: inFog(random) }, { x: inFog(random), y: inFog(random) }];
      const made = [
        [stroke(strokes.shown)], [stroke(strokes.hidden, { hidden: true })], [stroke(strokes.onMap, { layer: 'map' })], [stroke(strokes.fogged, { points: fogLine })],
        // The cells being filled are told only where every area of them may be.
        [stroke(strokes.cellsHidden, { points: outline, fill: 'solid', width: 0 }), stroke(strokes.cellsHidden, { points: outline, fill: 'solid', width: 0, hidden: true })],
        [stroke(strokes.hidden, { type: 'pen', hidden: true })],
      ];
      table.share.start();
      const hiddenPlaces = new Set<number>();
      let sentBeforeHiding = 0;
      for (let step = 0; step < STEPS; step += 1) {
        if (step === STEPS / 2) sentBeforeHiding = table.sent.length;
        drawings = drawingsAt(step);
        texts = textsAt(step);
        current = scene();
        for (const entry of tokens) if (entry.hidden) hiddenPlaces.add(roundPlace(current.objects.tokens[entry.id]?.x ?? 0));
        table.perception = gmPerception(current, GENERIC_SOURCE, MAP);
        await table.set(current);
        await table.advance(MAP_LAYER_INTERVAL_MS);
        underWay.begin();
        underWay.show(made[step % made.length]!, made[step % made.length]![0]?.type === 'pen');
        await table.advance(MARKS_INTERVAL_MS);
        if (step % 2 === 0) underWay.made();
        else underWay.drop();
        await table.advance(MARKS_INTERVAL_MS);
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
      expect(sent, `${label}: a drawing the GM keeps to themselves`).not.toContain(secret.colour);
      expect(sent, `${label}: a stamp the GM keeps to themselves`).not.toContain(secret.stamp);
      expect(sent, `${label}: a text the GM keeps to themselves`).not.toContain(secret.text);
      // What lies on the map is told apart, where a reader that draws everything above the lighting does not look.
      const annotationsSent = ofKind(table.sent, 'annotations');
      const apart = traffic(table.sent.filter(({ body }) => body.t !== 'annotations')) + JSON.stringify(annotationsSent.map(({ drawings: above, texts: words }) => ({ above, words })));
      expect(apart, `${label}: a drawing on the map among those above the tokens`).not.toContain(floor.colour);
      expect(apart, `${label}: a text on the map among those above the tokens`).not.toContain(floor.text);
      expect(JSON.stringify(annotationsSent.at(-1)?.onMap), `${label}: what lies on the map`).toContain(floor.colour);
      expect(JSON.stringify(annotationsSent.at(-1)?.onMap), `${label}: what lies on the map`).toContain(floor.text);
      for (const message of annotationsSent) {
        const former = formerParseAnnotations(JSON.parse(JSON.stringify(message)) as Record<string, unknown>);
        expect(former, `${label}: a reader of before refuses the message`).not.toBeNull();
        expect(JSON.stringify(former), `${label}: a reader of before shows what lies on the map`).not.toContain(floor.colour);
      }
      for (const [what, mark] of Object.entries(secretFloor)) expect(sent, `${label}: on the map, kept back or under fog (${what})`).not.toContain(mark);
      // A drawing is told while it is made only where it will be told above the tokens once it is.
      const marksSent = ofKind(table.sent, 'marks');
      expect(JSON.stringify(marksSent), `${label}: a drawing under way players will see`).toContain(strokes.shown);
      for (const what of ['hidden', 'onMap', 'fogged', 'cellsHidden'] as const) expect(sent, `${label}: a drawing under way (${what})`).not.toContain(strokes[what]);
      // What was shown and then hidden went out while it was shown, and never again.
      const [early, late] = [traffic(table.sent.slice(0, sentBeforeHiding)), traffic(table.sent.slice(sentBeforeHiding))];
      expect(early, `${label}: a drawing while players see it`).toContain(secret.switched);
      expect(early, `${label}: a text while players see it`).toContain(secret.switchedText);
      expect(late, `${label}: a drawing once it is hidden`).not.toContain(secret.switched);
      expect(late, `${label}: a text once it is hidden`).not.toContain(secret.switchedText);
      const lastAnnotations = ofKind(table.sent, 'annotations').at(-1);
      expect(lastAnnotations?.drawings.map(({ type }) => type).sort(), `${label}: the drawings players are left with`).toEqual(['pen', 'pen']);
      expect(lastAnnotations?.texts.map(({ text }) => text), `${label}: the texts players are left with`).toEqual(['Tavern']);
      // A shape is told as the line through its points, with what it is drawn by beside it and nothing else of it.
      expect(lastAnnotations?.drawings.find(({ colour }) => colour === room.colour)).toEqual({
        type: 'pen', points: outline.flatMap(({ x, y }) => [x, y]), colour: room.colour, width: 4, opacity: 1, shape: 'rectangle', fill: 'soft', dash: 'dashed', order: 3,
      });
      const told = JSON.stringify([ofKind(table.sent, 'annotations'), marksSent]);
      for (const field of ['hidden', 'layer', 'group', 'locked', 'by', 'anchors', 'cells', 'timestamp', 'id']) expect(told, `${label}: the field ${field}`).not.toContain(`"${field}"`);
      for (const entry of tokens) {
        expect(sent, `${label}: a GM token id`).not.toContain(entry.id);
        expect(sent, `${label}: a token's vault path`).not.toContain(entry.path);
        if (entry.hidden) {
          expect(sent, `${label}: a hidden token's name`).not.toContain(entry.mark);
          expect(sent, `${label}: a hidden token's portrait`).not.toContain(hashes.get(entry.id));
          expect(sent, `${label}: a hidden token's art named`).not.toContain(artIds.get(entry.id));
        } else {
          expect(sent.includes(entry.mark), `${label}: a listed name only with nameplates`).toBe(showNames);
          expect(sent, `${label}: a listed portrait named`).toContain(artIds.get(entry.id));
        }
      }
      for (const message of ofKind(table.sent, 'sensed')) {
        expect(lit, `${label}: outlines only in a lit scene`).toBe(true);
        for (const mark of message.tokens) expect(hiddenPlaces.has(mark.x), `${label}: a hidden token's outline`).toBe(false);
      }
    }
  });
});
