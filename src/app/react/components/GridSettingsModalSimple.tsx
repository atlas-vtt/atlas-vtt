import React, { useState, useEffect, useId } from 'react';
import { Grid, Hexagon } from 'lucide-react';
import { CloseButton } from '../../packages/components/primitives/CloseButton';
import { ToggleLabel } from '../../packages/components/primitives/Toggle';
import { Button } from '../../packages/components/primitives/button';
import { Select, type SelectOption } from '../../packages/components/primitives/Select';
import { Slider } from '../../packages/components/primitives/slider';
import type { AtlasView } from '../../atlas-view';
import { t } from '../../i18n';

interface GridSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  view: AtlasView | null;
}

type GridType = 'square' | 'hex-horizontal' | 'hex-vertical';
type UnitType = 'feet' | 'yards' | 'meters' | 'units';

const UNIT_TYPES: readonly UnitType[] = ['feet', 'yards', 'meters', 'units'];

interface GridSettings {
  type: GridType;
  size: number;
  unitType: UnitType;
  unitDistance: number;
  offsetX: number;
  offsetY: number;
  scale: number;
  opacity: number;
}

export function GridSettingsModal({ isOpen, onClose, view }: GridSettingsModalProps) {
  // Grid settings state - initialize from store when modal opens
  const [settings, setSettings] = useState<GridSettings>(() => {
    const currentGrid = view?.atlasStore?.getState()?.grid;
    return {
      type: currentGrid?.type || 'square',
      size: currentGrid?.size || 50,
      unitType: currentGrid?.unitType || 'feet',
      unitDistance: currentGrid?.unitDistance || 5,
      offsetX: currentGrid?.offsetX || 0,
      offsetY: currentGrid?.offsetY || 0,
      scale: currentGrid?.scale || 1,
      opacity: currentGrid?.opacity || 0.3
    };
  });
  
  const sizeLabel = useId();
  const unitsLabel = useId();
  const opacityLabel = useId();
  const [layer, setLayer] = useState<HTMLDivElement | null>(null);
  const unitOptions: SelectOption<UnitType>[] = UNIT_TYPES.map(unit => ({ value: unit, label: t(`gridModal.unit.${unit}`) }));

  const [gridVisible, setLocalGridVisible] = useState(() => {
    return view?.atlasStore?.getState()?.grid?.visible ?? true;
  });
  
  // Update settings when modal opens to reflect current store state
  useEffect(() => {
    if (isOpen && view?.atlasStore) {
      const currentGrid = view.atlasStore.getState().grid;
      if (currentGrid) {
        setSettings({
          type: currentGrid.type || 'square',
          size: currentGrid.size || 50,
          unitType: currentGrid.unitType || 'feet',
          unitDistance: currentGrid.unitDistance || 5,
          offsetX: currentGrid.offsetX || 0,
          offsetY: currentGrid.offsetY || 0,
          scale: currentGrid.scale || 1,
          opacity: currentGrid.opacity || 0.3
        });
        setLocalGridVisible(currentGrid.visible ?? true);
      }
    }
  }, [isOpen, view]);

  const updateSetting = <K extends keyof GridSettings>(key: K, value: GridSettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const applySettings = () => {
    const gridSystem = view?.renderer?.getGridSystem();
    if (gridSystem) {
      
      // Update grid settings
      gridSystem.setGridType(settings.type);
      gridSystem.setGridSize(settings.size);
      gridSystem.setGridOffset(settings.offsetX, settings.offsetY);
      gridSystem.setGridOpacity(settings.opacity);
      
      // Update grid visibility and settings via store
      if (view?.atlasStore) {
        view.atlasStore.getState().setGridVisible(gridVisible);
        view.atlasStore.getState().setGridUnits({
          unitType: settings.unitType,
          unitDistance: settings.unitDistance
        });
        
        // Update grid settings in store for persistence
        const currentGrid = view.atlasStore.getState().grid;
        if (!currentGrid) return;
        const newGridState = {
          ...currentGrid,
          type: settings.type,
          size: settings.size,
          offsetX: settings.offsetX,
          offsetY: settings.offsetY,
          opacity: settings.opacity,
          unitType: settings.unitType,
          unitDistance: settings.unitDistance,
          visible: gridVisible,
          enabled: currentGrid.enabled
        };
        
        view.atlasStore.getState().setGrid(newGridState);
        
        // Verify it was set
      }
    }
    
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div ref={setLayer} className="atlas-vtt-plugin atlas-vtt-root atlas-grid-settings-overlay">
      <div className="atlas-grid-settings-backdrop" onClick={onClose} />
      
      <div className="atlas-vtt-plugin atlas-grid-settings-modal">
        <div className="atlas-grid-settings-header">
          <h2>{t('gridModal.title')}</h2>
          <CloseButton onClick={onClose} />
        </div>
        
        <div className="atlas-grid-settings-content">
          {/* Grid Type Selection */}
          <div className="atlas-grid-settings-section">
            <h3>{t('gridModal.type')}</h3>
            <div className="atlas-grid-type-options">
              <button
                className={`atlas-grid-type-option ${settings.type === 'square' ? 'atlas-active' : ''}`}
                onClick={() => updateSetting('type', 'square')}
              >
                <Grid size={24} />
                <span>{t('grid.type.square')}</span>
              </button>
              <button
                className={`atlas-grid-type-option ${settings.type === 'hex-horizontal' ? 'atlas-active' : ''}`}
                onClick={() => updateSetting('type', 'hex-horizontal')}
              >
                <Hexagon size={24} />
                <span>{t('grid.type.hexFlat')}</span>
              </button>
              <button
                className={`atlas-grid-type-option ${settings.type === 'hex-vertical' ? 'atlas-active' : ''}`}
                onClick={() => updateSetting('type', 'hex-vertical')}
              >
                <Hexagon size={24} className="atlas-rotate-30" />
                <span>{t('grid.type.hexPointy')}</span>
              </button>
            </div>
          </div>
          
          {/* Grid Size */}
          <div className="atlas-grid-settings-section">
            <h3 id={sizeLabel}>{t('gridModal.size')}</h3>
            <div className="atlas-grid-size-control">
              <Slider
                aria-labelledby={sizeLabel}
                min={20}
                max={200}
                value={[settings.size]}
                onValueChange={(next: number[]) => updateSetting('size', next[0] ?? settings.size)}
              />
              <span className="atlas-grid-size-value">{settings.size}px</span>
            </div>
          </div>
          
          {/* Grid Units */}
          <div className="atlas-grid-settings-section">
            <h3 id={unitsLabel}>{t('gridModal.units')}</h3>
            <div className="atlas-grid-units-control">
              <input
                type="number"
                min="1"
                max="100"
                aria-labelledby={unitsLabel}
                value={settings.unitDistance}
                onChange={(e) => updateSetting('unitDistance', Number(e.target.value))}
                className="atlas-grid-units-input"
              />
              <Select labelledBy={unitsLabel} layer={layer} value={settings.unitType} options={unitOptions} onChange={(unit) => updateSetting('unitType', unit)} />
              <span className="atlas-grid-units-label">{settings.type === 'square' ? t('gridModal.perSquare') : t('gridModal.perHex')}</span>
            </div>
          </div>
          
          {/* Grid Opacity */}
          <div className="atlas-grid-settings-section">
            <h3 id={opacityLabel}>{t('gridModal.opacity')}</h3>
            <div className="atlas-grid-opacity-control">
              <Slider
                aria-labelledby={opacityLabel}
                min={0}
                max={100}
                value={[settings.opacity * 100]}
                onValueChange={(next: number[]) => updateSetting('opacity', (next[0] ?? settings.opacity * 100) / 100)}
              />
              <span className="atlas-grid-opacity-value">{Math.round(settings.opacity * 100)}%</span>
            </div>
          </div>
          
          {/* Grid Visibility Toggle */}
          <div className="atlas-grid-settings-section">
            <ToggleLabel label={t('gridModal.show')} value={gridVisible} onChange={() => setLocalGridVisible(!gridVisible)} />
          </div>
        </div>
        
        <div className="atlas-grid-settings-footer">
          <Button variant="outline" size="sm" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button size="sm" onClick={applySettings}>
            {t('gridModal.apply')}
          </Button>
        </div>
      </div>
    </div>
  );
}