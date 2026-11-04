import React, { useMemo, useState } from 'react';
import { ChevronDown, Plus, Swords } from 'lucide-react';
import { cn } from '../../../../utils/cn';
import { Button } from '../../../packages/components/primitives/button';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';
import type { AnyWidget } from '../../../types/widgetTypes';
import type { ViewAtlasState } from '../../../storeFactory';
import { deleteCollectionWidget } from '../../../services/collectionWidgetDeletion';
import { WidgetSyncService } from '../../../services/WidgetSyncService';
import { isCollectionWidget } from '../../../utils/collectionWidgets';
import { useCollectionWidgetLibrary } from '../../hooks/useCollectionWidgetLibrary';
import { useMapCollectionId } from '../../hooks/useMapCollectionId';
import { useAtlasUI } from '../../root/AtlasUIContext';
import { useViewStoreHook } from '../../ViewStoreContext';
import { stepCounter } from '../../../utils/counterWidget';
import { isWidgetOn } from '../../../utils/widgetActivation';
import { SettingToggleRow } from './SettingRows';
import { WidgetEditorForm, type WidgetDraft } from './WidgetEditorForm';
import { WidgetListItem } from './WidgetListItem';
import { widgetRows, type WidgetRow } from './widgetRows';
import { t } from '../../../i18n';

interface WidgetSettingsPanelProps {
  widgetSettings: ViewAtlasState['widgetSettings'];
  setWidgetSettings: ViewAtlasState['setWidgetSettings'];
  updateWidget: ViewAtlasState['updateWidget'];
  addWidget: ViewAtlasState['addWidget'];
  removeWidget: ViewAtlasState['removeWidget'];
  sortedWidgets: AnyWidget[];
  initiative: ViewAtlasState['initiative'];
  setInitiativeConfig: ViewAtlasState['setInitiativeConfig'];
  initiativeTrackerOpen: boolean;
  setInitiativeTrackerOpen: ViewAtlasState['setInitiativeTrackerOpen'];
}

const DEFAULT_TIMER_SECONDS = 300;

export const WidgetSettingsPanel = React.memo(function WidgetSettingsPanel({
  widgetSettings,
  setWidgetSettings,
  updateWidget,
  addWidget,
  removeWidget,
  sortedWidgets,
  initiative,
  setInitiativeConfig,
  initiativeTrackerOpen,
  setInitiativeTrackerOpen,
}: WidgetSettingsPanelProps): React.ReactElement {
  const [initiativeExpanded, setInitiativeExpanded] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const { app } = useAtlasUI();
  const collectionId = useMapCollectionId();
  const library = useCollectionWidgetLibrary(collectionId);
  const store = useViewStoreHook();
  const rows = useMemo(
    () => widgetRows(sortedWidgets, (widget) => isWidgetOn(widgetSettings, widget), library),
    [sortedWidgets, widgetSettings, library],
  );

  // Persisted state from older maps can lack these fields; both default to on.
  const globalVisible = widgetSettings?.globalVisible !== false;
  const autoSort = initiative?.config?.autoSort ?? true;

  const toggleGlobalVisible = (): void => {
    setWidgetSettings({ ...widgetSettings, globalVisible: !globalVisible });
  };

  const editingRow = rows.find((row) => row.widget.id === editingId);
  const editingWidget = editingRow?.widget;
  const editorOpen = isAdding || !!editingWidget;

  /** Widgets the scene holds change there (and reach the library through the sync); the others in the library. */
  const changeWidget = (row: WidgetRow, changes: Partial<AnyWidget>): void => {
    if (row.inScene) {
      updateWidget(row.widget.id, changes);
    } else if (collectionId) {
      WidgetSyncService.forApp(app)?.editCollectionWidgets(collectionId, (widgets) => {
        const widget = widgets[row.widget.id];
        return widget ? { ...widgets, [widget.id]: Object.assign({}, widget, changes) } : widgets;
      });
    }
  };

  const toggleHere = ({ widget, inScene, active }: WidgetRow): void => {
    if (inScene) store.getState().setWidgetOn(widget.id, !active);
    else addWidget(widget);
  };

  /** Switching a widget on in every scene also switches it on here. */
  const toggleEveryScene = (row: WidgetRow): void => {
    const scope = isCollectionWidget(row.widget) ? 'scene' : 'collection';
    if (!row.inScene) {
      addWidget({ ...row.widget, scope });
      return;
    }
    updateWidget(row.widget.id, { scope });
    if (scope === 'collection') store.getState().setWidgetOn(row.widget.id, true);
  };

  const deleteWidget = ({ widget }: WidgetRow): void => {
    if (collectionId) void deleteCollectionWidget(app, collectionId, widget.id);
    else removeWidget(widget.id);
  };

  const closeEditor = (): void => {
    setIsAdding(false);
    setEditingId(null);
  };

  const handleSubmit = (draft: WidgetDraft): void => {
    if (editingRow) {
      const { label, icon, color, scope, segments, showCount } = draft;
      if (editingRow.widget.type === 'clock') {
        changeWidget(editingRow, { label, icon, color, scope, segments, showCount });
        // A step of 0 clamps a filled clock to its new segment count.
        if (editingRow.inScene) stepCounter(store, editingRow.widget.id, 0);
      } else {
        changeWidget(editingRow, { label, icon, color, scope });
      }
    } else {
      const base = {
        id: `${draft.type}-${Date.now()}`,
        label: draft.label,
        icon: draft.icon,
        color: draft.color,
        scope: draft.scope,
        visible: true,
        visibleToPlayers: true,
        order: Math.max(-1, ...rows.map((row) => row.widget.order)) + 1,
      };
      if (draft.type === 'timer') {
        addWidget({ ...base, type: 'timer', value: DEFAULT_TIMER_SECONDS, duration: DEFAULT_TIMER_SECONDS, direction: 'down' });
      } else if (draft.type === 'clock') {
        addWidget({ ...base, type: 'clock', value: 0, segments: draft.segments, showCount: draft.showCount });
      } else {
        addWidget({ ...base, type: 'counter', value: 0 });
      }
    }
    closeEditor();
  };

  return (
    <div className="atlas-command-palette-panel">
      <div className="atlas-command-palette-panel-column">
        <SettingToggleRow label={t('widgets.showAll')} value={globalVisible} onToggle={toggleGlobalVisible} />

        <div className="atlas-command-palette-collapsible">
          <button
            type="button"
            className="atlas-command-palette-collapsible-header"
            onClick={() => setInitiativeExpanded(!initiativeExpanded)}
            aria-expanded={initiativeExpanded}
          >
            <span className="atlas-command-palette-collapsible-title">
              <Swords />
              <span>{t('widgets.initiativeTracker')}</span>
            </span>
            <ChevronDown className={cn('atlas-command-palette-collapsible-chevron', initiativeExpanded && 'atlas-open')} />
          </button>

          {initiativeExpanded && (
            <div className="atlas-command-palette-collapsible-content">
              <SettingToggleRow
                label={t('widgets.showInitiative')}
                value={initiativeTrackerOpen}
                onToggle={() => setInitiativeTrackerOpen(!initiativeTrackerOpen)}
              />
              <SettingToggleRow
                label={t('widgets.autoSort')}
                value={autoSort}
                onToggle={() => setInitiativeConfig({ autoSort: !autoSort })}
              />
            </div>
          )}
        </div>
      </div>

      <div className="atlas-command-palette-panel-column">
        {editorOpen ? (
          <div className="atlas-setting-group">
            <span className="atlas-setting-label">{editingWidget ? t('widgets.edit') : t('widgets.new')}</span>
            <WidgetEditorForm
              key={editingWidget?.id ?? 'new'}
              {...(editingWidget ? { initial: editingWidget } : {})}
              canShareWithCollection={collectionId !== null}
              submitLabel={editingWidget ? t('common.save') : t('widgets.add')}
              onSubmit={handleSubmit}
              onCancel={closeEditor}
            />
          </div>
        ) : (
        <div className="atlas-setting-group">
          <div className="atlas-setting-group atlas-setting-group--row">
            <span className="atlas-setting-label">{t('widgets.heading')}</span>
            <LabelTooltip label={t('widgets.add')}>
              <Button
                variant="ghost"
                size="icon"
                className="atlas-command-palette-icon-btn"
                onClick={() => setIsAdding(true)}
              >
                <Plus />
              </Button>
            </LabelTooltip>
          </div>
          {rows.length === 0 && (
            <span className="atlas-setting-hint">{t('widgets.empty')}</span>
          )}
          <div className="atlas-command-palette-widget-list">
            {rows.map((row) => (
              <WidgetListItem
                key={row.widget.id}
                widget={row.widget}
                active={row.active}
                inCollection={collectionId !== null}
                onEdit={() => setEditingId(row.widget.id)}
                onUpdate={(changes) => changeWidget(row, changes)}
                onToggleHere={() => toggleHere(row)}
                onToggleEveryScene={() => toggleEveryScene(row)}
                onDelete={() => deleteWidget(row)}
              />
            ))}
          </div>

        </div>
        )}
      </div>
    </div>
  );
});
