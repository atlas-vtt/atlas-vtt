import { useContext, useEffect, useRef, useState } from 'react';
import { AtlasUIContext } from '../react/root/AtlasUIContext';
import { SettingsService } from '../services/SettingsService';
import { availableHotkeys, canRunMapHotkeys, DEFAULT_MAP_HOTKEYS, formatHotkey, matchesMapHotkey, type HeldWidgetHotkeyId, type MapHotkeyId } from './mapHotkeys';

export function useAtlasSettings(explicit?: SettingsService): SettingsService | undefined {
  const context = useContext(AtlasUIContext);
  const settings = explicit ?? SettingsService.forApp(context?.app);
  const [, refresh] = useState(0);
  useEffect(() => settings?.onChange(() => refresh(n => n + 1)), [settings]);
  return settings;
}
export function useHotkeyLabels(): (id: MapHotkeyId) => string {
  const settings = useAtlasSettings();
  const bindings = settings?.getHotkeys() ?? DEFAULT_MAP_HOTKEYS;
  return id => formatHotkey(bindings[id]);
}
/** Text selected on the page, e.g. in the dice log, which the browser's own copy should handle. */
function hasTextSelection(event: KeyboardEvent): boolean {
  const target = event.target instanceof Node ? event.target : null;
  const selection = (target?.ownerDocument ?? document).getSelection();
  return !!selection && !selection.isCollapsed && selection.toString().trim() !== '';
}
type HotkeyHandlers = Partial<Record<MapHotkeyId, (event: KeyboardEvent) => void>>;
/** Held-widget actions are left to the widget bar, which runs them only while a number key is held. */
export function useMapHotkeys(handlers: Partial<Record<Exclude<MapHotkeyId, HeldWidgetHotkeyId>, (event: KeyboardEvent) => void>>, viewId?: string): void {
  const context = useContext(AtlasUIContext);
  const settings = SettingsService.forApp(context?.app);
  const current = useRef<HotkeyHandlers>(handlers);
  current.current = handlers;
  const view = context?.view as { viewId?: string } | null | undefined;
  const id = viewId ?? view?.viewId;
  useEffect(() => {
    const handle = (event: KeyboardEvent): void => {
      if (!canRunMapHotkeys(event, id)) return;
      const action = availableHotkeys().find(action => current.current[action.id] && matchesMapHotkey(event, action.id, settings));
      if (!action || ('yieldsToTextSelection' in action && hasTextSelection(event))) return;
      event.preventDefault();
      current.current[action.id]?.(event);
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [id, settings]);
}
