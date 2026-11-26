import { expect, vi } from 'vitest';
import { ARM_MS } from '../../../../src/app/online/gm/armedCards.ts';
import { KeysScreen, type KeysSource } from '../../../../src/app/online/gmScreen/keys/KeysScreen.ts';
import type { GmScreenMessage, KeysMessage } from '../../../../src/app/online/protocol/index.ts';
import type { Mood } from '../../../../src/app/sound/soundTypes';
import type { ActiveMood } from '../../../../src/app/soundDirector/soundMix';
import { setLayerLevel, setMusicLevel } from '../../../../src/app/soundDirector/liveEdits';
import { RemoteControl, type MoodSource } from '../../../../src/app/soundRemote/remoteControl';
import type { TableSource } from '../../../../src/app/soundRemote/remoteTable';
import { fakeRemoteDirector, fakeTable, remoteMood, withLayers, withMusic } from '../../../helpers/soundRemoteRig';
import { fakeTimers, sessionRig, type Device, type Frame, type Rig, type RelaySocket } from './sessionRig.ts';

/**
 * Atlas's sound and table as the sound remote sees them, with intents that change what they show: a pressed
 * mood becomes the mix's mood, a fader moves its level. The table's actions are `fakeTable`'s.
 */
export function soundWorld(moodCount = 2) {
  const director = fakeRemoteDirector(withLayers({ rain: -6, wind: -9 }, withMusic()));
  const mix = (): ReturnType<typeof director.snapshot>['mix'] => director.snapshot().mix;
  director.press.mockImplementation((mood: Mood) => director.publish({ mix: { ...mix(), mood: { id: mood.id } as ActiveMood } }));
  director.desk.setMusicLevel.mockImplementation((db: number) => director.publish({ mix: { ...mix(), table: setMusicLevel(mix().table, db, 0) } }));
  director.desk.setLayerLevels.mockImplementation((levels: ReadonlyMap<string, number>) => {
    const table = [...levels].reduce((each, [key, db]) => setLayerLevel(each, key, db, 0), mix().table);
    director.publish({ mix: { ...mix(), table } });
  });
  director.setChannelLevels.mockImplementation((changes) => director.publish({ levels: { ...director.snapshot().levels, ...changes } }));
  let moods: Mood[] = Array.from({ length: moodCount }, (_, index) => remoteMood(`mood-${index}`, `Mood ${index}`));
  const listeners = new Set<() => void>();
  const moodSource: MoodSource = {
    moods: () => moods,
    mood: (id) => moods.find((mood) => mood.id === id) ?? null,
    onChange: (listener) => (listeners.add(listener), () => void listeners.delete(listener)),
  };
  const table = fakeTable();
  return {
    director, table, moodSource,
    get moods(): Mood[] { return moods; },
    setMoods(next: Mood[]): void {
      moods = next;
      for (const listener of [...listeners]) listener();
    },
    control: (source: TableSource = table.table): RemoteControl => new RemoteControl({ director, moods: moodSource, table: source }),
  };
}

export type SoundWorld = ReturnType<typeof soundWorld>;

/**
 * Settles until `done` holds: sealing and opening run on the machine's crypto, which a loaded machine may
 * not finish within one settle.
 */
export async function settleUntil(rig: Rig, done: () => boolean): Promise<void> {
  for (let round = 0; round < 50 && !done(); round += 1) await rig.settle();
  expect(done()).toBe(true);
}

/** A device allowed in and connected, its channel open. */
export async function allowedDevice(rig: Rig, id: string, name = 'Phone'): Promise<Device> {
  const device = await rig.device(id);
  rig.socket().receive({ t: 'knock', id, name });
  await settleUntil(rig, () => rig.session.view().knock?.check != null);
  rig.timers.advance(ARM_MS);
  expect(rig.session.allow(id)).toBe(true);
  rig.socket().receive({ t: 'player-joined', id, name });
  await settleUntil(rig, () => device.heard.some((message) => message.t === 'keys'));
  return device;
}

/**
 * A running session with the Keys screen plugged in on `world`. The screen keeps time on a clock of its own
 * (`tick`), with the sound remote's once-a-second look, so the relay's pacing never moves it.
 */
export async function keysRig(world: SoundWorld = soundWorld(), table?: TableSource) {
  const rig = sessionRig();
  const clock = fakeTimers();
  const opened: KeysSource[] = [];
  const disposed: KeysSource[] = [];
  rig.session.plug(new KeysScreen({
    open: () => {
      const control = world.control(table);
      const source: KeysSource = { control, moods: () => world.moods };
      const dispose = control.dispose.bind(control);
      vi.spyOn(control, 'dispose').mockImplementation(() => (disposed.push(source), dispose()));
      opened.push(source);
      return source;
    },
    outlet: rig.session,
    timers: clock,
  }));
  await rig.session.start();
  rig.socket().welcome();
  await rig.settle();
  return {
    ...rig, world, opened, disposed,
    /** Moves the screen's clock and the sound remote's look on by `ms`. */
    tick(ms: number): void {
      vi.advanceTimersByTime(ms);
      clock.advance(ms);
    },
    /** A device presses: sealed, through the relay, read and answered by Atlas, and the answer back on the device. */
    async press(device: Device, id: number, command: Record<string, unknown>): Promise<void> {
      expect(await device.say({ t: 'press', id, command })).toBe(true);
      await settleUntil(rig, () => device.heard.some((message) => message.t === 'press-answer' && message.id === id));
    },
  };
}

export type KeysRig = Awaited<ReturnType<typeof keysRig>>;

/** Keys messages a device heard, of one type. */
export function heardOf<T extends KeysMessage['t']>(device: Device, type: T): Array<Extract<GmScreenMessage, { t: T }>> {
  return device.heard.filter((message): message is Extract<GmScreenMessage, { t: T }> => message.t === type);
}

/** What Atlas sent the relay for `device`: each entry is one frame the relay hands that device. */
export function sealedTo(socket: RelaySocket, device: string): number {
  return socket.frames()
    .flatMap((frame) => (frame.t === 'sends' ? (frame.sends as Frame[]) : frame.t === 'send' ? [frame] : []))
    .filter((entry) => entry.to === device && (entry.body as Frame | undefined)?.t === 'sealed').length;
}
