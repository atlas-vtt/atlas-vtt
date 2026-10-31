import React from 'react';
import { SegmentedControl, type SegmentedOption } from '../../../packages/components/primitives/SegmentedControl';
import { t } from '../../../i18n';
import { choicesOf, TRACED_KNOBS, type DetailChoice, type GraphicsKnob, type GraphicsKnobs, type LiquidsChoice, type ShadowsChoice } from '../../../lighting/graphicsSettings';
import { SettingChoiceRow } from './SettingRows';

/** Under which heading a knob stands on the Graphics page. */
export type GraphicsGroup = 'lighting' | 'animated' | 'screen';

export const GRAPHICS_GROUPS: readonly GraphicsGroup[] = ['lighting', 'animated', 'screen'];

/** A knob's row: under which heading it stands, how it is named and explained, and what each of its choices is called. */
interface KnobRow<K extends GraphicsKnob> {
  readonly knob: K;
  readonly group: GraphicsGroup;
  readonly label: () => string;
  readonly hint: () => string;
  readonly name: (value: GraphicsKnobs[K]) => string;
}

const LEVEL_NAMES: Record<'coarse' | 'medium' | 'fine', () => string> = { coarse: () => t('graphics.low'), medium: () => t('graphics.medium'), fine: () => t('graphics.highChoice') };
const LIQUID_NAMES: Record<LiquidsChoice, () => string> = { 10: () => t('graphics.low'), 15: () => t('graphics.medium'), 30: () => t('graphics.highChoice') };

const KNOB_ROWS: readonly KnobRow<GraphicsKnob>[] = [
  { knob: 'picture', group: 'lighting', label: () => t('graphics.picture'), hint: () => t('graphics.pictureHint'), name: (value) => (value === 'traced' ? t('graphics.traced') : t('graphics.polygons')) },
  { knob: 'detail', group: 'lighting', label: () => t('graphics.detail'), hint: () => t('graphics.detailHint'), name: (value) => LEVEL_NAMES[value as DetailChoice]() },
  { knob: 'bounce', group: 'lighting', label: () => t('graphics.bounce'), hint: () => t('graphics.bounceHint'), name: (value) => (value === 'all' ? t('graphics.bounceAll') : value === 'smaller' ? t('graphics.bounceSmaller') : t('graphics.bounceOff')) },
  { knob: 'flames', group: 'lighting', label: () => t('graphics.flames'), hint: () => t('graphics.flamesHint'), name: (value) => (value === 'lively' ? t('graphics.highChoice') : t('graphics.low')) },
  { knob: 'shadows', group: 'lighting', label: () => t('graphics.shadows'), hint: () => t('graphics.shadowsHint'), name: (value) => LEVEL_NAMES[value as ShadowsChoice]() },
  { knob: 'liquids', group: 'animated', label: () => t('graphics.liquids'), hint: () => t('graphics.liquidsHint'), name: (value) => LIQUID_NAMES[value as LiquidsChoice]() },
  { knob: 'litMap', group: 'screen', label: () => t('graphics.litMap'), hint: () => t('graphics.litMapHint'), name: (value) => (value === 'sharp' ? t('graphics.full') : t('graphics.reduced')) },
] as readonly KnobRow<GraphicsKnob>[];

const HEADINGS: Record<GraphicsGroup, () => string> = { lighting: () => t('graphics.lighting'), animated: () => t('graphics.animated'), screen: () => t('graphics.screen') };

/** The heading a group of knobs stands under. */
export const graphicsGroupHeading = (group: GraphicsGroup): string => HEADINGS[group]();

export interface GraphicsKnobRowsProps {
  readonly knobs: GraphicsKnobs;
  /** Which knobs: those under one heading. */
  readonly group: GraphicsGroup;
  readonly onKnob: <K extends GraphicsKnob>(knob: K, value: GraphicsKnobs[K]) => void;
}

/**
 * The rows of one group of the Graphics page, as Atlas and the player page both show them: each
 * knob a row with its name, a one-line hint and its choices from the cheapest to the finest. The
 * knobs only the traced picture reads stay in place, disabled, while the picture is polygons.
 */
export function GraphicsKnobRows({ knobs, group, onKnob }: GraphicsKnobRowsProps): React.ReactElement {
  const polygons = knobs.picture === 'polygons';
  return (
    <>
      {KNOB_ROWS.filter((row) => row.group === group).map((row) => {
        const inert = polygons && TRACED_KNOBS.includes(row.knob);
        const options = choicesOf(row.knob).map((value): SegmentedOption<string> => ({ value: String(value), label: row.name(value) }));
        return (
          <SettingChoiceRow key={row.knob} label={row.label()} hint={inert ? t('graphics.tracedOnly') : row.hint()}>
            <SegmentedControl<string>
              value={String(knobs[row.knob])}
              options={options}
              ariaLabel={row.label()}
              disabled={inert}
              onChange={(value) => {
                const chosen = choicesOf(row.knob).find((candidate) => String(candidate) === value);
                if (chosen !== undefined) onKnob(row.knob, chosen);
              }}
            />
          </SettingChoiceRow>
        );
      })}
    </>
  );
}
