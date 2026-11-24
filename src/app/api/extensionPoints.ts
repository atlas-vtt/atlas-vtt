import type { SettingMount, TokenOverlay } from './apiTypes';

/** What other plugins added to one part of Atlas, in the order they added it; a new array on every change. */
export class Extensions<T> {
  private items: readonly T[] = [];
  private readonly listeners = new Set<() => void>();

  add(item: T): () => void {
    this.items = [...this.items, item];
    this.notify();
    return () => {
      if (!this.items.includes(item)) return;
      this.items = this.items.filter((each) => each !== item);
      this.notify();
    };
  }

  list = (): readonly T[] => this.items;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  clear(): void {
    if (this.items.length === 0) return;
    this.items = [];
    this.notify();
  }

  private notify(): void {
    for (const listener of [...this.listeners]) listener();
  }
}

/** Rows other plugins added to Appearance settings. */
export const appearanceSettings = new Extensions<SettingMount>();
/** Pictures other plugins draw over every token. */
export const tokenOverlays = new Extensions<TokenOverlay>();
