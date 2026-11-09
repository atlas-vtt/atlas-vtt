// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { desiredSound } from '@/app/sound/engine/desiredSound';
import type { SceneSound, TableSound } from '@/app/sound/soundTypes';
import { heldInMix } from '@/app/soundDirector/libraryDesk';
import { SCENE_FOLLOW_DELAY_MS } from '@/app/soundDirector/sceneFollow';
import type { FightState, FightStore } from '@/app/soundDirector/fightWatch';
import { directorRig, factsOf, mood, record, settle, type DirectorRig } from '../../helpers/soundDirectorRig';

const RAIN = record('rain');
const WIND = record('wind');
const FIRE = record('fire');
const SONG = record('song', 'music');
const ALL = [RAIN, WIND, FIRE, SONG];

function fightStore(path: string, sound: SceneSound | null): FightStore & { set(change: Partial<FightState>): void } {
  let state: FightState = { mapPath: path, isMapLoading: false, sound, initiative: { isActive: false } };
  const listeners = new Set<(next: FightState, previous: FightState) => void>();
  return {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    set: (change) => {
      const previous = state;
      state = { ...state, ...change };
      for (const listener of listeners) listener(state, previous);
    },
  };
}

async function ready(rig: DirectorRig): Promise<void> {
  await settle();
  for (const sound of rig.records) rig.director.shelf.stateOf(sound);
  await settle();
}

const layersOf = (rig: DirectorRig): (string | undefined)[] => rig.director.snapshot().mix.table.layers.map((play) => play.sound.key);

describe('the sound director', () => {
  let rig: DirectorRig;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
    vi.setSystemTime(1_000_000);
  });

  afterEach(() => {
    rig?.director.destroy();
    vi.useRealTimers();
  });

  it('reads the waveform of music from its file, and none of ambience', async () => {
    rig = directorRig(ALL);
    await ready(rig);
    expect(rig.director.shelf.peaksOfKey('hash-audio/song.ogg')).toEqual(Uint8Array.of(10, 200, 30));
    expect(rig.director.shelf.peaksOfKey('hash-audio/rain.ogg')).toBeNull();
  });

  it('makes no context until something plays, and one on the first press', async () => {
    rig = directorRig(ALL);
    await ready(rig);
    expect(rig.contexts).toHaveLength(0);
    rig.director.press(mood('tavern', ['rain']));
    expect(rig.contexts).toHaveLength(1);
    expect(layersOf(rig)).toEqual(['hash-audio/rain.ogg']);
    expect(rig.contexts[0]?.sources.length).toBeGreaterThanOrEqual(1);
  });

  it('goes on through everything that is not the plugin: the DM screen, tabs and maps never touch it', async () => {
    rig = directorRig(ALL);
    await ready(rig);
    const states: TableSound[] = [];
    rig.director.onStateChanged((state) => states.push(state));
    const subscriber = vi.fn();
    const stop = rig.director.subscribe(subscriber);
    rig.director.press(mood('tavern', ['rain']));
    const context = rig.contexts[0];
    const before = rig.director.snapshot().mix.table;
    // A pane closing is a subscriber leaving; a map closing is a view leaving.
    stop();
    rig.director.joinView('v', fightStore('map', null));
    rig.director.leaveView('v');
    await vi.advanceTimersByTimeAsync(30 * 60 * 1000);
    expect(rig.director.snapshot().mix.table).toBe(before);
    expect(context?.closed).toBe(false);
    expect(rig.contexts).toHaveLength(1);
    expect(states).toHaveLength(1);
  });

  it('tells a new state only once the snapshot holds it, so a table online that reads the snapshot sends this change and not the last', async () => {
    rig = directorRig(ALL);
    await ready(rig);
    const seen: Array<[TableSound, TableSound]> = [];
    rig.director.onStateChanged((state) => seen.push([state, rig.director.snapshot().mix.table]));
    rig.director.press(mood('tavern', ['rain']));
    rig.director.stop();
    expect(seen.length).toBeGreaterThanOrEqual(2);
    for (const [told, snapshot] of seen) expect(snapshot).toBe(told);
  });

  it('closes every context when the plugin unloads', async () => {
    rig = directorRig(ALL);
    await ready(rig);
    rig.director.press(mood('tavern', ['rain']));
    rig.director.preview(WIND);
    rig.director.destroy();
    expect(rig.contexts.every((context) => context.closed)).toBe(true);
  });

  it('what the mix holds is told by the file as this device calls it, which the shared record may not', async () => {
    rig = directorRig(ALL);
    await ready(rig);
    rig.filedAs.set(RAIN.filePath, 'atlas-sound:ambience/Elsewhere/rain.ogg');
    rig.director.press(mood('tavern', ['rain']));
    expect([...heldInMix(rig.director).keys()]).toEqual(['atlas-sound:ambience/Elsewhere/rain.ogg']);
  });

  it('holds the library only while the switch is on', async () => {
    rig = directorRig(ALL, { on: false });
    expect(rig.library).toEqual({ opened: 0, released: 0 });
    rig.settings.on = true;
    rig.fireSettings();
    expect(rig.library).toEqual({ opened: 1, released: 0 });
    rig.settings.on = false;
    rig.fireSettings();
    expect(rig.library).toEqual({ opened: 1, released: 1 });
    rig.settings.on = true;
    rig.fireSettings();
    expect(rig.library).toEqual({ opened: 2, released: 1 });
  });

  it('closes the context an unload finds still fading after the switch went off, and stops its timer', async () => {
    rig = directorRig(ALL);
    await ready(rig);
    rig.director.press(mood('tavern', ['rain']));
    rig.settings.on = false;
    rig.fireSettings();
    expect(rig.contexts[0]?.closed).toBe(false);
    rig.director.destroy();
    expect(rig.contexts[0]?.closed).toBe(true);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('asks nothing of a file for a sound whose conversion comes up after the unload', async () => {
    const onDisk = record('disk');
    rig = directorRig([onDisk], { ready: false });
    await settle();
    rig.director.shelf.request([onDisk], true);
    const statOf = vi.spyOn(rig.files, 'has');
    rig.director.destroy();
    const asked = statOf.mock.calls.length;
    await settle();
    expect(statOf.mock.calls.length).toBe(asked);
    expect(rig.conversions).toHaveLength(0);
  });

  it('lets go of the context when the last fade has ended, and comes back on the next press', async () => {
    rig = directorRig(ALL);
    await ready(rig);
    rig.director.press(mood('tavern', ['rain'], 'keep', 1));
    rig.director.stop();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(rig.contexts[0]?.closed).toBe(true);
    rig.director.press(mood('tavern', ['rain'], 'keep', 1));
    expect(rig.contexts).toHaveLength(2);
  });

  it('switching off fades out, tears down, and asks nothing of what is off', async () => {
    rig = directorRig(ALL);
    await ready(rig);
    rig.director.press(mood('tavern', ['rain']));
    rig.settings.on = false;
    rig.fireSettings();
    expect(rig.director.isOn).toBe(false);
    expect(rig.director.snapshot().mix.table.layers).toEqual([]);
    expect(rig.director.snapshot().mix.table.outgoingLayers).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(rig.contexts[0]?.closed).toBe(true);
    rig.director.press(mood('tavern', ['rain']));
    expect(rig.contexts).toHaveLength(1);
  });

  it('starts what is ready and joins the rest when its copy is made, what the GM pressed going first', async () => {
    rig = directorRig([RAIN, WIND, FIRE], { ready: false });
    await ready(rig);
    rig.director.shelf.request([FIRE]);
    await settle();
    rig.director.press(mood('tavern', ['wind', 'rain']));
    await settle();
    expect(layersOf(rig)).toEqual([]);
    expect(rig.director.snapshot().mix.waitingLayers.map((layer) => layer.sound)).toEqual(['wind', 'rain']);
    // Fire was under way already; what was pressed starts beside it at once, never behind it.
    expect(rig.conversions.length).toBeGreaterThanOrEqual(2);
    const conversionOf = async (id: string): Promise<DirectorRig['conversions'][number]> => {
      const textOf = (blob: Blob): Promise<string> => new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.readAsText(blob);
      });
      for (const conversion of rig!.conversions) if ((await textOf(conversion.source)).includes(id)) return conversion;
      throw new Error(`No conversion of ${id}`);
    };
    (await conversionOf('wind')).finish();
    await settle();
    const names = (): (string | undefined)[] => rig.director.snapshot().mix.table.layers.map((play) => rig.director.shelf.recordOfKey(play.sound.key)?.id);
    expect(names()).toEqual(['wind']);
    (await conversionOf('fire')).finish();
    await settle();
    (await conversionOf('rain')).finish();
    await settle();
    expect(names()).toEqual(['wind', 'rain']);
    expect(rig.director.snapshot().mix.waitingLayers).toEqual([]);
  });

  it('tells the copy maker the sound key and the file name it writes into the copy', async () => {
    rig = directorRig([record('rain', 'music')], { ready: false });
    await ready(rig);
    rig.director.shelf.request([rig.records[0]!], true);
    await settle();
    const { sha256 } = await import('@/app/utils/hashing');
    expect(rig.conversions[0]?.job).toMatchObject({ key: await sha256(new TextEncoder().encode('audio/rain.ogg').buffer), from: 'rain.ogg', kind: 'music' });
  });

  it('tells a refusal once, and shows it on the sound', async () => {
    rig = directorRig([RAIN], { ready: false });
    await ready(rig);
    const { SoundImportError } = await import('@/app/sound/codec/demux/demuxTypes');
    rig.director.shelf.request([RAIN], true);
    await settle();
    rig.conversions[0]?.fail(new SoundImportError('unsupported-codec', 'alac'));
    await settle();
    expect(rig.director.shelf.stateOf(RAIN)).toEqual({ state: 'refused', reason: 'unsupported-codec' });
    expect(rig.notices).toHaveLength(1);
    rig.director.shelf.request([RAIN], true);
    await settle();
    expect(rig.conversions).toHaveLength(1);
  });

  it('never converts a file that is a copy already: the file says so itself', async () => {
    rig = directorRig([RAIN], { ready: false });
    rig.copies.set(RAIN.filePath, { facts: factsOf('x'), blob: new Blob([new Uint8Array(4)]) });
    await ready(rig);
    rig.director.shelf.request([RAIN], true);
    await settle();
    expect(rig.director.shelf.stateOf(RAIN).state).toBe('ready');
    expect(rig.conversions).toHaveLength(0);
  });

  it('names a copy by its record, though a file without one holds the same copy', async () => {
    rig = directorRig([RAIN]);
    await ready(rig);
    const row = record('row');
    rig.files.add(row.filePath);
    rig.copies.set(row.filePath, { facts: factsOf(`hash-${RAIN.filePath}`), blob: new Blob([new Uint8Array(4)]) });
    rig.director.shelf.stateOf(row);
    await settle();
    expect(rig.director.shelf.stateOf(row).state).toBe('ready');
    expect(rig.director.shelf.recordOfKey(`hash-${RAIN.filePath}`)?.id).toBe('rain');
  });

  it('converts nothing in a folder the GM has not agreed to', async () => {
    rig = directorRig([RAIN], { ready: false });
    rig.folder.choice = null;
    await ready(rig);
    rig.director.shelf.request([RAIN], true);
    await settle();
    expect(rig.conversions).toHaveLength(0);
    expect(rig.director.shelf.stateOf(RAIN).state).toBe('not-converted');
  });

  it('a preview is no state of the table and reaches nobody listening to it', async () => {
    rig = directorRig(ALL);
    await ready(rig);
    const states: TableSound[] = [];
    rig.director.onStateChanged((state) => states.push(state));
    rig.director.preview(WIND);
    expect(rig.director.snapshot().previewing).toBe('wind');
    expect(rig.director.snapshot().mix.table.layers).toEqual([]);
    rig.director.preview(WIND);
    expect(rig.director.snapshot().previewing).toBeNull();
    expect(states).toEqual([]);
  });

  it('offers back what played after a restart, and plays nothing by itself', async () => {
    rig = directorRig(ALL);
    await ready(rig);
    rig.director.press(mood('tavern', ['rain']));
    await vi.advanceTimersByTimeAsync(2000);
    rig.director.destroy();
    const saved = rig.storage.get('atlas-vtt:sound-last');
    expect(saved).toMatchObject({ mood: { id: 'tavern' } });

    const next = directorRig(ALL);
    next.storage.set('atlas-vtt:sound-last', saved);
    next.settings.on = false;
    next.fireSettings();
    next.settings.on = true;
    next.fireSettings();
    await ready(next);
    expect(next.contexts).toHaveLength(0);
    expect(next.director.snapshot().lastMix?.mood?.id).toBe('tavern');
    next.director.resume();
    expect(layersOf(next)).toEqual(['hash-audio/rain.ogg']);
    next.director.destroy();
  });

  it('stop leaves nothing to bring back', async () => {
    rig = directorRig(ALL);
    await ready(rig);
    rig.director.press(mood('tavern', ['rain']));
    await vi.advanceTimersByTimeAsync(2000);
    rig.director.stop();
    expect(rig.storage.get('atlas-vtt:sound-last')).toBeNull();
  });

  describe('following the table', () => {
    const tavern = mood('tavern', ['rain']);
    const battle = mood('battle', ['fire']);

    function followRig(): DirectorRig {
      const made = directorRig(ALL);
      made.moods.current = [tavern, battle];
      return made;
    }

    it('plays the presented scene’s mood after the wait, not before, and a scene without a link changes nothing', async () => {
      rig = followRig();
      await ready(rig);
      rig.scenes.set('a.atlasmap', { mood: 'tavern' });
      rig.setPresented({ tabId: 't', filePath: 'a.atlasmap' });
      await vi.advanceTimersByTimeAsync(SCENE_FOLLOW_DELAY_MS - 10);
      expect(layersOf(rig)).toEqual([]);
      await vi.advanceTimersByTimeAsync(20);
      await settle();
      expect(layersOf(rig)).toEqual(['hash-audio/rain.ogg']);
      rig.setPresented({ tabId: 'u', filePath: 'b.atlasmap' });
      await vi.advanceTimersByTimeAsync(SCENE_FOLLOW_DELAY_MS + 10);
      await settle();
      expect(layersOf(rig)).toEqual(['hash-audio/rain.ogg']);
    });

    it('passing through scenes plays only the last', async () => {
      rig = followRig();
      await ready(rig);
      rig.scenes.set('a.atlasmap', { mood: 'tavern' });
      rig.scenes.set('b.atlasmap', { mood: 'battle' });
      rig.setPresented({ tabId: 't', filePath: 'a.atlasmap' });
      await vi.advanceTimersByTimeAsync(500);
      rig.setPresented({ tabId: 'u', filePath: 'b.atlasmap' });
      await vi.advanceTimersByTimeAsync(SCENE_FOLLOW_DELAY_MS + 10);
      await settle();
      expect(layersOf(rig)).toEqual(['hash-audio/fire.ogg']);
    });

    it('a press beats a scene’s mood on its way, and holds until the next change', async () => {
      rig = followRig();
      await ready(rig);
      rig.scenes.set('a.atlasmap', { mood: 'tavern' });
      rig.setPresented({ tabId: 't', filePath: 'a.atlasmap' });
      await vi.advanceTimersByTimeAsync(500);
      rig.director.press(battle);
      await vi.advanceTimersByTimeAsync(SCENE_FOLLOW_DELAY_MS * 2);
      await settle();
      expect(rig.director.snapshot().mix.mood?.id).toBe('battle');
      rig.scenes.set('b.atlasmap', { mood: 'tavern' });
      rig.setPresented({ tabId: 'u', filePath: 'b.atlasmap' });
      await vi.advanceTimersByTimeAsync(SCENE_FOLLOW_DELAY_MS + 10);
      await settle();
      expect(rig.director.snapshot().mix.mood?.id).toBe('tavern');
    });

    it('the switch off turns all of it off', async () => {
      rig = followRig();
      await ready(rig);
      rig.settings.followScenes = false;
      rig.scenes.set('a.atlasmap', { mood: 'tavern', combatMood: 'battle' });
      rig.setPresented({ tabId: 't', filePath: 'a.atlasmap' });
      await vi.advanceTimersByTimeAsync(SCENE_FOLLOW_DELAY_MS + 10);
      const store = fightStore('a.atlasmap', { combatMood: 'battle' });
      rig.director.joinView('v', store);
      store.set({ initiative: { isActive: true } });
      await settle();
      expect(layersOf(rig)).toEqual([]);
    });

    it('a fight plays the combat mood, and its end goes back to what played before, live changes included', async () => {
      rig = followRig();
      await ready(rig);
      rig.setPresented({ tabId: 't', filePath: 'a.atlasmap' });
      const store = fightStore('a.atlasmap', { combatMood: 'battle' });
      rig.director.joinView('v', store);
      rig.director.press(tavern);
      rig.director.desk.addSound(WIND);
      store.set({ initiative: { isActive: true } });
      await settle();
      expect(rig.director.snapshot().mix.mood?.id).toBe('battle');
      expect(layersOf(rig)).toEqual(['hash-audio/fire.ogg']);
      store.set({ initiative: { isActive: false } });
      await settle();
      expect(rig.director.snapshot().mix.mood?.id).toBe('tavern');
      expect(layersOf(rig).sort()).toEqual(['hash-audio/rain.ogg', 'hash-audio/wind.ogg']);
    });

    it('a fight in a scene being prepared on another tab changes nothing, nor one a load brings', async () => {
      rig = followRig();
      await ready(rig);
      rig.setPresented({ tabId: 't', filePath: 'a.atlasmap' });
      const other = fightStore('other.atlasmap', { combatMood: 'battle' });
      rig.director.joinView('v', other);
      other.set({ initiative: { isActive: true } });
      const loading = fightStore('a.atlasmap', { combatMood: 'battle' });
      rig.director.joinView('w', loading);
      loading.set({ isMapLoading: true });
      loading.set({ initiative: { isActive: true } });
      loading.set({ isMapLoading: false });
      await settle();
      expect(layersOf(rig)).toEqual([]);
    });

    it('a link to a mood that is gone reads as no link', async () => {
      rig = followRig();
      await ready(rig);
      rig.scenes.set('a.atlasmap', { mood: 'gone' });
      rig.setPresented({ tabId: 't', filePath: 'a.atlasmap' });
      await vi.advanceTimersByTimeAsync(SCENE_FOLLOW_DELAY_MS + 10);
      await settle();
      expect(rig.contexts).toHaveLength(0);
    });

    it('a mood already playing is not pressed again, which would undo live changes', async () => {
      rig = followRig();
      await ready(rig);
      rig.director.press(tavern);
      rig.director.desk.setLayerLevel('hash-audio/rain.ogg', -20);
      rig.scenes.set('a.atlasmap', { mood: 'tavern' });
      rig.setPresented({ tabId: 't', filePath: 'a.atlasmap' });
      await vi.advanceTimersByTimeAsync(SCENE_FOLLOW_DELAY_MS + 10);
      await settle();
      expect(rig.director.snapshot().mix.table.layers[0]?.gainDb).toBe(-20);
    });
  });

  it('next mood goes through the row and round', async () => {
    rig = directorRig(ALL);
    await ready(rig);
    rig.moods.current = [mood('a', ['rain']), mood('b', ['wind'])];
    rig.director.pressNext();
    expect(rig.director.snapshot().mix.mood?.id).toBe('a');
    rig.director.pressNext();
    expect(rig.director.snapshot().mix.mood?.id).toBe('b');
    rig.director.pressNext();
    expect(rig.director.snapshot().mix.mood?.id).toBe('a');
  });

  it('Save as mood and Save to mood take what plays and leave the live mix as it is', async () => {
    rig = directorRig(ALL);
    await ready(rig);
    rig.director.desk.addSound(RAIN);
    rig.director.desk.addSound(SONG);
    rig.director.desk.setLayerLevel('hash-audio/rain.ogg', -9);
    const made = rig.director.desk.saveAsMood('Rainy');
    expect(made).toMatchObject({ name: 'Rainy', fadeSeconds: 4, layers: [{ sound: 'rain', levelDb: -9 }], music: { tracks: ['song'], shuffle: false } });
    expect(rig.director.snapshot().mix.mood?.id).toBe(made.id);
    rig.director.desk.addSound(WIND);
    rig.director.desk.saveToMood(made);
    expect(rig.moods.current[0]?.layers.map((layer) => layer.sound)).toEqual(['rain', 'wind']);
  });

  it('a live change is not saved to the mood until the GM chooses', async () => {
    rig = directorRig(ALL);
    await ready(rig);
    const saved = mood('tavern', ['rain']);
    rig.moods.current = [saved];
    rig.director.press(saved);
    rig.director.desk.setLayerLevel('hash-audio/rain.ogg', -30);
    expect(rig.moods.current[0]).toBe(saved);
  });

  it('refuses a sound already in the mix', async () => {
    rig = directorRig(ALL);
    await ready(rig);
    expect(rig.director.desk.addSound(RAIN)).toBe(true);
    expect(rig.director.desk.addSound(RAIN)).toBe(false);
    expect(rig.director.desk.addSound(SONG)).toBe(true);
    expect(rig.director.desk.addSound(SONG)).toBe(false);
  });

  it('the clock is a seam: a table clock and its lead place what starts', async () => {
    rig = directorRig(ALL);
    await ready(rig);
    rig.director.useTableClock({ now: () => 5_000_000, leadMs: 1000 });
    rig.director.press(mood('tavern', ['rain']));
    expect(rig.director.snapshot().mix.table.layers[0]?.startAt).toBe(5_001_000);
  });

  describe('another clock', () => {
    const MINUTES = 5 * 60_000;
    const positionOf = (now: number): number[] => {
      const { table } = rig.director.snapshot().mix;
      return desiredSound(table, now).voices.map((voice) => Math.round(voice.playFrame));
    };

    it('leaves what plays at its position, both ways, and what enters still enters', async () => {
      rig = directorRig(ALL);
      await ready(rig);
      rig.director.press(mood('tavern', ['rain'], { tracks: ['song'], shuffle: false, levelDb: 0 }));
      await vi.advanceTimersByTimeAsync(30_000);
      const before = positionOf(rig.director.now());
      const states: TableSound[] = [];
      rig.director.onStateChanged((state) => states.push(state));

      rig.director.useTableClock({ now: () => Date.now() - MINUTES, leadMs: 1000 });
      expect(positionOf(rig.director.now())).toEqual(before);
      const { table } = rig.director.snapshot().mix;
      expect(table.layers[0]!.startAt).toBeLessThanOrEqual(rig.director.now());
      expect(table.layers[0]!.fade.at).toBe(table.layers[0]!.startAt);
      expect(table.music!.fade.at).toBe(table.music!.startAt);
      expect(states).toHaveLength(1);

      await vi.advanceTimersByTimeAsync(5000);
      const onTable = positionOf(rig.director.now());
      rig.director.useTableClock(null);
      expect(positionOf(rig.director.now())).toEqual(onTable);
      expect(rig.director.snapshot().mix.table.layers[0]!.startAt).toBeLessThanOrEqual(Date.now());
    });

    it('a clock that steps by itself moves it the same way', async () => {
      rig = directorRig(ALL);
      await ready(rig);
      let offset = 0;
      rig.director.useTableClock({ now: () => Date.now() + offset, leadMs: 1000 });
      rig.director.press(mood('tavern', ['rain']));
      await vi.advanceTimersByTimeAsync(10_000);
      const before = positionOf(rig.director.now());
      offset = -MINUTES;
      rig.director.tableClockStepped(-MINUTES);
      expect(positionOf(rig.director.now())).toEqual(before);
    });

    it('the same to within what a voice leaves alone keeps the state', async () => {
      rig = directorRig(ALL);
      await ready(rig);
      rig.director.press(mood('tavern', ['rain']));
      const { table } = rig.director.snapshot().mix;
      rig.director.useTableClock({ now: () => Date.now() + 20, leadMs: 1000 });
      expect(rig.director.snapshot().mix.table).toBe(table);
    });

    it('with nothing playing changes no state', async () => {
      rig = directorRig(ALL);
      await ready(rig);
      const { table } = rig.director.snapshot().mix;
      rig.director.useTableClock({ now: () => Date.now() + MINUTES, leadMs: 1000 });
      expect(rig.director.snapshot().mix.table).toBe(table);
    });

    it('a silence stays over or under way as it was', async () => {
      rig = directorRig(ALL);
      await ready(rig);
      rig.director.press(mood('tavern', ['rain']));
      await vi.advanceTimersByTimeAsync(5000);
      rig.director.desk.toggleSilence();
      await vi.advanceTimersByTimeAsync(500);
      const { silenceFade } = rig.director.snapshot().mix.table;
      const left = silenceFade.at + silenceFade.ms - rig.director.now();
      rig.director.useTableClock({ now: () => Date.now() - MINUTES, leadMs: 1000 });
      const after = rig.director.snapshot().mix.table.silenceFade;
      expect(after.at + after.ms - rig.director.now()).toBe(left);
    });
  });

  it('Stop all holds the music where it is, and Bring back starts it there, with nothing else in the mix', async () => {
    rig = directorRig(ALL);
    await ready(rig);
    rig.director.press(mood('song only', [], { tracks: ['song'], shuffle: false }));
    await vi.advanceTimersByTimeAsync(5000);
    rig.director.desk.toggleSilence();
    const stopped = rig.director.snapshot().mix;
    expect(stopped.table.silenced).toBe(true);
    expect(stopped.paused?.byStop).toBe(true);
    // Long after the fade nothing sounds, and Bring back still brings it back.
    await vi.advanceTimersByTimeAsync(60_000);
    rig.director.desk.toggleSilence();
    const back = rig.director.snapshot().mix;
    expect(back.table.silenced).toBe(false);
    expect(back.paused).toBeUndefined();
    expect(back.table.music!.startAt).toBe(stopped.paused!.play.startAt + (rig.director.now() - stopped.paused!.at));
  });

  it('the audience line is a seam', async () => {
    rig = directorRig(ALL);
    await ready(rig);
    rig.director.useAudience({ line: () => '3 of 5 hearing', detail: () => 'Hearing: Kara.', onChange: () => () => undefined });
    expect(rig.director.snapshot().audience).toBe('3 of 5 hearing');
    expect(rig.director.snapshot().audienceDetail).toBe('Hearing: Kara.');
  });

  it('moves every context to the chosen output, and says once when it is gone', async () => {
    rig = directorRig(ALL);
    await ready(rig);
    rig.director.press(mood('tavern', ['rain']));
    const context = rig.contexts[0];
    if (!context) throw new Error('no context');
    rig.director.setOutput({ id: 'usb', label: 'USB headset' });
    await settle();
    expect(context.sinkIds).toContain('usb');
    context.setSinkId = (id: string): Promise<void> => {
      if (id !== '') return Promise.reject(new DOMException('gone', 'NotFoundError'));
      context.sinkIds.push(id);
      return Promise.resolve();
    };
    rig.director.setOutput({ id: 'gone', label: 'Old speakers' });
    await settle();
    expect(context.sinkIds.at(-1)).toBe('');
    expect(rig.notices).toHaveLength(1);
    expect(rig.notices[0]).toContain('Old speakers');
    expect(rig.storage.get('atlas-vtt:sound-output')).toEqual({ id: 'gone', label: 'Old speakers' });
  });
});
