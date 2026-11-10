import React, { useEffect, useId, useState } from 'react';
import { ArrowDown, ArrowUp, House, Image, Layers, Replace, Trash2 } from 'lucide-react';
import { ToggleSwitch } from '../../../packages/components/primitives/Toggle';
import { MAX_LEVELS_SHOWN_BELOW } from '../../../levels/levelStack';
import { cn } from '../../../../utils/cn';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';
import type { LevelElevation, SceneLevel } from '../../../types/sceneLevelTypes';
import { t } from '../../../i18n';
import { LevelRoofSettings } from './SceneLevelRoof';

interface SceneLevelRowProps {
  level: SceneLevel;
  name: string;
  isViewed: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onShow: () => void;
  onRename: (name: string) => void;
  onElevation: (elevation: LevelElevation) => void;
  onMove: (direction: 1 | -1) => void;
  onPickImage: () => void;
  /** Whether the level has an image another can take the place of. */
  hasImage: boolean;
  /** Picks an image of the same shape that takes the image's place, scaled onto it. */
  onReplaceImage: () => void;
  onDelete: () => void;
  /** The levels below this one, nearest first, with what they are called. */
  below: readonly { id: string; name: string }[];
  /** This level sees level `id` below it through its openings, or not. */
  onSees: (id: string, seen: boolean) => void;
  /** The transparent parts of its map are openings, or floor. */
  onOpenArt: (open: boolean) => void;
  /** Picks the image drawn as the level's roof, or none. */
  onPickRoof: () => void;
  onRemoveRoof: () => void;
}

/** A number field that commits a finite number on blur or Enter, and goes back to `value` otherwise. */
function NumberField({ value, label, onCommit }: { value: number; label: string; onCommit: (value: number) => void }): React.ReactElement {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = (): void => {
    const parsed = Number(text.replace(',', '.'));
    if (text.trim() !== '' && Number.isFinite(parsed)) onCommit(parsed);
    else setText(String(value));
  };
  return (
    <input
      className="atlas-scene-level__number"
      type="text"
      inputMode="decimal"
      value={text}
      aria-label={label}
      onChange={(event) => setText(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
    />
  );
}

interface RowButtonProps {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
  /** A button that opens a part of the row: whether it is open. */
  expanded?: boolean | undefined;
}

function RowButton({ label, icon, onClick, disabled = false, destructive = false, expanded }: RowButtonProps): React.ReactElement {
  return (
    <LabelTooltip side="top" label={label}>
      <button
        type="button"
        className={cn('atlas-scene-level__button', destructive && 'atlas-scene-level__button--destructive', expanded && 'atlas-scene-level__button--active')}
        disabled={disabled}
        aria-expanded={expanded}
        onClick={onClick}
      >
        {icon}
      </button>
    </LabelTooltip>
  );
}

/** A switch named by the text beside it. */
function SwitchRow({ label, value, onChange }: { label: string; value: boolean; onChange: () => void }): React.ReactElement {
  const labelId = useId();
  return (
    <div className="atlas-scene-level__switch">
      <span id={labelId}>{label}</span>
      <ToggleSwitch value={value} onChange={onChange} labelledBy={labelId} />
    </div>
  );
}

/**
 * What a level shows of the levels below it: whether its map's transparent parts are openings,
 * and which levels below it sees through them. A level below it does not see stops the view with
 * its floor; of the levels it sees, the two nearest are drawn.
 */
function LevelBelowSettings({ level, below, onSees, onOpenArt }: Pick<SceneLevelRowProps, 'level' | 'below' | 'onSees' | 'onOpenArt'>): React.ReactElement {
  const seen = below.filter((entry) => !level.sees || level.sees.includes(entry.id));
  return (
    <div className="atlas-scene-level__below" onClick={(event) => event.stopPropagation()}>
      <SwitchRow label={t('levels.openArt')} value={level.openArt !== false} onChange={() => onOpenArt(level.openArt === false)} />
      <span className="atlas-scene-level__label">{t('levels.sees')}</span>
      {below.map((entry) => (
        <SwitchRow key={entry.id} label={entry.name} value={seen.includes(entry)} onChange={() => onSees(entry.id, !seen.includes(entry))} />
      ))}
      {seen.length > MAX_LEVELS_SHOWN_BELOW && <span className="atlas-scene-level__hint">{t('levels.seesNearest', { count: MAX_LEVELS_SHOWN_BELOW })}</span>}
    </div>
  );
}

/** One level in the Levels page: its name, elevation and the actions on it. */
export function SceneLevelRow(props: SceneLevelRowProps): React.ReactElement {
  const { level, name, isViewed } = props;
  const [draft, setDraft] = useState(level.name ?? '');
  const [showsBelow, setShowsBelow] = useState(false);
  const [showsRoof, setShowsRoof] = useState(false);
  useEffect(() => setDraft(level.name ?? ''), [level.name]);
  const { bottom, top } = level.elevation;
  const hasBelow = props.below.length > 0;

  return (
    <div className="atlas-scene-level-entry">
      <div className={cn('atlas-scene-level', isViewed && 'atlas-scene-level--viewed')} onClick={props.onShow}>
        <input
          className="atlas-scene-level__name"
          type="text"
          value={draft}
          placeholder={name}
          aria-label={t('levels.name', { name })}
          onClick={(event) => event.stopPropagation()}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => { if (draft.trim() !== (level.name ?? '')) props.onRename(draft.trim()); }}
          onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
        />
        <div className="atlas-scene-level__elevation" onClick={(event) => event.stopPropagation()}>
          <NumberField value={bottom} label={t('levels.bottom', { name })} onCommit={(value) => props.onElevation({ bottom: value, top: Math.max(value, top) })} />
          <span aria-hidden="true">–</span>
          <NumberField value={top} label={t('levels.top', { name })} onCommit={(value) => props.onElevation({ bottom: Math.min(bottom, value), top: value })} />
        </div>
        <div className="atlas-scene-level__actions" onClick={(event) => event.stopPropagation()}>
          <RowButton label={t('levels.moveUp', { name })} icon={<ArrowUp />} disabled={!props.canMoveUp} onClick={() => props.onMove(1)} />
          <RowButton label={t('levels.moveDown', { name })} icon={<ArrowDown />} disabled={!props.canMoveDown} onClick={() => props.onMove(-1)} />
          <RowButton label={t('levels.changeImage', { name })} icon={<Image />} onClick={props.onPickImage} />
          <RowButton label={t('levels.replaceImage', { name })} icon={<Replace />} disabled={!props.hasImage} onClick={props.onReplaceImage} />
          <RowButton
            label={hasBelow ? t('levels.showsBelow', { name }) : t('levels.nothingBelow', { name })}
            icon={<Layers />}
            disabled={!hasBelow}
            expanded={hasBelow ? showsBelow : undefined}
            onClick={() => setShowsBelow(!showsBelow)}
          />
          <RowButton label={t('levels.roof', { name })} icon={<House />} expanded={showsRoof} onClick={() => setShowsRoof(!showsRoof)} />
          <RowButton label={t('levels.delete', { name })} icon={<Trash2 />} destructive onClick={props.onDelete} />
        </div>
      </div>
      {hasBelow && showsBelow && <LevelBelowSettings level={level} below={props.below} onSees={props.onSees} onOpenArt={props.onOpenArt} />}
      {showsRoof && <LevelRoofSettings name={name} foreground={level.foreground} onPick={props.onPickRoof} onRemove={props.onRemoveRoof} />}
    </div>
  );
}
