import { Container, Text } from 'pixi.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PlayerInstanceBadges } from '../../src/app/pixi/token-renderer/PlayerInstanceBadges';
import { badgeParts } from '../../src/app/pixi/token-renderer/instanceBadgeParts';
import { updateInstanceBadge } from '../../src/app/pixi/token-renderer/InstanceBadge';
import { captureWithLayerVisibility, type LayerVisibility } from '../../src/app/pixi/playerSafeFrame';
import type { TokenGroupContainer } from '../../src/app/pixi/token-renderer/types';
import type { TokenEntity } from '../../src/app/types';
import { stubJsdomGraphics } from '../mocks/jsdomGraphics';

let restoreGraphics: () => void;
beforeEach(() => { restoreGraphics = stubJsdomGraphics(); });
afterEach(() => restoreGraphics());

/** Goblins A, B and C (GM numbers 1, 2, 3) and an orc, each with a badge drawn as the GM view draws it. */
function table(): {
  tokens: Record<string, TokenEntity>;
  groups: Record<string, TokenGroupContainer | null>;
  state: { mapPath: string | null; badgesOn: boolean };
  badges: PlayerInstanceBadges;
  drawGm: () => void;
} {
  const tokens: Record<string, TokenEntity> = {};
  const groups: Record<string, TokenGroupContainer | null> = {};
  const add = (id: string, imagePath: string, instanceNumber: number): void => {
    tokens[id] = { id, kind: 'token', imagePath, x: 0, y: 0, instanceNumber } as TokenEntity;
    groups[id] = Object.assign(new Container(), { tokenId: id, tokenData: tokens[id]!, tokenSize: 36, artPath: imagePath, strokeWidth: 2 });
  };
  add('A', 'goblin.png', 1);
  add('B', 'goblin.png', 2);
  add('C', 'goblin.png', 3);
  add('O', 'orc.png', 1);
  const state = { mapPath: 'maps/a.atlasmap' as string | null, badgesOn: true };
  const drawGm = (): void => {
    for (const [id, group] of Object.entries(groups)) {
      const token = tokens[id];
      if (!group || !token) continue;
      const count = Object.values(tokens).filter((other) => other.imagePath === token.imagePath).length;
      updateInstanceBadge(group, token.instanceNumber ?? 1, 36, state.badgesOn && count >= 2);
    }
  };
  drawGm();
  const badges = new PlayerInstanceBadges({
    state: () => ({ mapPath: state.mapPath, objects: { tokens }, tokenSettings: { showInstanceBadges: state.badgesOn } }),
    sprites: () => groups,
  });
  return { tokens, groups, state, badges, drawGm };
}

const seeing = (...ids: string[]) => (id: string): boolean => ids.includes(id);

/** What a token's badge shows on the stage now: nothing, the GM's number or the players'. */
function look(group: Container | null | undefined): string {
  const parts = group ? badgeParts(group) : null;
  if (!parts || !parts.badge.visible || !parts.disc.visible) return parts && (parts.text.visible || parts.playerText?.visible) && parts.badge.visible ? 'text without disc' : 'none';
  const gm = parts.text.visible;
  const players = parts.playerText?.visible ?? false;
  if (gm && !players) return `gm ${parts.text.text}`;
  if (players && !gm) return `players ${parts.playerText!.text}`;
  return gm ? 'both texts' : 'disc without text';
}

/** What a capture applying `layers` shows, with every entry naming another layer. */
function captured(layers: LayerVisibility[], groups: Record<string, Container | null>, ids: string[]): string[] {
  expect(new Set(layers.map(({ layer }) => layer)).size).toBe(layers.length);
  let looks: string[] = [];
  captureWithLayerVisibility(layers, () => {}, () => { looks = ids.map((id) => look(groups[id])); });
  return looks;
}

describe('the players\' instance badges', () => {
  it('show nothing for a token whose look-alikes the players do not see, and the players\' numbers otherwise', () => {
    const { groups, badges } = table();
    badges.pass(seeing('A', 'C', 'O'));
    expect(captured(badges.layers(), groups, ['A', 'B', 'C', 'O'])).toEqual(['gm 1', 'none', 'players 2', 'none']);
    // The capture leaves the GM's badges as they were.
    expect(['A', 'B', 'C', 'O'].map((id) => look(groups[id]))).toEqual(['gm 1', 'gm 2', 'gm 3', 'none']);
    badges.pass(seeing('A'));
    expect(captured(badges.layers(), groups, ['A', 'B', 'C'])).toEqual(['none', 'none', 'none']);
  });

  it('draw the players\' number in a second text of the same badge, sharing the GM text\'s style, anchor, place and resolution', () => {
    const { groups, badges } = table();
    badges.pass(seeing('A', 'B', 'C'));
    expect(badgeParts(groups.C!)?.playerText).toBeNull();
    badges.pass(seeing('A'));
    // C comes back into view beside A alone: it takes 2.
    badges.pass(seeing('A', 'C'));
    const parts = badgeParts(groups.C!)!;
    expect(parts.playerText).toBeInstanceOf(Text);
    expect(parts.playerText!.parent).toBe(parts.badge);
    expect(parts.playerText!.style).toBe(parts.text.style);
    expect(parts.playerText!.anchor.x).toBe(parts.text.anchor.x);
    expect(parts.playerText!.anchor.y).toBe(parts.text.anchor.y);
    expect([parts.playerText!.x, parts.playerText!.y]).toEqual([parts.text.x, parts.text.y]);
    expect(parts.playerText!.resolution).toBe(parts.text.resolution);
    expect(parts.playerText!.visible).toBe(false);
    // Only C's number differs, so only C has a second text.
    expect(badgeParts(groups.A!)?.playerText).toBeNull();
  });

  it('show nothing while badges are off or the GM\'s badge itself is not shown', () => {
    const { groups, state, badges, drawGm } = table();
    state.badgesOn = false;
    drawGm();
    badges.pass(seeing('A', 'B'));
    expect(captured(badges.layers(), groups, ['A', 'B'])).toEqual(['none', 'none']);
    state.badgesOn = true;
    badges.pass(seeing('A', 'B'));
    // The GM's badge is still off: never more badges than the GM view draws.
    expect(captured(badges.layers(), groups, ['A', 'B'])).toEqual(['none', 'none']);
  });

  it('list in a capture only the badges that show something other than the GM\'s, and none drawn off by the GM', () => {
    const { groups, badges } = table();
    badges.pass(seeing('A', 'B', 'C', 'O'));
    expect(badges.layers()).toEqual([]);
    badges.pass(seeing('A', 'B', 'O'));
    // C has left the view; the orc's badge is off in the GM view, so its leaves need no entry.
    expect(badges.layers().map(({ layer }) => layer)).toEqual([badgeParts(groups.C!)!.disc, badgeParts(groups.C!)!.text]);
  });

  it('start numbering anew on another map', () => {
    const { groups, state, badges } = table();
    badges.pass(seeing('B', 'C'));
    expect(captured(badges.layers(), groups, ['B', 'C'])).toEqual(['players 1', 'players 2']);
    state.mapPath = 'maps/b.atlasmap';
    badges.pass(seeing('A', 'B', 'C'));
    expect(captured(badges.layers(), groups, ['A', 'B', 'C'])).toEqual(['gm 1', 'gm 2', 'gm 3']);
  });

  it('start numbering anew after a reset, which also forgets what the canvas holds', () => {
    const { groups, badges } = table();
    badges.syncCanvas(seeing('B', 'C'));
    expect(look(groups.B)).toBe('players 1');
    badges.reset();
    expect(badges.gmLayers()).toEqual([]);
    // Every token takes its GM number again, so a capture changes nothing.
    badges.pass(seeing('A', 'B', 'C'));
    expect(badges.layers()).toEqual([]);
  });
});

describe('the players\' badges held on the canvas', () => {
  type Look = 'none' | 'players' | 'gm';
  /** How B gets into each look, and the step into each other one; `world` changes tokens before the pass. */
  const into: Record<Look, string[]> = { none: ['A'], players: ['B', 'C'], gm: ['A', 'B'] };
  const step = (from: Look, to: Look): { seen: string[]; world?: (tokens: Record<string, TokenEntity>) => void } => {
    if (from === 'gm' && to === 'players') return { seen: ['A', 'B'], world: (tokens) => { tokens.B!.instanceNumber = 5; } };
    if (from === 'players' && to === 'gm') return { seen: ['B', 'C'], world: (tokens) => { tokens.B!.instanceNumber = 1; } };
    if (from === 'players' && to === 'players') return { seen: ['A', 'B', 'C'] };
    if (from === 'gm' && to === 'gm') return { seen: ['A', 'B', 'C'] };
    if (to === 'none') return { seen: from === 'none' ? [] : ['B'] };
    return { seen: into[to] };
  };
  const expected = (look: Look, tokens: Record<string, TokenEntity>, number: number): string =>
    look === 'none' ? 'none' : look === 'gm' ? `gm ${tokens.B!.instanceNumber}` : `players ${number}`;
  const playersNumber: Record<string, number> = { 'none>players': 1, 'players>players': 1, 'gm>players': 2 };

  const looks: Look[] = ['none', 'players', 'gm'];
  it.each(looks.flatMap((from) => looks.map((to) => [from, to] as const)))('%s, then %s: on the canvas and in the next capture', (from, to) => {
    const { tokens, groups, badges, drawGm } = table();
    badges.syncCanvas(seeing(...into[from]));
    const { seen, world } = step(from, to);
    world?.(tokens);
    drawGm();
    badges.syncCanvas(seeing(...seen));
    const want = expected(to, tokens, playersNumber[`${from}>${to}`] ?? 0);
    expect(look(groups.B)).toBe(want);
    // The next capture is right over what the canvas holds, and over the GM's own badges.
    badges.pass(seeing(...seen));
    expect(captured(badges.layers(), groups, ['B'])).toEqual([want]);
    badges.syncCanvas(null);
    expect(look(groups.B)).toBe(`gm ${tokens.B!.instanceNumber}`);
    badges.pass(seeing(...seen));
    expect(captured(badges.layers(), groups, ['B'])).toEqual([want]);
  });

  it('gives a badge back its disc and GM number when it comes back to the GM\'s look', () => {
    const { groups, badges } = table();
    badges.syncCanvas(seeing('A', 'B'));
    badges.syncCanvas(seeing('A'));
    expect(['A', 'B'].map((id) => look(groups[id]))).toEqual(['none', 'none']);
    badges.syncCanvas(seeing('A', 'B'));
    expect(['A', 'B'].map((id) => look(groups[id]))).toEqual(['gm 1', 'gm 2']);
    // Only C, which the players do not see, is still held off the GM's look (the orc's badge is off).
    const held = badges.gmLayers().map(({ layer }) => layer);
    expect(held).toEqual(expect.arrayContaining([badgeParts(groups.C!)!.disc, badgeParts(groups.C!)!.text]));
    expect(held.some((layer) => layer === badgeParts(groups.A!)!.disc || layer === badgeParts(groups.B!)!.disc)).toBe(false);
  });

  it('gives a badge its disc back with the players\' number', () => {
    const { groups, badges } = table();
    badges.syncCanvas(seeing('A', 'B', 'C'));
    badges.syncCanvas(seeing('C'));
    badges.syncCanvas(seeing('B', 'C'));
    expect(['A', 'B', 'C'].map((id) => look(groups[id]))).toEqual(['none', 'players 1', 'gm 3']);
  });

  it('keeps the tokens it holds off the GM\'s look, and gives them all back when the canvas leaves the players\' view', () => {
    const { groups, badges } = table();
    badges.syncCanvas(seeing('B', 'C'));
    expect(badges.gmLayers().map(({ layer }) => layer)).toEqual(expect.arrayContaining([badgeParts(groups.B!)!.disc, badgeParts(groups.C!)!.text]));
    expect(badges.gmLayers().every(({ layer, visible }) => visible === (layer !== badgeParts(groups.B!)!.playerText && layer !== badgeParts(groups.C!)!.playerText))).toBe(true);
    badges.syncCanvas(null);
    expect(['A', 'B', 'C', 'O'].map((id) => look(groups[id]))).toEqual(['gm 1', 'gm 2', 'gm 3', 'none']);
    expect(badges.gmLayers()).toEqual([]);
  });

  it('writes nothing on the stage when a pass finds everything as the last one left it', () => {
    const { groups, badges } = table();
    badges.syncCanvas(seeing('A', 'C'));
    let writes = 0;
    for (const group of Object.values(groups)) {
      const parts = group && badgeParts(group);
      for (const leaf of parts ? [parts.disc, parts.text, parts.playerText] : []) leaf?.on('visibleChanged', () => writes++);
      group?.getChildByLabel('instanceBadge')?.on('childAdded', () => writes++);
    }
    const texts = Object.values(groups).map((group) => (group && badgeParts(group)?.playerText?.text) ?? null);
    badges.syncCanvas(seeing('A', 'C'));
    badges.pass(seeing('A', 'C'));
    expect(writes).toBe(0);
    expect(Object.values(groups).map((group) => (group && badgeParts(group)?.playerText?.text) ?? null)).toEqual(texts);
  });

  it('finds a badge drawn anew, and lets go of a token whose badge is gone', () => {
    const { tokens, groups, badges, drawGm } = table();
    badges.syncCanvas(seeing('B', 'C'));
    const old = groups.C!.getChildByLabel('instanceBadge')!;
    groups.C!.removeChild(old);
    old.destroy({ children: true });
    drawGm();
    badges.syncCanvas(seeing('B', 'C'));
    expect(look(groups.C)).toBe('players 2');
    groups.B!.destroy({ children: true });
    delete groups.B;
    delete tokens.B;
    badges.syncCanvas(seeing('C'));
    expect(badges.gmLayers().every(({ layer }) => !(layer as Container).destroyed)).toBe(true);
    expect(look(groups.C)).toBe('none');
  });
});

describe('the GM\'s badge drawing', () => {
  it('never writes the visibility of the badge\'s disc and texts', () => {
    const { groups, badges } = table();
    badges.syncCanvas(seeing('A', 'C'));
    const parts = badgeParts(groups.C!)!;
    const before = [parts.disc.visible, parts.text.visible, parts.playerText?.visible];
    updateInstanceBadge(groups.C!, 7, 50, true);
    updateInstanceBadge(groups.C!, 7, 50, false);
    updateInstanceBadge(groups.C!, 3, 36, true);
    expect([parts.disc.visible, parts.text.visible, parts.playerText?.visible]).toEqual(before);
  });
});
