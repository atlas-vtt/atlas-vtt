import type { EventEmitter } from 'events';
import type { LightingToolOptions } from '../../lighting/lightingTool';
import type { ViewAtlasStore } from '../../storeFactory';

/**
 * Hands the lighting tool's choices in the view's store on to the editors, which hear them as
 * events: at once, so editors built after the GM chose a mode (dynamic lighting switched on
 * again) start in it, and then on every change. Returns the unsubscribe.
 */
export function followLightingTool(store: ViewAtlasStore, eventBus: EventEmitter): () => void {
  const tell = (tool: LightingToolOptions, before?: LightingToolOptions): void => {
    if (tool.drawMode !== before?.drawMode) eventBus.emit('wall-mode-changed', tool.drawMode);
    if (tool.mode !== before?.mode) eventBus.emit('wall-submode-changed', tool.mode);
    if (tool.lightPreset !== null && tool.lightPreset !== before?.lightPreset) eventBus.emit('lighting-preset-changed', tool.lightPreset);
  };
  tell(store.getState().lightingTool);
  return store.subscribe((state, previous) => {
    if (state.lightingTool !== previous.lightingTool) tell(state.lightingTool, previous.lightingTool);
  });
}
