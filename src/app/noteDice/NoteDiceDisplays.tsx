import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { App } from 'obsidian';
import { AssetService } from '../services/AssetService';
import { collectionRolls, type CollectionRolls } from '../services/collectionRolls';
import type { OffMapRolls } from '../services/statblockRolls';
import type { DiceRollResult } from '../types/diceTypes';
import { AtlasUIContext } from '../react/root/AtlasUIContext';
import { DiceRollDisplay } from '../react/components/dice/DiceRollDisplay';
import { RollFeed } from '../react/components/dice/rollFeed';
import { portalHost } from '../host/portalHost';
import { PerWindow, type WindowPart } from './perWindow';

/** A window's display of the rolls made from its notes, at its top right. */
class NoteDiceDisplay implements WindowPart {
  private readonly feed = new RollFeed();
  private readonly host: HTMLElement;
  private readonly root: Root;

  constructor(app: App, doc: Document) {
    this.host = portalHost(doc).createDiv({ cls: 'atlas-note-dice-rolls' });
    this.root = createRoot(this.host);
    this.root.render(
      <AtlasUIContext.Provider value={{ app, view: null, pixiApp: null, renderer: null }}>
        <DiceRollDisplay container={this.host} subscribe={this.feed.subscribe} cardSounds />
      </AtlasUIContext.Provider>,
    );
  }

  show(result: DiceRollResult, muted: boolean): void {
    this.feed.show(result, muted);
  }

  destroy(): void {
    this.root.unmount();
    this.host.remove();
  }
}

/**
 * Where the rolls of a note's dice show that no map on screen in its window shows (`statblockRolls.ts`):
 * thrown at the top right of the note's window, one display per window, mounted with its first roll.
 * While no map is open they roll by the default collection's dice.
 */
export class NoteDiceDisplays {
  private readonly displays: PerWindow<NoteDiceDisplay>;
  private readonly dice: CollectionRolls;

  constructor(app: App) {
    this.displays = new PerWindow((doc) => new NoteDiceDisplay(app, doc));
    this.dice = collectionRolls(app, () => AssetService.getInstance(app).getDefaultCollectionId());
  }

  /** The rolls of the notes in `doc`'s window. */
  rollsIn(doc: Document): OffMapRolls {
    return { ...this.dice, document: doc, show: (result, muted) => this.displays.in(doc).show(result, muted) };
  }

  destroy(): void {
    this.displays.destroy();
  }
}
