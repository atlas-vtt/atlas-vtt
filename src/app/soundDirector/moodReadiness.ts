import type { Mood, SoundRecord } from '../sound/soundTypes';
import type { SoundConversion } from '../soundLibrary/soundConversion';

export type MoodProblem =
  | { kind: 'deleted' }
  | { kind: 'missing'; name: string; record: SoundRecord }
  | { kind: 'converting' | 'notConverted'; name: string }
  | { kind: 'refused'; name: string; reason: Extract<SoundConversion, { state: 'refused' }>['reason'] };

export interface ShelfReader {
  recordOf(id: string): SoundRecord | null;
  hasFile(record: SoundRecord): boolean;
  stateOf(record: SoundRecord): SoundConversion;
}

/** What keeps a mood from sounding whole, before anyone presses it: the GM must never find out by silence. */
export function moodProblems(mood: Pick<Mood, 'music' | 'layers'>, shelf: ShelfReader): MoodProblem[] {
  const ids = [...(typeof mood.music === 'string' ? [] : mood.music.tracks), ...mood.layers.map((layer) => layer.sound)];
  return ids.flatMap((id): MoodProblem[] => {
    const record = shelf.recordOf(id);
    if (!record) return [{ kind: 'deleted' }];
    if (!shelf.hasFile(record)) return [{ kind: 'missing', name: record.name, record }];
    const state = shelf.stateOf(record);
    if (state.state === 'ready') return [];
    if (state.state === 'refused') return [{ kind: 'refused', name: record.name, reason: state.reason }];
    return [{ kind: state.state === 'converting' ? 'converting' : 'notConverted', name: record.name }];
  });
}
