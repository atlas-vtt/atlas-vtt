import type { LightEmission, TokenVision, TokenVisionDefaults } from '../types/lightingTypes';
import type { SenseDefinition, TokenSense } from '../types/senseTypes';
import type { LightPresetDefinition } from '../types/lightPresetTypes';
import { defaultLightPreset, emissionOf } from './lightPresetChoice';
import { numberText, parseNumberText, positiveNumber } from '../utils/numberInput';
import { tokenSenses, withSenses } from '../vision/tokenSenses';
import { coneAngle } from '../vision/visionCone';
import { t } from '../i18n';

/** One sense in a list being edited. */
export interface SenseRow {
  id: string;
  /** Game units as typed; blank takes the sense's default, or no limit. */
  range: string;
}

export interface VisionDefaultsForm {
  /** Game units as typed; blank is unlimited sight. */
  range: string;
  /** Degrees as typed; blank is all around. */
  angle: string;
  senses: SenseRow[];
}

export interface VisionForm extends Omit<VisionDefaultsForm, 'senses'> {
  enabled: boolean;
  /** The token's own senses; null while it has none of its own and follows its statblock. */
  senses: SenseRow[] | null;
}

/** A number field both Edit Token and the collection's Vision tab show. */
export interface VisionFieldSpec {
  key: 'range' | 'angle';
  label: string;
  /** Labelled with the map's game unit, e.g. "Sight range (ft)". */
  inGameUnits: boolean;
  placeholder: string;
  resetLabel: string;
  hint?: string;
  min?: number;
  max?: number;
}

export const VISION_FIELDS: readonly VisionFieldSpec[] = [
  { key: 'range', label: t('vision.range'), inGameUnits: true, placeholder: t('vision.unlimited'), resetLabel: t('vision.unlimitedSight') },
  {
    key: 'angle', label: t('vision.angle'), inGameUnits: false, placeholder: '360', resetLabel: t('vision.allAround'),
    hint: t('vision.angleHint'), min: 1, max: 360,
  },
];

/** `label` with the map's game unit, which is empty for abstract units. */
export function withUnit(label: string, unit: string): string {
  return unit ? t('vision.withUnit', { label, unit }) : label;
}

/** The label of `field` with the map's game unit where it is a distance. */
export function visionFieldLabel(field: VisionFieldSpec, unit: string): string {
  return field.inGameUnits ? withUnit(field.label, unit) : field.label;
}

export function senseRows(senses: readonly TokenSense[]): SenseRow[] {
  return senses.map((sense) => ({ id: sense.id, range: numberText(sense.range) }));
}

/** The senses of a list: the first row of each sense, with its distance when it is above 0. */
export function sensesFromRows(rows: readonly SenseRow[]): TokenSense[] {
  const seen = new Set<string>();
  return rows.flatMap((row) => {
    if (seen.has(row.id)) return [];
    seen.add(row.id);
    const range = positiveNumber(parseNumberText(row.range));
    return [{ id: row.id, ...(range !== undefined && { range }) }];
  });
}

/** Whether the token says itself what it senses: a list of senses, or the old distances they replaced. */
function hasOwnSenses(vision: TokenVision | undefined): boolean {
  return vision !== undefined
    && (vision.senses !== undefined || positiveNumber(vision.darkvision) !== undefined || positiveNumber(vision.tremorsense) !== undefined);
}

/** The fields a collection's default vision shows; old default distances show as senses. */
export function visionDefaultsForm(defaults: TokenVisionDefaults | undefined, definitions: readonly SenseDefinition[]): VisionDefaultsForm {
  return {
    range: numberText(defaults?.range),
    angle: numberText(defaults?.angle),
    senses: senseRows(tokenSenses(defaults, definitions)),
  };
}

/** The fields Edit Token shows for a token's vision. */
export function visionForm(vision: TokenVision | undefined, definitions: readonly SenseDefinition[]): VisionForm {
  return {
    ...visionDefaultsForm(vision, definitions),
    enabled: vision?.enabled ?? false,
    senses: hasOwnSenses(vision) ? senseRows(tokenSenses(vision, definitions)) : null,
  };
}

function rangeAndAngle(form: Pick<VisionDefaultsForm, 'range' | 'angle'>): Pick<TokenVisionDefaults, 'range' | 'angle'> {
  const range = positiveNumber(parseNumberText(form.range));
  const angle = coneAngle(parseNumberText(form.angle));
  return { ...(range !== undefined && { range }), ...(angle !== undefined && { angle }) };
}

/** The default vision typed in; empty when every field is blank or unusable and no sense is listed. */
export function visionDefaultsFromForm(form: VisionDefaultsForm): TokenVisionDefaults {
  const senses = sensesFromRows(form.senses);
  return { ...rangeAndAngle(form), ...(senses.length > 0 && { senses }) };
}

/** The vision to save: with `senses` once the token has its own, even none; without while it follows its statblock. */
export function visionFromForm(form: VisionForm): TokenVision {
  const vision: TokenVision = { enabled: form.enabled, ...rangeAndAngle(form) };
  return form.senses ? withSenses(vision, sensesFromRows(form.senses)) : vision;
}

/** The light a token carries, as Edit Token edits it. */
export interface LightForm {
  on: boolean;
  /** The carried light, or the one the token gets when the switch goes on. Kept while off, so switching back loses nothing. */
  emission: LightEmission;
}

/** The fields Edit Token shows for a token's light; a token without one starts with the collection's torch, switched off. */
export function lightForm(light: LightEmission | undefined, presets: readonly LightPresetDefinition[]): LightForm {
  return { on: light !== undefined, emission: light ?? emissionOf(defaultLightPreset(presets)) };
}

/** The light to save: the form's while it is on, none otherwise. */
export function lightFromForm(form: LightForm): LightEmission | undefined {
  return form.on ? form.emission : undefined;
}
