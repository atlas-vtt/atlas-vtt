import { describe, expect, it } from 'vitest';
import { ALL_PLAYERS, deltaChanges, type GmMessage, type JsonRecord, type SharedToken } from '../../../../src/app/online/protocol/index.ts';
import { PlayerPages } from './playerPages.ts';

const ANA = 'a'.repeat(20);
const BEN = 'b'.repeat(20);
const SCENE = 'scene-1';

const rat = (x: number): SharedToken => ({ id: '0'.repeat(24), x, y: 100, size: 70, cells: 1, rotation: 0, art: null, name: 'Rat', ring: null, claim: null, badge: null, ui: null });
const list = (seq: number, x: number): Extract<GmMessage, { t: 'tokens' }> => ({ t: 'tokens', scene: SCENE, seq, tokens: [rat(x)], cell: 70, snap: null });
const content = (x: number): JsonRecord => ({ tokens: [rat(x)], cell: 70, snap: null }) as unknown as JsonRecord;
/** The delta that moves the rat from `from` to `x`, numbered `seq`. */
const moved = (seq: number, from: number, x: number): GmMessage => ({ t: 'delta', of: 'tokens', scene: SCENE, seq, ...deltaChanges('tokens', content(from), content(x)) });
const xs = (pages: PlayerPages, player: string): number[] => pages.of(player).all('tokens').map(({ tokens }) => tokens[0]?.x ?? -1);

describe('the players\' pages', () => {
  it('hear what is sent to all, and what is sent to them, while they are connected', () => {
    const pages = new PlayerPages();
    pages.join(ANA, BEN);
    pages.deliver({ t: 'scene', scene: null });
    pages.deliver(list(1, 100), ANA);
    pages.leave(BEN);
    pages.deliver({ t: 'scene', scene: null }, ALL_PLAYERS);
    expect(pages.of(ANA).inbox.map(({ t }) => t)).toEqual(['scene', 'tokens', 'scene']);
    expect(pages.of(BEN).inbox.map(({ t }) => t)).toEqual(['scene']);
    expect(pages.of(ANA).tokens.map(({ name }) => name)).toEqual(['Rat']);
    expect(pages.of(BEN).tokens).toEqual([]);
  });

  it('read a delta as the whole message it makes of what they hold, and keep it when they come back', () => {
    const pages = new PlayerPages();
    pages.join(ANA);
    pages.deliver(list(1, 100));
    pages.deliver(moved(2, 100, 140));
    pages.leave(ANA);
    pages.join(ANA);
    pages.deliver(moved(3, 140, 180));
    expect(xs(pages, ANA)).toEqual([100, 140, 180]);
    expect(pages.of(ANA).gaps).toEqual([]);
  });

  it('take a delta that does not follow on for a gap, and refuse to be read past it', () => {
    const pages = new PlayerPages();
    pages.join(ANA, BEN);
    pages.deliver(list(1, 100));
    pages.leave(BEN);
    pages.deliver(moved(2, 100, 140));
    pages.join(BEN);
    pages.deliver(moved(3, 140, 180));
    expect(xs(pages, ANA)).toEqual([100, 140, 180]);
    expect(pages.of(BEN).gaps).toEqual([moved(3, 140, 180)]);
    expect(() => pages.of(BEN).all('tokens')).toThrow(/missed a message/);
    expect(pages.of(BEN).all('scene')).toEqual([]);
  });

  it('tell what each page read after a mark, leaving out pages that read nothing of it', () => {
    const pages = new PlayerPages();
    pages.join(ANA, BEN);
    pages.deliver({ t: 'scene', scene: null });
    const mark = pages.mark();
    pages.deliver(list(1, 100), BEN);
    pages.deliver({ t: 'scene', scene: null }, ANA);
    expect(Object.keys(pages.since(mark, 'tokens'))).toEqual([BEN]);
    expect(pages.since(mark, 'tokens', 'scene')).toEqual({ [ANA]: [{ t: 'scene', scene: null }], [BEN]: [list(1, 100)] });
  });
});
