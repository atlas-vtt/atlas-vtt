import React, { useState, useEffect } from 'react';
import { Grid, Hexagon } from 'lucide-react';
import { CloseButton } from '../../packages/components/primitives/CloseButton';
import type { AtlasView } from '../../atlas-view';
import { t } from '../../i18n';

interface GridSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  view: AtlasView | null;
}

type GridType = 'square' | 'hex-horizontal' | 'hex-vertical';
type UnitType = 'feet' | 'yards' | 'meters' | 'units';

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
    <div className="atlas-vtt-plugin atlas-vtt-root atlas-grid-settings-overlay">
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
            <h3>{t('gridModal.size')}</h3>
            <div className="atlas-grid-size-control">
              <input
                type="range"
                min="20"
                max="200"
                value={settings.size}
                onChange={(e) => updateSetting('size', Number(e.target.value))}
                className="atlas-grid-slider"
              />
              <span className="atlas-grid-size-value">{settings.size}px</span>
            </div>
          </div>
          
          {/* Grid Units */}
          <div className="atlas-grid-settings-section">
            <h3>{t('gridModal.units')}</h3>
            <div className="atlas-grid-units-control">
              <input
                type="number"
                min="1"
                max="100"
                value={settings.unitDistance}
                onChange={(e) => updateSetting('unitDistance', Number(e.target.value))}
                className="atlas-grid-units-input"
              />
              <select
                value={settings.unitType}
                onChange={(e) => updateSetting('unitType', e.target.value as UnitType)}
                className="atlas-grid-units-select"
              >
                <option value="feet">{t('gridModal.unit.feet')}</option>
                <option value="yards">{t('gridModal.unit.yards')}</option>
                <option value="meters">{t('gridModal.unit.meters')}</option>
                <option value="units">{t('gridModal.unit.units')}</option>
              </select>
              <span className="atlas-grid-units-label">{settings.type === 'square' ? t('gridModal.perSquare') : t('gridModal.perHex')}</span>
            </div>
          </div>
          
          {/* Grid Opacity */}
          <div className="atlas-grid-settings-section">
            <h3>{t('gridModal.opacity')}</h3>
            <div className="atlas-grid-opacity-control">
              <input
                type="range"
                min="0"
                max="100"
                value={settings.opacity * 100}
                onChange={(e) => updateSetting('opacity', Number(e.target.value) / 100)}
                className="atlas-grid-slider"
              />
              <span className="atlas-grid-opacity-value">{Math.round(settings.opacity * 100)}%</span>
            </div>
          </div>
          
          {/* Grid Visibility Toggle */}
          <div className="atlas-grid-settings-section">
            <label className="atlas-grid-visibility-toggle">
              <input
                type="checkbox"
                checked={gridVisible}
                onChange={(e) => setLocalGridVisible(e.target.checked)}
              />
              <span>{t('gridModal.show')}</span>
            </label>
          </div>
        </div>
        
        <div className="atlas-grid-settings-footer">
          <button className="atlas-grid-settings-cancel" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="atlas-grid-settings-apply" onClick={applySettings}>
            {t('gridModal.apply')}
          </button>
        </div>
      </div>
    </div>
  );
}