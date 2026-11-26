import { parseLayoutEdit, type DeviceMessage, type GmScreenDevice, type GmScreenLayout } from '../../protocol/index.ts';
import type { GmScreen, GmScreenOutlet } from '../screens.ts';
import { applyLayoutEdit, type EditResult, type KeyLibrary } from './layoutEdits.ts';

/** Where the GM's grids are kept: one per kind of device, the default until the GM changes it. */
export interface LayoutStore {
  layout(device: GmScreenDevice): GmScreenLayout;
  save(device: GmScreenDevice, layout: GmScreenLayout): void;
  /** Calls `listener` whenever the grids may have changed, here or synced from another computer; returns what stops that. */
  onChange(listener: () => void): () => void;
}

export interface LayoutScreenDeps {
  readonly store: LayoutStore;
  /** What a key may name now, read for every change. */
  library(): KeyLibrary;
  readonly outlet: GmScreenOutlet;
}

/**
 * The Keys screen's grid on Atlas's side: a device says which kind it is and gets that kind's grid; its
 * changes are read, applied to the stored grid one after the other and answered, and every connected device
 * of that kind gets the grid again, after the answer. A device that never says its kind (a page that shows
 * the long list) is sent nothing.
 */
export class LayoutScreen implements GmScreen {
  readonly takes = ['layout-ask', 'layout-edit'] as const;
  private readonly kinds = new Map<string, GmScreenDevice>();
  /** The grid each device was last sent, as JSON: a device is sent only a grid that differs. */
  private readonly shown = new Map<string, string>();
  private stopWatching: (() => void) | null = null;

  constructor(private readonly deps: LayoutScreenDeps) {}

  opened(device: string): void {
    this.shown.delete(device);
    this.send(device);
  }

  message(device: string, message: DeviceMessage): void {
    if (message.t === 'layout-ask') {
      this.kinds.set(device, message.device);
      this.stopWatching ??= this.deps.store.onChange(() => this.refresh());
      this.send(device);
      return;
    }
    if (message.t !== 'layout-edit') return;
    const kind = this.kinds.get(device);
    const result = kind === undefined ? { refused: 'no-layout' as const } : this.apply(kind, message.edit);
    this.deps.outlet.send({ t: 'layout-answer', id: message.id, refused: 'refused' in result ? result.refused : null }, device);
    if (kind === undefined || 'refused' in result) return;
    this.deps.store.save(kind, result.layout);
    this.refresh();
  }

  closed(device: string): void {
    this.kinds.delete(device);
    this.shown.delete(device);
    if (this.kinds.size > 0) return;
    this.stopWatching?.();
    this.stopWatching = null;
  }

  private apply(kind: GmScreenDevice, raw: Readonly<Record<string, unknown>>): EditResult {
    const edit = parseLayoutEdit(raw, kind);
    if (edit === null) return { refused: 'malformed' };
    return applyLayoutEdit(this.deps.store.layout(kind), edit, kind, this.deps.library());
  }

  private refresh(): void {
    for (const device of this.deps.outlet.devices) this.send(device);
  }

  private send(device: string): void {
    const kind = this.kinds.get(device);
    if (kind === undefined) return;
    const layout = this.deps.store.layout(kind);
    const json = JSON.stringify(layout);
    if (this.shown.get(device) === json) return;
    this.shown.set(device, json);
    this.deps.outlet.send({ t: 'layout', device: kind, layout }, device);
  }
}
