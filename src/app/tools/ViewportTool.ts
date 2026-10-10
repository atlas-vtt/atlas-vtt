import { EventEmitter } from 'events';

export type ViewportToolSubMode = 'place' | 'edit';

export interface ViewportToolSettings {
  subMode: ViewportToolSubMode;
}

/**
 * Handles TV-viewport tool state. Placement itself is a single click (or a
 * click-drag when unlocked); there is no multi-step drawing chain like walls.
 */
export class ViewportTool {
  private settings: ViewportToolSettings = { subMode: 'place' };
  private eventBus: EventEmitter;

  constructor(eventBus: EventEmitter) {
    this.eventBus = eventBus;
  }

  getSettings(): ViewportToolSettings {
    return this.settings;
  }

  setSubMode(subMode: ViewportToolSubMode): void {
    if (this.settings.subMode === subMode) return;
    this.settings.subMode = subMode;
    this.eventBus.emit('viewport-submode-changed', subMode);
  }
}
