import React from 'react';
import { SECRET_TAGS, SIZE_TAGS, tagKey, type DungeonTag } from '../../../dungeons/tags';
import { type MessageKey, t } from '../../../i18n';
import { SegmentedControl, type SegmentedOption } from '../primitives/SegmentedControl';
import { TagChips } from './TagChips';

/** The tag groups shown as chips; size and secret rooms are choices of their own. */
const CHIP_GROUPS = ['liquids', 'nature', 'layout'] as const;

/** Secret rooms as the step offers them: none, the dungeon's usual share, or many. */
type SecretChoice = 'none' | 'some' | 'many';
const SECRET_CHOICES: Readonly<Record<SecretChoice, DungeonTag | null>> = { none: 'no-secrets', some: null, many: 'secret' };
const SECRET_ORDER = Object.keys(SECRET_CHOICES) as SecretChoice[];

interface FeaturesStepProps {
  picked: readonly DungeonTag[];
  /** Whether a tag changes the chosen theme's dungeons: only those are offered. */
  offered: (tag: DungeonTag) => boolean;
  /** Tags the chosen theme cannot take beside another, each with the reason shown as its tooltip. */
  refused: ReadonlyMap<DungeonTag, string>;
  onToggle: (tag: DungeonTag) => void;
  onChoose: (among: readonly DungeonTag[], tag: DungeonTag | null) => void;
}

function tagDescription(tag: DungeonTag): string {
  return t(`dungeon.tag.${tagKey(tag)}` as MessageKey);
}

interface ChoiceProps<T extends string> {
  label: string;
  value: T;
  options: SegmentedOption<T>[];
  onChange: (value: T) => void;
}

/** A labelled choice of one, spanning the panel. */
function Choice<T extends string>({ label, value, options, onChange }: ChoiceProps<T>): React.JSX.Element {
  return (
    <div className="atlas-dungeon-features__group">
      <span className="atlas-dungeon-features__label" aria-hidden="true">{label}</span>
      <SegmentedControl className="atlas-dungeon-features__choice" value={value} options={options} onChange={onChange} ariaLabel={label} roving />
    </div>
  );
}

/**
 * What the dungeon is like: its size and how many secret rooms it hides as a choice of one each,
 * the rest (water and fire, age and growth, layout) as chips that switch on and off. Only what
 * changes the chosen theme's dungeons is offered: a Haunted Mansion has no secret rooms to ask for.
 */
export function FeaturesStep({ picked, offered, refused, onToggle, onChoose }: FeaturesStepProps): React.JSX.Element {
  const size = SIZE_TAGS.find((tag) => picked.includes(tag)) ?? 'medium';
  const secrets = SECRET_ORDER.find((choice) => {
    const tag = SECRET_CHOICES[choice];
    return tag ? picked.includes(tag) : !SECRET_TAGS.some((other) => picked.includes(other));
  }) ?? 'some';

  return (
    <div className="atlas-dungeon-features">
      <Choice<DungeonTag>
        label={t('dungeon.tagGroup.size')}
        value={size}
        options={SIZE_TAGS.map((tag) => ({ value: tag, label: t(`dungeon.size.${tag}` as MessageKey), hint: tagDescription(tag) }))}
        onChange={(tag) => onChoose(SIZE_TAGS, tag)}
      />
      <TagChips groups={CHIP_GROUPS} picked={picked} offered={offered} refused={refused} onToggle={onToggle} />
      {offered('secret') && (
        <Choice<SecretChoice>
          label={t('dungeon.secrets')}
          value={secrets}
          options={SECRET_ORDER.map((choice) => ({
            value: choice,
            label: t(`dungeon.secrets.${choice}` as MessageKey),
            hint: t(`dungeon.secrets.${choice}.hint` as MessageKey),
          }))}
          onChange={(choice) => onChoose(SECRET_TAGS, SECRET_CHOICES[choice])}
        />
      )}
    </div>
  );
}
