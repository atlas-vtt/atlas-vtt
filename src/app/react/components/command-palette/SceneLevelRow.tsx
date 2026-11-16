import React, { useEffect, useId, useState } from 'react';
import { ArrowDown, ArrowUp, House, Image, Layers, Replace, Trash2 } from 'lucide-react';
import { ToggleSwitch } from '../../../packages/components/primitives/Toggle';
import { MAX_LEVELS_SHOWN_BELOW } from '../../../levels/levelStack';
import { cn } from '../../../../utils/cn';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';
import type { LevelElevation, SceneLevel } from '../../../types/sceneLevelTypes';
import { t } from '../../../i18n';
import { LevelRoofSettings } from './SceneLevelRoof';

/** What a level has among the scene's other levels. */
interface LevelAmongOthers {
  isViewed: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onShow: () => void;
  onMove: (direction: 1 | -1) => void;
  onDelete: () => void;
  /** The levels below this one, nearest first, with what they are called. */
  below: readonly { id: string; name: string }[];
  /** This level sees level `id` below it through its openings, or not. */
  onSees: (id: string, seen: boolean) => void;
  /** The transparent parts of its map are openings, or floor. */
  onOpenArt: (open: boolean) => void;
}

interface SceneLevelRowProps {
  level: SceneLevel;
  name: string;
  onRename: (name: string) => void;
  onElevation: (elevation: LevelElevation) => void;
  onPickImage: () => void;
  /** Whether the level has an image another can take the place of. */
  hasImage: boolean;
  /** Picks an image of the same shape that takes the image's place, scaled onto it. */
  onReplaceImage: () => void;
  /** Picks the image drawn as the level's roof, or none. */
  onPickRoof: () => void;
  onRemoveRoof: () => void;
  /**
   * Unset for a scene's only level: its row has nothing to reorder, delete, show in another's
   * place or see below, and its roof stands open under it.
   */
  among?: LevelAmongOthers | undefined;
}

/** A number field that commits another finite number on blur or Enter, and goes back to `value` for anything else. */
function NumberField({ value, label, onCommit }: { value: number; label: string; onCommit: (value: number) => void }): React.ReactElement {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = (): void => {
    const parsed = Number(text.replace(',', '.'));
    if (text.trim() === '' || !Number.isFinite(parsed)) setText(String(value));
    else if (parsed !== value) onCommit(parsed);
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
function LevelBelowSettings({ level, below, onSees, onOpenArt }: Pick<SceneLevelRowProps, 'level'> & Pick<LevelAmongOthers, 'below' | 'onSees' | 'onOpenArt'>): React.ReactElement {
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

/** One level in the Levels page: its name, elevation and the actions on it; a scene's only level has its map's actions alone. */
export function SceneLevelRow(props: SceneLevelRowProps): React.ReactElement {
  const { level, name, among } = props;
  const [draft, setDraft] = useState(level.name ?? '');
  const [showsBelow, setShowsBelow] = useState(false);
  const [showsRoof, setShowsRoof] = useState(false);
  useEffect(() => setDraft(level.name ?? ''), [level.name]);
  const { bottom, top } = level.elevation;
  const hasBelow = !!among && among.below.length > 0;

  return (
    <div className="atlas-scene-level-entry">
      <div className={cn('atlas-scene-level', among?.isViewed && 'atlas-scene-level--viewed', !among && 'atlas-scene-level--only')} onClick={among?.onShow}>
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
          {among && (
            <>
              <RowButton label={t('levels.moveUp', { name })} icon={<ArrowUp />} disabled={!among.canMoveUp} onClick={() => among.onMove(1)} />
              <RowButton label={t('levels.moveDown', { name })} icon={<ArrowDown />} disabled={!among.canMoveDown} onClick={() => among.onMove(-1)} />
            </>
          )}
          <RowButton label={t('levels.changeImage', { name })} icon={<Image />} onClick={props.onPickImage} />
          <RowButton label={t('levels.replaceImage', { name })} icon={<Replace />} disabled={!props.hasImage} onClick={props.onReplaceImage} />
          {among && (
            <>
              <RowButton
                label={hasBelow ? t('levels.showsBelow', { name }) : t('levels.nothingBelow', { name })}
                icon={<Layers />}
                disabled={!hasBelow}
                expanded={hasBelow ? showsBelow : undefined}
                onClick={() => setShowsBelow(!showsBelow)}
              />
              <RowButton label={t('levels.roof', { name })} icon={<House />} expanded={showsRoof} onClick={() => setShowsRoof(!showsRoof)} />
              <RowButton label={t('levels.delete', { name })} icon={<Trash2 />} destructive onClick={among.onDelete} />
            </>
          )}
        </div>
      </div>
      {among && hasBelow && showsBelow && <LevelBelowSettings level={level} below={among.below} onSees={among.onSees} onOpenArt={among.onOpenArt} />}
      {(showsRoof || !among) && <LevelRoofSettings name={name} foreground={level.foreground} onPick={props.onPickRoof} onRemove={props.onRemoveRoof} />}
    </div>
  );
}
