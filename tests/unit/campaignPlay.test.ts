// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import { CampaignPlay } from '../../src/app/campaigns/campaignPlay';
import { PLAY_SETTLE_MS, recordCampaignPlay } from '../../src/app/campaigns/recordCampaignPlay';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { memoryCampaigns } from '../mocks/memoryCampaigns';

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/** An app whose `atlas-vtt:scene-opened` the test sends, as a map view does once a scene has loaded. */
function appWithSceneOpens(): { app: App; localStorage: Map<string, unknown>; open: (sceneId: string) => void } {
  const { app, localStorage } = createInMemoryApp();
  const listeners: ((sceneId: string) => void)[] = [];
  vi.mocked(app.workspace.on).mockImplementation(((name: string, callback: (sceneId: string) => void) => {
    if (name === 'atlas-vtt:scene-opened') listeners.push(callback);
    return {};
  }) as never);
  return { app, localStorage, open: (sceneId) => { for (const listener of listeners) listener(sceneId); } };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('the campaign this device plays', () => {
  it('is kept in the device\'s local storage, read back, and announced when it changes', () => {
    const { app, localStorage } = createInMemoryApp();
    const play = CampaignPlay.forApp(app);
    expect(play.playing()).toBeNull();
    const heard = vi.fn();
    const unsubscribe = play.onChange(heard);
    play.play('c1');
    play.play('c1');
    expect(heard).toHaveBeenCalledTimes(1);
    expect(localStorage.get('atlas-vtt:table-campaign')).toBe('c1');
    play.play('c2');
    play.stop();
    expect(heard).toHaveBeenCalledTimes(3);
    expect(localStorage.has('atlas-vtt:table-campaign')).toBe(false);
    unsubscribe();
    play.play('c3');
    expect(heard).toHaveBeenCalledTimes(3);
    expect(CampaignPlay.forApp(app)).toBe(play);
  });

  it('never takes up a campaign Atlas 0.9.0 left played, and removes it', () => {
    const { app, localStorage } = createInMemoryApp();
    app.saveLocalStorage('atlas-vtt:playing-campaign', 'c1');
    expect(CampaignPlay.forApp(app).playing()).toBeNull();
    expect(localStorage.has('atlas-vtt:playing-campaign')).toBe(false);
  });

  it('reads only an id from local storage', () => {
    for (const [stored, expected] of [['c1', 'c1'], [42, null], [{ id: 'c1' }, null], ['', null]] as const) {
      const { app } = createInMemoryApp();
      app.saveLocalStorage('atlas-vtt:table-campaign', stored);
      expect(CampaignPlay.forApp(app).playing()).toBe(expected);
    }
  });
});

describe('recording what a played campaign plays', () => {
  it('records every scene opened while a campaign is played, and none while none is', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: 1000 });
    const { app, open } = appWithSceneOpens();
    const storage = memoryCampaigns([{ id: 'c1', name: 'Cairn', createdAt: 1 }]);
    const play = CampaignPlay.forApp(app);
    const release = recordCampaignPlay(app, storage, Promise.resolve(), play);
    open('s0');
    await settle();
    expect(storage.current()[0]).not.toHaveProperty('lastScene');

    play.play('c1');
    open('s1');
    vi.setSystemTime(2000);
    open('s2');
    await settle();
    expect(storage.current()[0]).toMatchObject({ lastScene: 's2', lastPlayed: 2000, used: { scenes: { s1: { first: 1000, last: 1000 }, s2: { first: 2000, last: 2000 } } } });

    release();
    open('s3');
    await settle();
    expect(storage.current()[0]).toMatchObject({ lastScene: 's2' });
  });

  it('records a scene opened before the campaigns were read, at the time it opened', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: 1000 });
    const { app, open } = appWithSceneOpens();
    const storage = memoryCampaigns([{ id: 'c1', name: 'Cairn', createdAt: 1 }]);
    CampaignPlay.forApp(app).play('c1');
    let read = (): void => undefined;
    recordCampaignPlay(app, storage, new Promise<void>((resolve) => { read = resolve; }));
    open('s1');
    vi.setSystemTime(5000);
    read();
    await settle();
    expect(storage.current()[0]).toMatchObject({ lastScene: 's1', lastPlayed: 1000 });
  });

  it('ends the play once the campaign stays gone, deleted here or elsewhere, but not before the campaigns are read', async () => {
    vi.useFakeTimers();
    const { app } = appWithSceneOpens();
    const storage = memoryCampaigns([{ id: 'c1', name: 'Cairn', createdAt: 1 }]);
    const play = CampaignPlay.forApp(app);
    play.play('missing');
    let read = (): void => undefined;
    recordCampaignPlay(app, storage, new Promise<void>((resolve) => { read = resolve; }), play);
    storage.create({ id: 'c2', name: 'Moor', createdAt: 2 });
    vi.advanceTimersByTime(PLAY_SETTLE_MS * 2);
    expect(play.playing()).toBe('missing');
    read();
    await vi.advanceTimersByTimeAsync(PLAY_SETTLE_MS - 1);
    expect(play.playing()).toBe('missing');
    vi.advanceTimersByTime(1);
    expect(play.playing()).toBeNull();

    play.play('c1');
    storage.update('c1', (entry) => ({ ...entry, name: 'Cairn: Blue Mouth Caves' }));
    storage.remove('c1');
    vi.advanceTimersByTime(PLAY_SETTLE_MS - 1);
    expect(play.playing()).toBe('c1');
    vi.advanceTimersByTime(1);
    expect(play.playing()).toBeNull();
  });

  it('keeps the play through a sync that leaves the campaign missing for a moment', async () => {
    vi.useFakeTimers();
    const { app } = appWithSceneOpens();
    const campaign = { id: 'c1', name: 'Cairn', createdAt: 1 };
    const storage = memoryCampaigns([campaign]);
    const play = CampaignPlay.forApp(app);
    play.play('c1');
    recordCampaignPlay(app, storage, Promise.resolve(), play);
    await vi.advanceTimersByTimeAsync(0);

    // A half-written file reads as no campaign, then the whole file arrives.
    storage.remove('c1');
    vi.advanceTimersByTime(PLAY_SETTLE_MS / 2);
    storage.create(campaign);
    vi.advanceTimersByTime(PLAY_SETTLE_MS * 2);
    expect(play.playing()).toBe('c1');

    // A folder delivered as deleted and created again, each change starting the wait anew.
    storage.remove('c1');
    vi.advanceTimersByTime(PLAY_SETTLE_MS - 1);
    storage.create({ id: 'other', name: 'Moor', createdAt: 2 });
    vi.advanceTimersByTime(PLAY_SETTLE_MS - 1);
    storage.create(campaign);
    vi.advanceTimersByTime(PLAY_SETTLE_MS * 2);
    expect(play.playing()).toBe('c1');
  });

  it('keeps the play when the campaigns could not be read', async () => {
    const { app } = appWithSceneOpens();
    const play = CampaignPlay.forApp(app);
    play.play('c1');
    recordCampaignPlay(app, memoryCampaigns(), Promise.reject(new Error('unreadable')), play);
    await settle();
    expect(play.playing()).toBe('c1');
  });

  it('leaves a campaign a newer Atlas saved as it is', async () => {
    const { app, open } = appWithSceneOpens();
    const storage = memoryCampaigns([{ id: 'c1', name: 'Cairn', createdAt: 1, format: 2 }]);
    const play = CampaignPlay.forApp(app);
    play.play('c1');
    recordCampaignPlay(app, storage, Promise.resolve(), play);
    open('s1');
    await settle();
    expect(storage.current()[0]).toEqual({ id: 'c1', name: 'Cairn', createdAt: 1, format: 2 });
    expect(play.playing()).toBe('c1');
  });
});
