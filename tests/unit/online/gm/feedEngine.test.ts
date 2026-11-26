import type { GmMessage } from '../../../../src/app/online/protocol/index.ts';
import { describe, expect, it } from 'vitest';
import { Feed, type FeedRules, type FeedScene } from '../../../../src/app/online/gm/feed/Feed.ts';
import { FeedGroup, keptWhileRead, ownScene, type FeedMember } from '../../../../src/app/online/gm/feed/FeedGroup.ts';
import type { FeedOut } from '../../../../src/app/online/gm/feed/feedOutbox.ts';
import { feedClock, type FeedClock } from './feedClock.ts';

/*
 * The rules every feed of a shared scene sends by, held once here on feeds that send what a test tells them to: the
 * scene and what a new one forgets, pacing, skipping a message that says the same, sequenced messages and their
 * resyncs, resends, and feeds driven as a group. Each feed is tested for what it builds from what it reads.
 */

interface Wire {
  readonly sent: { readonly body: GmMessage; readonly to: string | undefined; readonly live?: string }[];
  readonly clock: FeedClock;
}

const A: FeedScene = { id: 'scene-a', lit: false };
const B: FeedScene = { id: 'scene-b', lit: true };
const grid = (scene: string, size: number): GmMessage => ({ t: 'grid', scene, grid: { type: 'square', size, offsetX: 0, offsetY: 0 } } as GmMessage);
const kinds = (wire: Wire): string[] => wire.sent.map(({ body, to }) => `${body.t === 'delta' ? `delta/${body.of}` : body.t}${'seq' in body ? `#${body.seq}` : ''}${to === undefined ? '' : `>${to}`}`);

/** A feed whose build hands `build` its scene and outbox, and the wire it sends on. */
function feed(rules: Partial<FeedRules>, build: (scene: FeedScene, out: FeedOut) => void = () => undefined): Wire & { readonly feed: Feed; readonly builds: () => number } {
  const clock = feedClock();
  const sent: Wire['sent'] = [];
  let builds = 0;
  const made = new Feed({ ...clock, send: (body, to) => void sent.push({ body, to }), sendLive: (body, live) => void sent.push({ body, to: undefined, live }) }, {
    ...rules,
    build: (scene, out, cause) => {
      builds += 1;
      build(scene, out);
      return rules.build?.(scene, out, cause);
    },
  });
  return { sent, clock, feed: made, builds: () => builds };
}

describe('a feed', () => {
  it('builds at once, then at most once an interval, the last update always followed by a build', () => {
    const wire = feed({ interval: 100 });
    wire.feed.update();
    expect(wire.builds()).toBe(0);
    wire.feed.setScene(A);
    expect(wire.builds()).toBe(1);
    for (let step = 0; step < 5; step += 1) {
      wire.feed.update();
      wire.clock.advance(10);
    }
    expect(wire.builds()).toBe(1);
    wire.clock.advance(50);
    expect(wire.builds()).toBe(2);
    wire.clock.advance(1000);
    expect(wire.builds()).toBe(2);
    wire.feed.update();
    expect(wire.builds()).toBe(3);
  });

  it('counts its interval from the last build that sent something where it is paced by its sends, across scenes too', () => {
    let size = 70;
    const wire = feed({ interval: 100, paceSends: true }, (scene, out) => void out.send(grid(scene.id, size)));
    wire.feed.setScene(A);
    wire.clock.advance(10);
    wire.feed.update();
    expect(wire.builds()).toBe(1);
    wire.clock.advance(90);
    expect(wire.builds()).toBe(2);
    // That build sent nothing: the next one is not held back by it.
    size = 80;
    wire.feed.update();
    expect(wire.builds()).toBe(3);
    // A new scene's first message waits for the last one's interval as any other does.
    wire.feed.setScene(B);
    expect(wire.builds()).toBe(3);
    wire.clock.advance(100);
    expect(kinds(wire)).toEqual(['grid', 'grid', 'grid']);
  });

  it('builds at once when told to, dropping a build that waits, and looks once the interval since its last build has passed when asked soon', () => {
    const wire = feed({ interval: 100 });
    wire.feed.setScene(A);
    wire.feed.update();
    wire.feed.updateNow();
    expect(wire.builds()).toBe(2);
    wire.clock.advance(200);
    expect(wire.builds()).toBe(2);
    wire.feed.updateNow();
    let looks = 0;
    wire.feed.soon(() => void (looks += 1));
    wire.feed.soon(() => void (looks += 1));
    wire.clock.advance(100);
    expect(looks).toBe(1);
    // A build before the look is due makes it needless.
    wire.feed.updateNow();
    wire.feed.soon(() => void (looks += 1));
    wire.feed.updateNow();
    wire.clock.advance(500);
    expect(looks).toBe(1);
    // Cancelled, the build that waited goes, and the next update builds at once.
    wire.feed.update();
    wire.feed.update();
    wire.feed.cancel();
    wire.feed.update();
    wire.clock.advance(500);
    expect(wire.builds()).toBe(7);
  });

  it('skips a message that says what the last of its kind said, by its text or by the key it names, and tells whether a kind went out', () => {
    let size = 70;
    let key = 'one';
    const told: boolean[] = [];
    const wire = feed({}, (scene, out) => {
      told.push(out.has('grid'));
      out.send(grid(scene.id, size));
      out.send({ t: 'widgets', scene: scene.id, bar: null, size } as unknown as GmMessage, key);
    });
    wire.feed.setScene(A);
    wire.feed.update();
    size = 80;
    wire.feed.update();
    key = 'two';
    wire.feed.update();
    expect(kinds(wire)).toEqual(['grid', 'widgets', 'grid', 'widgets']);
    expect(told).toEqual([false, true, true, true]);
  });

  it('numbers sequenced messages across scenes, sends a change as a delta where that is smaller, and a new scene whole', () => {
    let tokens = [{ id: 'a', x: 1, y: 1 }, { id: 'b', x: 2, y: 2 }, { id: 'c', x: 3, y: 3 }];
    const wire = feed({ sequenced: ['tokens'] }, (_scene, out) => void out.sequenced('tokens', { tokens, cell: 70, snap: null } as never));
    wire.feed.setScene(A);
    tokens = tokens.map((token) => (token.id === 'b' ? { ...token, x: 20 } : token));
    wire.feed.update();
    wire.feed.update();
    wire.feed.setScene(B);
    expect(kinds(wire)).toEqual(['tokens#1', 'delta/tokens#2', 'tokens#3']);
  });

  it('sends again what it sent, whole: the kinds in the order they first went out, then the sequenced ones, then what each player was told alone, its channels and its parts', () => {
    const part = feed({}, (scene, out) => void out.send({ t: 'widgets', scene: scene.id, bar: null }));
    const channel: string[] = [];
    let size = 70;
    const wire = feed({ sequenced: ['fog'], channels: [{ resend: (to) => void channel.push(`resend ${to}`), reset: () => void channel.push('reset') }], parts: [part.feed] }, (scene, out) => {
      out.sequenced('fog', { fog: [] });
      out.send(grid(scene.id, size));
      out.send({ t: 'pins', scene: scene.id, pins: [] });
      out.to('ana', { t: 'mine', scene: scene.id, tokens: [] });
    });
    wire.feed.setScene(A);
    size = 80;
    wire.feed.update();
    wire.sent.length = 0;
    part.sent.length = 0;
    wire.feed.resend();
    wire.feed.resend('ben');
    expect(kinds(wire)).toEqual(['grid', 'pins', 'fog#1', 'mine>ana', 'grid>ben', 'pins>ben', 'fog#1>ben']);
    expect(wire.sent[0]?.body).toMatchObject({ grid: { size: 80 } });
    expect(channel).toEqual(['reset', 'resend undefined', 'resend ben']);
    expect(kinds(part)).toEqual(['widgets', 'widgets>ben']);
  });

  it('sends in place of a kept message what it says now, or nothing, where its content ages', () => {
    let age = 1;
    const wire = feed({ again: ({ body, key }) => (key === 'none' ? null : { ...body, age: (age += 1) } as GmMessage) }, (scene, out) => void out.send({ t: 'widgets', scene: scene.id, bar: null }, age > 2 ? 'none' : 'some'));
    wire.feed.setScene(A);
    wire.feed.resend('ana');
    age = 5;
    wire.feed.update();
    wire.feed.resend('ana');
    expect(wire.sent.map(({ body, to }) => [to, (body as unknown as { age?: number }).age])).toEqual([[undefined, undefined], ['ana', 2], [undefined, undefined]]);
  });

  it('answers a player who asks for a sequenced message whole at most once a second, only for the scene shared now', () => {
    const wire = feed({ sequenced: ['sight'] }, (_scene, out) => void out.sequenced('sight', { lighting: { enabled: true, ambient: 0 }, lights: [], tokens: [], held: [] }));
    wire.feed.setScene(A);
    wire.feed.resync('ana', { t: 'resync', scene: A.id, of: 'sight' });
    wire.feed.resync('ana', { t: 'resync', scene: A.id, of: 'sight' });
    wire.feed.resync('ben', { t: 'resync', scene: A.id, of: 'sight' });
    wire.feed.resync('ben', { t: 'resync', scene: A.id, of: 'fog' });
    wire.feed.resync('cara', { t: 'resync', scene: B.id, of: 'sight' });
    wire.clock.advance(1000);
    wire.feed.resync('ana', { t: 'resync', scene: A.id, of: 'sight' });
    expect(kinds(wire)).toEqual(['sight#1', 'sight#1>ana', 'sight#1>ben', 'sight#1>ana']);
  });

  it('keeps its scene for the same id, forgets what it sent for another, and then starts it as it says', () => {
    const events: string[] = [];
    const part = feed({ reset: (scene) => void events.push(`part ${scene?.id ?? null}`) });
    const wire = feed({ parts: [part.feed], reset: (scene) => void events.push(`reset ${scene?.id ?? null}`), opened: () => void events.push('opened') }, (scene, out) => void out.send(grid(scene.id, 70)));
    wire.feed.setScene(A);
    wire.feed.setScene({ ...A, lit: true });
    expect(wire.feed.scene).toEqual(A);
    wire.feed.setScene(B);
    wire.feed.update();
    wire.feed.resend('ana');
    wire.feed.clear();
    wire.feed.resend('ana');
    expect(events).toEqual(['reset scene-a', 'part scene-a', 'opened', 'reset scene-b', 'part scene-b', 'opened', 'reset null', 'part null']);
    expect(kinds(wire)).toEqual(['grid', 'grid>ana']);
  });

  it('sends nothing of a build that ends after its scene went, and nothing once it was stopped', async () => {
    let release = (): void => undefined;
    const clock = feedClock();
    const sent: GmMessage[] = [];
    const late = new Feed({ ...clock, send: (body) => void sent.push(body) }, {
      interval: 100,
      build: async (scene, out) => {
        await new Promise<void>((resolve) => (release = resolve));
        out.send(grid(scene.id, 70));
      },
    });
    late.setScene(A);
    late.setScene(B);
    late.setScene(null);
    release();
    await Promise.resolve();
    expect(sent).toEqual([]);
    late.setScene(A);
    late.update();
    late.stop();
    clock.advance(1000);
    release();
    await Promise.resolve();
    expect(sent).toEqual([]);
  });

  it('is built afresh where it is sent again that way, after forgetting what the player was told alone', () => {
    let tokens = ['t1'];
    const causes: string[] = [];
    const wire = feed({ resend: 'build', build: (_scene, _out, cause) => void causes.push(cause) }, (scene, out) => {
      out.keepOnly(new Set(['ana', 'ben']));
      for (const player of ['ana', 'ben']) out.to(player, { t: 'mine', scene: scene.id, tokens });
    });
    wire.feed.setScene(A);
    wire.feed.update();
    tokens = ['t2'];
    wire.feed.resend('ana');
    wire.feed.resend();
    expect(kinds(wire)).toEqual(['mine>ana', 'mine>ben', 'mine>ana', 'mine>ben', 'mine>ana', 'mine>ben']);
    expect(causes).toEqual(['update', 'update', 'resend', 'resend']);
  });

  it('sends live messages under their key, keeping none', () => {
    const wire = feed({}, (scene, out) => out.live({ t: 'live', scene: scene.id, at: 0, tokens: [] }, scene.id));
    wire.feed.setScene(A);
    wire.feed.resend();
    expect(wire.sent).toEqual([{ body: { t: 'live', scene: A.id, at: 0, tokens: [] }, to: undefined, live: A.id }]);
  });
});

/** A member that writes down what reaches it. */
function member(name: string, log: string[]): FeedMember {
  return {
    setScene: (scene) => void log.push(`${name} scene ${scene?.id ?? null}`),
    clear: () => void log.push(`${name} clear`),
    resend: (to) => void log.push(`${name} resend ${to ?? '*'}`),
    resync: (player) => void log.push(`${name} resync ${player}`),
    stop: () => void log.push(`${name} stop`),
  };
}

describe('feeds driven as a group', () => {
  it('reach every member in order, a resend or resync for one player only the groups they hear, placed first', () => {
    const log: string[] = [];
    const hears = new Map([['ana', 'left'], ['ben', 'right']]);
    const side = (key: string): FeedGroup => new FeedGroup(() => [member(`${key}1`, log), member(`${key}2`, log)], { reaches: (player) => hears.get(player) === key });
    const sides = [side('left'), side('right')];
    const group = new FeedGroup(() => sides, {
      seat: (player) => void log.push(`seat ${player}`),
      sceneChanged: (scene) => void log.push(`scene ${scene?.id ?? null}`),
      cleared: () => void log.push('cleared'),
    });
    group.setScene(A);
    group.resend('ben');
    group.resync('ana', { t: 'resync', scene: A.id, of: 'tokens' });
    group.clear();
    group.resend();
    group.stop();
    expect(log).toEqual([
      'scene scene-a', 'left1 scene scene-a', 'left2 scene scene-a', 'right1 scene scene-a', 'right2 scene scene-a',
      'seat ben', 'right1 resend ben', 'right2 resend ben',
      'seat ana', 'left1 resync ana', 'left2 resync ana',
      'cleared', 'left1 clear', 'left2 clear', 'right1 clear', 'right2 clear',
      'left1 resend *', 'left2 resend *', 'right1 resend *', 'right2 resend *',
      'left1 stop', 'left2 stop', 'right1 stop', 'right2 stop',
    ]);
  });

  it('leave the scene of a feed kept while the scene is read, and of one that takes its scene from another feed', () => {
    const log: string[] = [];
    const group = new FeedGroup(() => [keptWhileRead(member('live', log)), ownScene(member('mine', log))]);
    group.setScene(A);
    group.clear();
    group.resync('ana', { t: 'resync', scene: A.id, of: 'tokens' });
    group.resend('ana');
    group.stop();
    expect(log).toEqual(['live scene scene-a', 'live resync ana', 'live resend ana', 'mine resend ana', 'live stop', 'mine stop']);
  });
});
