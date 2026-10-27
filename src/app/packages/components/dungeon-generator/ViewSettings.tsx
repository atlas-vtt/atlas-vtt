import React, { useId } from 'react';
import { Button } from '../primitives/button';
import { Slider } from '../primitives/slider';
import { SegmentedControl } from '../primitives/SegmentedControl';
import { GRID_STYLES, type DungeonView, type GridStyle } from '../../../dungeons/style';
import type { MessageKey } from '../../../i18n/types';
import { t } from '../../../i18n';
import { SwitchRow } from './fields';

type ViewSwitch = Exclude<keyof DungeonView, 'grid' | 'smallTiles' | 'water' | 'shadow' | 'secrets'>;

/** The layers a switch turns on and off, in the order shown. */
const SWITCHES: readonly ViewSwitch[] = ['props', 'monochrome'];

interface ViewSettingsProps {
  view: DungeonView;
  /** 0..1, or undefined while the tags decide. */
  waterLevel: number | undefined;
  onView: (changes: Partial<DungeonView>) => void;
  onWaterLevel: (level: number | undefined) => void;
}

/**
 * What the map shows: the grid in sight, the other layers (water and its level, props,
 * monochrome) folded away under Map options, which few need.
 */
export function ViewSettings({ view, waterLevel, onView, onWaterLevel }: ViewSettingsProps): React.JSX.Element {
  const levelId = useId();
  const level = waterLevel ?? null;
  return (
    <div className="atlas-dungeon-fields">
      <div className="atlas-dungeon-field atlas-dungeon-field--stacked">
        <span className="atlas-dungeon-field__label" aria-hidden="true">{t('dungeon.view.grid')}</span>
        <SegmentedControl<GridStyle>
          className="atlas-dungeon-grid-choice"
          value={view.grid}
          options={GRID_STYLES.map((grid) => ({ value: grid, label: t(`dungeon.view.grid.${grid}` as MessageKey) }))}
          onChange={(grid) => onView({ grid })}
          ariaLabel={t('dungeon.view.grid')}
          roving
        />
      </div>
      <details className="atlas-dungeon-more">
        <summary className="atlas-dungeon-more__summary">{t('dungeon.view.more')}</summary>
        <div className="atlas-dungeon-fields">
          <SwitchRow label={t('dungeon.view.smallTiles')} value={view.smallTiles} disabled={view.grid === 'off'} onChange={(smallTiles) => onView({ smallTiles })} />
          <SwitchRow label={t('dungeon.view.water')} value={view.water} onChange={(water) => onView({ water })} />
          <div className="atlas-dungeon-field atlas-dungeon-field--stacked">
            <div className="atlas-dungeon-field__line">
              <span id={levelId} className="atlas-dungeon-field__label">{t('dungeon.view.waterLevel')}</span>
              {level === null
                ? <span className="atlas-dungeon-field__value">{t('dungeon.view.waterByTags')}</span>
                : <Button variant="ghost" size="sm" className="atlas-dungeon-field__reset" onClick={() => onWaterLevel(undefined)}>{t('dungeon.view.waterByTags')}</Button>}
            </div>
            <Slider
              aria-labelledby={levelId}
              min={0}
              max={1}
              step={0.1}
              value={[level ?? 0]}
              disabled={!view.water}
              getValueText={(value) => value.toFixed(1)}
              onValueChange={([value]) => onWaterLevel(value)}
            />
          </div>
          {SWITCHES.map((key) => (
            <SwitchRow key={key} label={t(`dungeon.view.${key}` as MessageKey)} value={view[key]} onChange={(on) => onView({ [key]: on })} />
          ))}
        </div>
      </details>
    </div>
  );
}
