import { GRID_SLOTS, type GmScreenDevice, type GmScreenLayout, type KeyCommand, type LayoutKey } from '../../protocol/index.ts';

const command = (name: KeyCommand): LayoutKey => ({ k: 'command', command: name });

/** What a GM who never changed the grid finds on a phone, in reading order: never an empty screen. */
const PHONE_KEYS: readonly LayoutKey[] = [
  command('stopAll'), command('pause'), command('nextMood'), command('muteMusic'), { k: 'moods' },
  command('handout'), command('freeze'), command('curtain'), command('present'),
  command('combat'), command('rollInitiative'), { k: 'dice', formula: '1d20' },
];

/** A tablet's larger grid holds these after the phone's keys. */
const TABLET_KEYS: readonly LayoutKey[] = [...PHONE_KEYS, command('nextTrack'), command('shuffle'), command('shareRolls')];

/** The grid a device of this kind shows until the GM changes it. */
export function defaultLayout(device: GmScreenDevice): GmScreenLayout {
  const keys = device === 'phone' ? PHONE_KEYS : TABLET_KEYS;
  return { slots: Array.from({ length: GRID_SLOTS[device] }, (_, place) => keys[place] ?? null) };
}
