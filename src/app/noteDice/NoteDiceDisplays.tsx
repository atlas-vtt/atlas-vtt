import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { App } from 'obsidian';
import { diceSetOfCollection } from '../services/diceSets/collectionDiceSets';
import { offlineDiceInputs } from '../services/offlineDiceInputs';
import { mapDice } from '../services/statblockRolls';
import { rollDiceFormula } from '../tools/DiceTool';
import { advantageSidesFor } from '../tools/diceAdvantage';
import { rollingRules } from '../gameSystems/diceSets';
import type { AdvantageSide } from '../types/diceSetTypes';
import type { DiceRollResult } from '../types/diceTypes';
import { AtlasUIContext } from '../react/root/AtlasUIContext';
import { DiceRollDisplay, type DiceRollSubscription, type RollOptions } from '../react/components/dice/DiceRollDisplay';

type Listener = (result: DiceRollResult, options: RollOptions) => void;

class NoteDiceDisplay {
  private readonly host: HTMLElement;
  private readonly root: Root;
  private readonly listeners = new Set<Listener>();
  private waiting: Array<{ result: DiceRollResult; options: RollOptions }> = [];

  constructor(app: App, doc: Document) {
    this.host = doc.defaultView!.createDiv();
    this.host.className = 'atlas-note-dice-rolls';
    doc.body.append(this.host);
    this.root = createRoot(this.host);
    this.root.render(
      <AtlasUIContext.Provider value={{ app, view: null, pixiApp: null, renderer: null }}>
        <DiceRollDisplay container={this.host} subscribe={this.subscribe} cardSounds />
      </AtlasUIContext.Provider>,
    );
  }

  private readonly subscribe: DiceRollSubscription = (listener) => {
    this.listeners.add(listener);
    for (const { result, options } of this.waiting.splice(0)) listener(result, options);
    return () => { this.listeners.delete(listener); };
  };

  show(result: DiceRollResult, muted: boolean): void {
    const options = { muted };
    if (this.listeners.size === 0) this.waiting.push({ result, options });
    else for (const listener of this.listeners) listener(result, options);
  }

  destroy(): void {
    this.root.unmount();
    this.host.remove();
    this.listeners.clear();
    this.waiting = [];
  }
}

/** A single display per document, created only when a note needs to show a roll. */
export class NoteDiceDisplays {
  private readonly displays = new Map<Document, NoteDiceDisplay>();
  private readonly closing = new Map<Document, () => void>();

  constructor(private readonly app: App) {}

  advantageSides(formula: string): AdvantageSide[] {
    const map = mapDice(this.app, undefined);
    const rules = map ? map.tool.rollingDice?.() : rollingRules(diceSetOfCollection(this.app, null));
    return rules ? advantageSidesFor(formula, rules) : [];
  }

  roll(doc: Document, formula: string, advantage: AdvantageSide | null): void {
    const map = mapDice(this.app, undefined);
    const options = advantage ? { advantage } : undefined;
    const result = map
      ? map.tool.rollDice(formula, { type: 'toolbar' }, undefined, options)
      : rollDiceFormula(formula, diceSetOfCollection(this.app, null), offlineDiceInputs(), undefined, advantage ?? undefined);
    if (!result || (map?.onScreen && (!map.document || map.document === doc))) return;
    let display = this.displays.get(doc);
    if (!display) {
      display = new NoteDiceDisplay(this.app, doc);
      this.displays.set(doc, display);
      const close = (): void => {
        this.displays.get(doc)?.destroy();
        this.displays.delete(doc);
        this.closing.delete(doc);
      };
      doc.defaultView?.addEventListener('unload', close, { once: true });
      this.closing.set(doc, close);
    }
    display.show(result, !!map);
  }

  destroy(): void {
    for (const [doc, close] of this.closing) doc.defaultView?.removeEventListener('unload', close);
    for (const display of this.displays.values()) display.destroy();
    this.displays.clear();
    this.closing.clear();
  }
}
