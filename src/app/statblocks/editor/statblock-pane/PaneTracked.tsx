import React, { useMemo } from 'react';
import { Minus, Plus } from 'lucide-react';
import { t } from '../../../i18n';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';
import { characterRest } from '../../../recovery/characterRest';
import { writeCharacterResources } from '../../../recovery/restWrites';
import type { ResourceValue } from '../../../resources/resourceTypes';
import type { FieldKey, TrackBlock } from '../../model/templateTypes';
import { drawsBoxes, TrackMeter } from '../../render/shared/TrackMeter';
import { usePaneEdit } from './paneEditContext';

/** Sets the character's current value of a resource, where something keeps it; null where nothing does yet. */
type CharacterValueSetter = ((current: number) => void) | null;

/**
 * How the pane sets the character's current value of the resource `key` (a tracked number's, or a resource of the
 * collection): where its resources are kept (its token on an open map, one undo step, else the played campaign's
 * values), never into the note, which holds the maximum. Null where the note is no player character's; a null
 * setter where nothing keeps the character's values yet.
 */
function useCharacterValue(key: string | undefined, value: ResourceValue): { set: CharacterValueSetter } | null {
  const pane = usePaneEdit();
  // Read again with every value shown: a token placed or a campaign played gives the value a home
  const rest = useMemo(() => (key ? characterRest(pane.app, pane.notePath) : null), [pane.app, pane.notePath, key, value]);
  if (!key || !rest) return null;
  if (rest.resourcePlace(key) === null) return { set: null };
  return {
    set: (next) => {
      const current = Math.max(0, Math.min(value.max, next));
      if (current !== value.current) writeCharacterResources(pane.app, rest, new Map([[key, { current, max: value.max }]]));
    },
  };
}

/** `text` between − and +, stepping the current value; where nothing keeps it the buttons say so and do nothing. */
function Stepper({ label, value, set, children }: { label: string; value: ResourceValue; set: CharacterValueSetter; children: React.ReactNode }): React.ReactNode {
  const button = (by: number, icon: React.ReactNode, words: string): React.ReactNode => {
    const blocked = !set || (by < 0 ? value.current <= 0 : value.current >= value.max);
    return (
      <LabelTooltip label={set ? words : t('statblock.trackedNowhere', { label })}>
        <button type="button" className="atlas-sb-counter__step atlas-sb-tracked__step" aria-disabled={blocked || undefined}
          onClick={() => { if (!blocked) set?.(value.current + by); }}>
          {icon}
        </button>
      </LabelTooltip>
    );
  };
  return (
    <span className="atlas-sb-tracked__stepper">
      {button(-1, <Minus aria-hidden="true" />, t('statblock.decrease', { label }))}
      {children}
      {button(1, <Plus aria-hidden="true" />, t('statblock.increase', { label }))}
    </span>
  );
}

/** A tracked number beside a player character's note, its current value ("2 / 3") between − and +. */
function PaneTracked({ field, value, text }: { field: FieldKey; value: ResourceValue; text: React.ReactNode }): React.ReactNode {
  const pane = usePaneEdit();
  const label = pane.sheet.fields.get(field)?.label || field;
  const character = useCharacterValue(pane.sheet.tracked.get(field)?.key, value);
  return character ? <Stepper label={label} value={value} set={character.set}>{text}</Stepper> : text;
}

interface PaneTrackProps {
  resource: string;
  label: string;
  value: ResourceValue;
  look: TrackBlock['look'];
  labelId: string;
}

/**
 * A track beside a player character's note: a press on a box sets the character's current value, as on the
 * player's sheet; a gauge steps it with − and +. Beside any other note it is only shown.
 */
function PaneTrack({ resource, label, value, look, labelId }: PaneTrackProps): React.ReactNode {
  const character = useCharacterValue(resource, value);
  const meter = (set?: CharacterValueSetter): React.JSX.Element => <TrackMeter value={value} look={look} label={label} labelId={labelId} onSet={set ?? undefined} />;
  if (!character) return meter();
  if (!drawsBoxes(value, look)) return <Stepper label={label} value={value} set={character.set}>{meter()}</Stepper>;
  return character.set ? meter(character.set) : <LabelTooltip label={t('statblock.trackedNowhere', { label })}>{meter()}</LabelTooltip>;
}

/** The pane's `ValueEditing.tracked`. */
export function renderPaneTracked(field: FieldKey, value: ResourceValue, text: React.ReactNode): React.ReactNode {
  return <PaneTracked field={field} value={value} text={text} />;
}

/** The pane's `ValueEditing.track`. */
export function renderPaneTrack(resource: string, label: string, value: ResourceValue, look: TrackBlock['look'], labelId: string): React.ReactNode {
  return <PaneTrack resource={resource} label={label} value={value} look={look} labelId={labelId} />;
}
