import { PIN_ICON_PATHS, type PinIconId } from './pinIconPaths';
import { isPinLabelKind, type PinLabelKind } from '../tools/pinLabels';
import { t } from '../i18n';

export { PIN_ICON_PATHS, type PinIconId };

/** A pin colour in both themes: deeper on light backgrounds, brighter on dark ones. */
export interface PinTone {
  light: string;
  dark: string;
}

/** Heraldic palette shared by every pin, so a map full of pins reads as one set. */
const TONES = {
  gules: { light: '#b3261e', dark: '#e5534b' },
  tenne: { light: '#c2410c', dark: '#f0883e' },
  or: { light: '#a16207', dark: '#e3b341' },
  amber: { light: '#b45309', dark: '#f5a524' },
  vert: { light: '#2e7d32', dark: '#5cb860' },
  sea: { light: '#0f766e', dark: '#3fb5a8' },
  azure: { light: '#1d5fa8', dark: '#5b9be0' },
  indigo: { light: '#4338ca', dark: '#8b8cf0' },
  purpure: { light: '#6d3fa8', dark: '#a67be0' },
  rose: { light: '#be185d', dark: '#ec6ba6' },
  earth: { light: '#8a5a2b', dark: '#c99562' },
  stone: { light: '#57606a', dark: '#a3abb5' },
} as const satisfies Record<string, PinTone>;

export interface PinIconDefinition {
  id: PinIconId;
  name: string;
  tone: PinTone;
}

export interface PinPlaceGroup {
  name: string;
  places: PinIconDefinition[];
}

const icon = (id: PinIconId, name: string, tone: PinTone): PinIconDefinition => ({ id, name, tone });

/** The location marker: the place picker's default and the icon of its palette slot until a place is chosen. */
export const LOCATION_PIN_ICON = icon('location', t('pin.icon.location'), TONES.vert);

/** Places offered by the palette's location slot, grouped as the picker shows them: from the scale of a world map down to a room. */
export const PIN_PLACE_GROUPS: PinPlaceGroup[] = [
  {
    name: t('pin.group.realm'),
    places: [
      LOCATION_PIN_ICON,
      icon('world', t('pin.icon.world'), TONES.azure),
      icon('map', t('pin.icon.map'), TONES.or),
      icon('city', t('pin.icon.city'), TONES.stone),
      icon('village', t('pin.icon.village'), TONES.earth),
      icon('castle', t('pin.icon.castle'), TONES.stone),
      icon('tower', t('pin.icon.tower'), TONES.purpure),
      icon('outpost', t('pin.icon.outpost'), TONES.earth),
      icon('port', t('pin.icon.port'), TONES.azure),
      icon('farm', t('pin.icon.farm'), TONES.amber),
      icon('road', t('pin.icon.road'), TONES.earth),
      icon('crossroads', t('pin.icon.crossroads'), TONES.amber),
      icon('bridge', t('pin.icon.bridge'), TONES.stone),
      icon('signpost', t('pin.icon.signpost'), TONES.earth),
      icon('camp', t('pin.icon.camp'), TONES.tenne),
    ],
  },
  {
    name: t('pin.group.wilderness'),
    places: [
      icon('forest', t('pin.icon.forest'), TONES.vert),
      icon('jungle', t('pin.icon.jungle'), TONES.vert),
      icon('mountain', t('pin.icon.mountain'), TONES.stone),
      icon('hills', t('pin.icon.hills'), TONES.vert),
      icon('waterfall', t('pin.icon.waterfall'), TONES.azure),
      icon('swamp', t('pin.icon.swamp'), TONES.sea),
      icon('desert', t('pin.icon.desert'), TONES.amber),
      icon('oasis', t('pin.icon.oasis'), TONES.sea),
      icon('island', t('pin.icon.island'), TONES.azure),
      icon('volcano', t('pin.icon.volcano'), TONES.gules),
    ],
  },
  {
    name: t('pin.group.landmarks'),
    places: [
      icon('cave', t('pin.icon.cave'), TONES.stone),
      icon('dungeon', t('pin.icon.dungeon'), TONES.gules),
      icon('ruins', t('pin.icon.ruins'), TONES.earth),
      icon('mine', t('pin.icon.mine'), TONES.or),
      icon('graveyard', t('pin.icon.graveyard'), TONES.stone),
      icon('standing-stones', t('pin.icon.standing-stones'), TONES.sea),
      icon('shrine', t('pin.icon.shrine'), TONES.tenne),
      icon('portal', t('pin.icon.portal'), TONES.purpure),
      icon('lighthouse', t('pin.icon.lighthouse'), TONES.amber),
      icon('shipwreck', t('pin.icon.shipwreck'), TONES.azure),
    ],
  },
  {
    name: t('pin.group.town'),
    places: [
      icon('house', t('pin.icon.house'), TONES.earth),
      icon('manor', t('pin.icon.manor'), TONES.purpure),
      icon('temple', t('pin.icon.temple'), TONES.or),
      icon('inn', t('pin.icon.inn'), TONES.tenne),
      icon('shop', t('pin.icon.shop'), TONES.amber),
      icon('smithy', t('pin.icon.smithy'), TONES.stone),
      icon('library', t('pin.icon.library'), TONES.azure),
      icon('stable', t('pin.icon.stable'), TONES.earth),
      icon('well', t('pin.icon.well'), TONES.sea),
      icon('gate', t('pin.icon.gate'), TONES.stone),
    ],
  },
  {
    name: t('pin.group.interior'),
    places: [
      icon('secret-door', t('pin.icon.secret-door'), TONES.stone),
      icon('door', t('pin.icon.door'), TONES.earth),
      icon('stairs', t('pin.icon.stairs'), TONES.stone),
      icon('trapdoor', t('pin.icon.trapdoor'), TONES.earth),
      icon('pit', t('pin.icon.pit'), TONES.gules),
      icon('lever', t('pin.icon.lever'), TONES.amber),
      icon('cell', t('pin.icon.cell'), TONES.stone),
      icon('throne', t('pin.icon.throne'), TONES.or),
      icon('altar', t('pin.icon.altar'), TONES.purpure),
      icon('statue', t('pin.icon.statue'), TONES.stone),
      icon('coffin', t('pin.icon.coffin'), TONES.earth),
      icon('ritual-circle', t('pin.icon.ritual-circle'), TONES.gules),
      icon('bed', t('pin.icon.bed'), TONES.azure),
      icon('fireplace', t('pin.icon.fireplace'), TONES.tenne),
      icon('cauldron', t('pin.icon.cauldron'), TONES.sea),
      icon('barrel', t('pin.icon.barrel'), TONES.earth),
      icon('crate', t('pin.icon.crate'), TONES.earth),
      icon('torch', t('pin.icon.torch'), TONES.tenne),
      icon('desk', t('pin.icon.desk'), TONES.earth),
      icon('mirror', t('pin.icon.mirror'), TONES.azure),
    ],
  },
];

/** One slot of the pin palette: an icon, the place picker, or an auto-labelled sequence. */
export type PinPaletteSlot =
  | { kind: 'icon'; icon: PinIconDefinition }
  | { kind: 'places' }
  | { kind: 'label'; id: PinLabelKind; name: string; sample: string };

export const PIN_PALETTE: PinPaletteSlot[] = [
  { kind: 'icon', icon: icon('pin', t('pin.icon.pin'), TONES.gules) },
  { kind: 'icon', icon: icon('note', t('pin.icon.note'), TONES.azure) },
  { kind: 'icon', icon: icon('treasure', t('pin.icon.treasure'), TONES.or) },
  { kind: 'icon', icon: icon('combat', t('pin.icon.combat'), TONES.tenne) },
  { kind: 'icon', icon: icon('boss', t('pin.icon.boss'), TONES.purpure) },
  { kind: 'icon', icon: icon('lore', t('pin.icon.lore'), TONES.sea) },
  { kind: 'icon', icon: icon('trap', t('pin.icon.trap'), TONES.earth) },
  { kind: 'places' },
  { kind: 'icon', icon: icon('quest', t('pin.icon.quest'), TONES.indigo) },
  { kind: 'icon', icon: icon('important', t('pin.icon.important'), TONES.amber) },
  { kind: 'icon', icon: icon('npc', t('pin.icon.npc'), TONES.rose) },
  { kind: 'icon', icon: icon('secret', t('pin.icon.secret'), TONES.stone) },
  // Enumerated pins: the store assigns the next free label of the sequence on placement
  { kind: 'label', id: 'number', name: t('pin.label.number'), sample: '1' },
  { kind: 'label', id: 'letter', name: t('pin.label.letter'), sample: 'A' },
];

export const DEFAULT_PIN_ICON: PinIconId = 'pin';

/** Ids of the Lucide icons pins used before the pin icon set. */
const LEGACY_PIN_ICONS: Record<string, PinIconId> = {
  'scroll': 'note',
  'coins': 'treasure',
  'swords': 'combat',
  'skull': 'boss',
  'info': 'lore',
  'alert-triangle': 'trap',
  'map-pin': 'location',
  'flag': 'quest',
  'star': 'important',
  'heart': 'npc',
  'eye': 'secret',
};

const DEFINITIONS = new Map<PinIconId, PinIconDefinition>(
  [
    ...PIN_PLACE_GROUPS.flatMap((group) => group.places),
    ...PIN_PALETTE.flatMap((slot) => (slot.kind === 'icon' ? [slot.icon] : [])),
  ].map((definition) => [definition.id, definition]),
);

/** Icons chosen through the palette's location slot rather than a slot of their own. */
export function isPlacePinIcon(id: string): id is PinIconId {
  return PIN_PLACE_GROUPS.some((group) => group.places.some((place) => place.id === id));
}

/** Maps any stored pin icon (including legacy Lucide ids) to a palette choice: a pin icon or a label sequence. */
export function resolvePinIcon(stored: string | undefined): PinIconId | PinLabelKind {
  if (isPinLabelKind(stored)) return stored;
  if (!stored) return DEFAULT_PIN_ICON;
  if (stored in PIN_ICON_PATHS) return stored as PinIconId;
  return LEGACY_PIN_ICONS[stored] ?? DEFAULT_PIN_ICON;
}

export function getPinIconDefinition(id: PinIconId): PinIconDefinition {
  const definition = DEFINITIONS.get(id);
  if (!definition) throw new Error(`[pinIcons] Pin icon "${id}" has no definition`);
  return definition;
}
