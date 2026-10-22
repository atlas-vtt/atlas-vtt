import React from 'react';
import { updateField } from '../../../model/fieldOps';
import { NUMBER_LOOKS, withMetricNumberLook, type NumberLook } from '../../../model/numberLooks';
import { updateBlock } from '../../../model/treeOps';
import type { FieldTracking, MetricBlock, StatblockTemplate, TemplateField, TrackBlock } from '../../../model/templateTypes';
import { trackedNumbers } from '../../../values/trackedNumbers';
import { ChoiceSetting, SelectSetting, SettingNote } from '../inspector/InspectorControls';
import type { EditorSession } from '../sessionTypes';

type Tracking = 'off' | FieldTracking['counts'];

const TRACKING: ReadonlyArray<{ value: Tracking; label: string }> = [
  { value: 'off', label: 'Off' },
  { value: 'down', label: 'Counts down' },
  { value: 'up', label: 'Counts up' },
];

/** The maximum is the number's own value. */
const OWN = '';

interface TrackedSettingProps {
  field: TemplateField;
  template: StatblockTemplate;
  session: EditorSession;
  readOnly: boolean;
  /** Names the settings after the number, where a tile holds several (a Metric). */
  named?: boolean;
  /** The Track the number shows as: it stays tracked, and counts as its field does. */
  track?: TrackBlock | undefined;
}

/**
 * Whether a number is tracked (Luck, Ki, Hit Dice): spent and got back by its character, with the
 * note's value as its maximum, or another number's (Hit Dice up to Level). A recovery button can
 * restore it, and its player steps it on their sheet. One step each. A number shown as a track is always
 * tracked (Show as Number first), and its Track counts as its field does.
 */
export function TrackedSetting({ field, template, session, readOnly, named = false, track }: TrackedSettingProps): React.JSX.Element {
  // A Track tile that tracks its number by itself (an older template) counts as the Track says
  const tracks = field.tracks ?? (track && { counts: track.counts });
  const name = field.label.trim() || field.key;
  // A Track tile elsewhere, bound to no resource, tracks this number already
  if (!tracks && trackedNumbers(template).some((number) => number.field.key === field.key)) {
    return <SettingNote>{named ? `${name} is tracked by its Track tile.` : 'Tracked by its Track tile.'}</SettingNote>;
  }
  const set = (next: FieldTracking | undefined): void => session.apply((now) => {
    const tracked = updateField(now, field.key, { tracks: next });
    if (!track || !next) return tracked;
    const edit = updateBlock(tracked.layout, track.id, 'track', { counts: next.counts });
    return edit.ok && edit.layout !== tracked.layout ? { ...tracked, layout: edit.layout } : tracked;
  });
  const others = template.fields.filter((other) => other.type === 'number' && other.key !== field.key);
  return (
    <>
      <SelectSetting<Tracking>
        label={named ? `${name} tracked` : 'Tracked'}
        value={tracks?.counts ?? 'off'}
        options={track ? TRACKING.filter((option) => option.value !== 'off') : [...TRACKING]}
        disabled={readOnly}
        onChange={(counts) => set(counts === 'off' ? undefined : { ...tracks, counts })}
      />
      {tracks && (
        <SelectSetting<string>
          label={named ? `${name} maximum` : 'Maximum'}
          value={tracks.max ?? OWN}
          options={[{ value: OWN, label: 'This value' }, ...others.map((other) => ({ value: other.key, label: other.label.trim() || other.key }))]}
          disabled={readOnly}
          onChange={(max) => set(max === OWN ? { counts: tracks.counts } : { ...tracks, max })}
        />
      )}
    </>
  );
}

interface MetricTrackedSettingsProps {
  block: MetricBlock;
  template: StatblockTemplate;
  session: EditorSession;
  readOnly: boolean;
}

/**
 * A Metric's numbers, each tracked or not on its own, and each shown as a number or as a track, which takes it out
 * of the Metric into a tile of its own (`withMetricNumberLook`).
 */
export function MetricTrackedSettings({ block, template, session, readOnly }: MetricTrackedSettingsProps): React.JSX.Element {
  const numbers = block.fields.flatMap((key) => template.fields.filter((field) => field.key === key && field.type === 'number'));
  const named = numbers.length > 1;
  return (
    <>
      {numbers.map((field) => (
        <React.Fragment key={field.key}>
          <ChoiceSetting<NumberLook>
            label={named ? `${field.label.trim() || field.key} shown as` : 'Show as'}
            value="number"
            options={[...NUMBER_LOOKS]}
            disabled={readOnly}
            onChange={(look) => { if (look !== 'number') session.apply((now) => withMetricNumberLook(now, block.id, field.key, look)); }}
          />
          <TrackedSetting field={field} template={template} session={session} readOnly={readOnly} named={named} />
        </React.Fragment>
      ))}
    </>
  );
}
