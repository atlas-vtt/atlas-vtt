import { t } from '../i18n';
import type { Mood, MoodIconId } from '../sound/soundTypes';
import { MOOD_CREST_PATHS, type MoodCrestId } from '../types/moodCrestPaths';
import { getPinIconDefinition, PIN_ICON_PATHS, PIN_TONES, type PinIconId, type PinTone, type PinToneName } from '../types/pinIcons';

export interface MoodCrest {
  id: MoodIconId;
  name: string;
  tone: PinTone;
}

export interface MoodCrestGroup {
  name: string;
  crests: MoodCrest[];
}

export const DEFAULT_MOOD_ICON: MoodIconId = 'torch';

export const MOOD_TONE_NAMES = Object.keys(PIN_TONES) as PinToneName[];

const isTone = (value: unknown): value is PinToneName => typeof value === 'string' && Object.hasOwn(PIN_TONES, value);
const isCrest = (value: string): value is MoodCrestId => Object.hasOwn(MOOD_CREST_PATHS, value);
const isPinIcon = (value: string): value is PinIconId => Object.hasOwn(PIN_ICON_PATHS, value);

/** The glyph of a crest, on the widget icons' 512 × 512 canvas. */
export const moodCrestPath = (id: MoodIconId): string => (isCrest(id) ? MOOD_CREST_PATHS[id] : PIN_ICON_PATHS[id]);

/** The icon a mood file names, where this version has it. Pin icons the picker no longer offers still read. */
export function readMoodIcon(value: unknown): MoodIconId | undefined {
  return typeof value === 'string' && (isCrest(value) || isPinIcon(value)) ? value : undefined;
}

export const readMoodTone = (value: unknown): PinToneName | undefined => (isTone(value) ? value : undefined);

const pin = (id: PinIconId): MoodCrest => getPinIconDefinition(id);
const crest = (id: MoodCrestId, tone: PinToneName): MoodCrest => ({ id, name: t(`audio.crest.${id}`), tone: PIN_TONES[tone] });

/** What a mood's crest can be, by theme: places and things a table plays at, never furniture or map markers. */
export const MOOD_CREST_GROUPS: readonly MoodCrestGroup[] = [
  {
    name: t('audio.crestGroup.places'),
    crests: [pin('city'), pin('village'), pin('castle'), pin('tower'), pin('manor'), pin('inn'), crest('church', 'or'), pin('temple'), pin('library'), pin('smithy'), pin('farm'), pin('camp'), pin('mine'), pin('ruins'), pin('dungeon'), pin('cave'), pin('graveyard'), pin('shrine'), pin('portal')],
  },
  {
    name: t('audio.crestGroup.wilds'),
    crests: [pin('forest'), crest('oak', 'vert'), crest('mushroom-gills', 'rose'), pin('mountain'), pin('waterfall'), pin('swamp'), pin('desert'), pin('volcano'), crest('wheat', 'or'), crest('horse-head', 'earth'), crest('campfire', 'tenne'), crest('night-sky', 'indigo'), crest('lightning-storm', 'azure'), crest('heavy-rain', 'azure'), crest('snowing', 'stone'), crest('tornado', 'stone')],
  },
  {
    name: t('audio.crestGroup.hearth'),
    crests: [pin('torch'), pin('fireplace'), crest('beer-stein', 'amber'), crest('wine-glass', 'gules'), crest('roast-chicken', 'tenne'), crest('lyre', 'or'), crest('harp', 'or'), crest('flute', 'earth'), crest('drum', 'gules'), crest('jester-hat', 'purpure'), crest('drama-masks', 'rose'), crest('rolling-dices', 'stone'), crest('two-coins', 'or'), crest('hearts', 'rose')],
  },
  {
    name: t('audio.crestGroup.battle'),
    crests: [pin('combat'), crest('battle-axe', 'stone'), crest('sword-brandish', 'stone'), crest('bow-arrow', 'vert'), crest('crested-helmet', 'gules'), crest('hunting-horn', 'amber'), pin('boss'), crest('skull-crossed-bones', 'stone'), crest('fire-breath', 'gules'), crest('spiked-dragon-head', 'gules'), crest('minotaur', 'earth'), crest('wolf-head', 'stone')],
  },
  {
    name: t('audio.crestGroup.dread'),
    crests: [crest('ghost', 'sea'), crest('grim-reaper', 'stone'), crest('tombstone', 'stone'), pin('coffin'), crest('vampire-dracula', 'gules'), crest('hood', 'purpure'), crest('candles', 'amber'), crest('evil-moon', 'indigo'), crest('wolf-howl', 'indigo'), crest('raven', 'stone'), crest('owl', 'earth'), crest('bat', 'purpure'), crest('cobweb', 'stone'), crest('spider-alt', 'purpure'), crest('rat', 'earth'), crest('snake', 'vert'), crest('witch-flight', 'purpure'), pin('trap'), pin('secret')],
  },
  {
    name: t('audio.crestGroup.magic'),
    crests: [crest('spell-book', 'azure'), crest('crystal-ball', 'purpure'), crest('bubbling-flask', 'vert'), pin('cauldron'), crest('wizard-staff', 'indigo'), crest('sparkles', 'or'), crest('fairy', 'rose'), crest('unicorn', 'azure'), crest('holy-symbol', 'or'), crest('angel-wings', 'azure'), crest('prayer', 'or'), crest('ringing-bell', 'amber'), pin('altar'), crest('chalice-drops', 'gules'), crest('sands-of-time', 'amber'), crest('sword-in-stone', 'stone'), pin('throne'), pin('statue'), pin('lore')],
  },
  {
    name: t('audio.crestGroup.sea'),
    crests: [pin('port'), crest('galleon', 'earth'), crest('pirate-flag', 'stone'), crest('compass', 'or'), crest('big-wave', 'azure'), crest('kraken-tentacle', 'sea'), pin('island'), pin('lighthouse'), pin('shipwreck'), pin('treasure')],
  },
];

export const moodIcon = (mood: Pick<Mood, 'icon'>): MoodIconId => mood.icon ?? DEFAULT_MOOD_ICON;

const CREST_TONES = new Map(MOOD_CREST_GROUPS.flatMap((group) => group.crests.map((entry) => [entry.id, entry.tone] as const)));

/** Its own tone, else the one its crest has. */
export function moodTone(mood: Pick<Mood, 'icon' | 'tone'>): PinTone {
  if (isTone(mood.tone)) return PIN_TONES[mood.tone];
  const icon = moodIcon(mood);
  return CREST_TONES.get(icon) ?? (isPinIcon(icon) ? getPinIconDefinition(icon).tone : PIN_TONES.stone);
}
