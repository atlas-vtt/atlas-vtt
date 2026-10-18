import React from 'react';
import { Check } from 'lucide-react';
import { cn } from '../../../../utils/cn';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';
import { ObsidianMenuDropdown } from '../ObsidianMenuDropdown';
import { SettingRow, SettingSliderRow, SettingToggleRow } from './SettingRows';
import { MapUnitRow } from './MapUnitRow';
import { SceneUnitDistanceRow } from './SceneUnitDistanceRow';
import type { AtlasView } from '../../../atlas-view';
import type { GridType } from '../../../grid/GridSystem';
import { DEFAULT_CELL_NUMBER_OPACITY, isCellNumberFormat, type CellNumberFormat } from '../../../grid/cellNumbering';
import { debounce } from '../../../../utils/debounce';
import { useDetectGridOnNewScenes } from '../../hooks/useDetectGridOnNewScenes';
import { t } from '../../../i18n';

/** `undefined` leaves the colour to the grid, which picks black or white from the map's brightness. */
const GRID_COLORS: ReadonlyArray<{ value: string | undefined; label: string }> = [
  { value: undefined, label: t('color.auto') },
  { value: '#FFFFFF', label: t('color.white') },
  { value: '#000000', label: t('color.black') },
  { value: '#FF0000', label: t('color.red') },
  { value: '#00FF00', label: t('color.green') },
  { value: '#0000FF', label: t('color.blue') },
  { value: '#FFFF00', label: t('color.yellow') },
  { value: '#FF00FF', label: t('color.magenta') },
  { value: '#808080', label: t('color.gray') },
  { value: '#FFA500', label: t('color.orange') },
  { value: '#800080', label: t('color.purple') },
  { value: '#FFC0CB', label: t('color.pink') },
];

const GRID_TYPE_OPTIONS = {
  square: t('grid.type.square'),
  'hex-horizontal': t('grid.type.hexFlat'),
  'hex-vertical': t('grid.type.hexPointy'),
};

function isGridType(value: string): value is GridType {
  return value in GRID_TYPE_OPTIONS;
}

const HEX_NUMBER_OPTIONS: Record<CellNumberFormat | 'off', string> = {
  off: t('grid.numbers.off'),
  'column-row': t('grid.numbers.columnRow'),
  sequential: t('grid.numbers.sequential'),
  'letter-number': 'Letters and numbers (A1)',
};

const LINE_STYLE_OPTIONS = {
  solid: t('grid.line.solid'),
  dashed: t('grid.line.dashed'),
  dotted: t('grid.line.dotted'),
};

interface GridSettingsPanelProps {
  view: AtlasView | null;
  localOpacity: number;
  setLocalOpacity: (opacity: number) => void;
  localLineWidth: number;
  setLocalLineWidth: (lineWidth: number) => void;
  localGridVisible: boolean;
  setLocalGridVisible: (visible: boolean) => void;
  localSnapToGrid: boolean;
  setLocalSnapToGrid: (snap: boolean) => void;
  debouncedOpacityUpdate: (opacity: number) => void;
  debouncedLineWidthUpdate: (lineWidth: number) => void;
}

export function GridSettingsPanel({
  view,
  localOpacity,
  setLocalOpacity,
  localLineWidth,
  setLocalLineWidth,
  localGridVisible,
  setLocalGridVisible,
  localSnapToGrid,
  setLocalSnapToGrid,
  debouncedOpacityUpdate,
  debouncedLineWidthUpdate,
}: GridSettingsPanelProps): React.ReactElement {
  const colourLabelId = React.useId();
  const newScenes = useDetectGridOnNewScenes(view?.app);
  const currentGrid = view?.atlasStore?.getState()?.grid;
  const currentType: string = currentGrid?.type ?? 'square';
  const currentColor: string | undefined = currentGrid?.color;
  const currentLineType: string = currentGrid?.lineType ?? 'solid';
  // Held locally: the palette does not re-render when the store's grid changes
  const [hexNumbers, setHexNumbers] = React.useState<CellNumberFormat | undefined>(currentGrid?.cellNumbers);
  const [hexNumberOpacity, setHexNumberOpacity] = React.useState(
    currentGrid?.cellNumberOpacity ?? DEFAULT_CELL_NUMBER_OPACITY,
  );

  const patchGrid = React.useCallback((patch: Record<string, unknown>): void => {
    if (!view?.atlasStore) return;
    const grid = view.atlasStore.getState().grid;
    if (!grid) return;
    view.atlasStore.getState().setGrid({ ...grid, ...patch });
  }, [view?.atlasStore]);

  // Dragging the slider settles into one grid change (and one undo step)
  const debouncedNumberOpacityUpdate = React.useMemo(
    () => debounce((opacity: number) => patchGrid({ cellNumberOpacity: opacity }), 100),
    [patchGrid],
  );

  return (
    <div className="atlas-command-palette-panel">
      <div className="atlas-command-palette-panel-column">
      <SettingToggleRow
        label={t('grid.show')}
        value={localGridVisible}
        onToggle={() => {
          const next = !localGridVisible;
          setLocalGridVisible(next);
          view?.atlasStore?.getState().setGridVisible(next);
        }}
      />

      <SettingToggleRow
        label={t('grid.snap')}
        hint={t('grid.snapHint')}
        value={localSnapToGrid}
        onToggle={() => {
          const next = !localSnapToGrid;
          setLocalSnapToGrid(next);
          view?.atlasStore?.getState().setSnapToGrid(next);
        }}
      />

      <SettingRow label={t('grid.type')}>
        <ObsidianMenuDropdown
          className="atlas-setting-dropdown"
          value={currentType}
          options={GRID_TYPE_OPTIONS}
          onChange={(newType) => {
            if (!isGridType(newType)) return;
            view?.renderer?.getGridSystem()?.setGridType(newType);
            patchGrid({ type: newType });
          }}
        />
      </SettingRow>

      <MapUnitRow view={view} />

      <SceneUnitDistanceRow view={view} />

      <SettingRow label={t('grid.hexNumbers')}>
        <ObsidianMenuDropdown
          className="atlas-setting-dropdown"
          value={hexNumbers ?? 'off'}
          options={HEX_NUMBER_OPTIONS}
          onChange={(value) => {
            const format = isCellNumberFormat(value) ? value : undefined;
            setHexNumbers(format);
            patchGrid({ cellNumbers: format });
          }}
        />
      </SettingRow>

      {hexNumbers && (
        <SettingSliderRow
          label={t('grid.numberOpacity')}
          value={hexNumberOpacity * 100}
          min={0}
          max={100}
          step={5}
          displayValue={`${Math.round(hexNumberOpacity * 100)}%`}
          onChange={(percent) => {
            const opacity = percent / 100;
            setHexNumberOpacity(opacity);
            debouncedNumberOpacityUpdate(opacity);
          }}
        />
      )}

      <SettingRow label={t('grid.lineStyle')}>
        <ObsidianMenuDropdown
          className="atlas-setting-dropdown"
          value={currentLineType}
          options={LINE_STYLE_OPTIONS}
          onChange={(newLineType) => patchGrid({ lineType: newLineType })}
        />
      </SettingRow>

      <SettingSliderRow
        label={t('common.opacity')}
        value={localOpacity * 100}
        min={0}
        max={100}
        step={5}
        displayValue={`${Math.round(localOpacity * 100)}%`}
        onChange={(percent) => {
          const opacity = percent / 100;
          setLocalOpacity(opacity);
          debouncedOpacityUpdate(opacity);
        }}
      />

      <SettingSliderRow
        label={t('grid.lineWidth')}
        value={localLineWidth}
        min={0.5}
        max={5}
        step={0.5}
        displayValue={`${localLineWidth}px`}
        onChange={(lineWidth) => {
          setLocalLineWidth(lineWidth);
          debouncedLineWidthUpdate(lineWidth);
        }}
      />
      </div>

      <div className="atlas-command-palette-panel-column">
      <div className="atlas-setting-group">
        <span id={colourLabelId} className="atlas-setting-label">{t('common.colour')}</span>
        <div className="atlas-command-palette-swatches" role="radiogroup" aria-labelledby={colourLabelId}>
          {GRID_COLORS.map((color) => {
            const isActive = currentColor === color.value;
            const isAuto = color.value === undefined;
            return (
              <LabelTooltip key={color.label} label={color.label}>
                <button
                  type="button"
                  className={cn(
                    'atlas-command-palette-swatch',
                    isAuto && 'atlas-command-palette-swatch--auto',
                    isActive && 'atlas-active',
                  )}
                  onClick={() => patchGrid({ color: color.value })}
                  role="radio"
                  aria-checked={isActive}
                  style={isAuto ? undefined : { backgroundColor: color.value }}
                >
                  {isActive && <Check className="atlas-command-palette-swatch-check" />}
                </button>
              </LabelTooltip>
            );
          })}
        </div>
      </div>

      {/* For every scene made from now on, where the rows above are this scene's. */}
      <SettingToggleRow
        label={t('grid.detectOnNewScenes')}
        hint={t('grid.detectOnNewScenesHint')}
        value={newScenes.detects}
        onToggle={newScenes.toggle}
      />
      </div>
    </div>
  );
}
