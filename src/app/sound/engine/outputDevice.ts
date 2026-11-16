/** A context whose output can be moved; a runtime that cannot has no `setSinkId`, and TypeScript's types do not know it yet. */
interface MovableOutput {
  setSinkId(sinkId: string): Promise<void>;
}

const isMovable = (output: object): output is MovableOutput => 'setSinkId' in output && typeof output.setSinkId === 'function';

/** Where sound goes on this device; empty is the system's default. */
let currentSink = '';
const followers = new Set<object>();
let onMissing: (() => void) | null = null;

function isDeviceGone(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'NotFoundError';
}

async function move(output: object, sinkId: string): Promise<void> {
  if (!isMovable(output)) return;
  try {
    await output.setSinkId(sinkId);
  } catch (error) {
    if (!isDeviceGone(error)) {
      console.error('[Atlas] Could not move sound to another output', error);
      return;
    }
    onMissing?.();
    await output.setSinkId('').catch(() => undefined);
  }
}

/** Keeps a context on the chosen output: dice and the reveal sound create theirs on the first sound. */
export function followOutputDevice(output: object): void {
  followers.add(output);
  if (currentSink !== '') void move(output, currentSink);
}

export function forgetOutputFollower(output: object): void {
  followers.delete(output);
}

/** Moves every follower. A device that is gone leaves them on the default, and `missing` says so. */
export function setOutputDevice(sinkId: string, missing: (() => void) | null = null): Promise<void> {
  currentSink = sinkId;
  onMissing = missing;
  return Promise.all([...followers].map((output) => move(output, sinkId))).then(() => undefined);
}

export interface OutputDeviceChoice {
  id: string;
  label: string;
}

type MediaDevicesLike = Pick<MediaDevices, 'enumerateDevices' | 'getUserMedia'>;

/**
 * The outputs of this machine. Chromium names them only after a microphone permission, so a list
 * without names asks once for it, here, and only when someone opens the list. Refused, the list has no
 * names and falls back to numbered entries, which the caller writes.
 */
export async function listOutputDevices(devices: MediaDevicesLike | undefined = navigator.mediaDevices): Promise<OutputDeviceChoice[]> {
  if (!devices) return [];
  const outputs = async (): Promise<MediaDeviceInfo[]> => (await devices.enumerateDevices()).filter((device) => device.kind === 'audiooutput' && device.deviceId !== 'default' && device.deviceId !== 'communications');
  let found = await outputs();
  if (found.length > 0 && found.every((device) => device.label !== '')) return found.map(({ deviceId, label }) => ({ id: deviceId, label }));
  try {
    const stream = await devices.getUserMedia({ audio: true });
    for (const track of stream.getTracks()) track.stop();
    found = await outputs();
  } catch {
    // Refused or unavailable: the list goes on without names.
  }
  return found.map(({ deviceId, label }) => ({ id: deviceId, label }));
}
