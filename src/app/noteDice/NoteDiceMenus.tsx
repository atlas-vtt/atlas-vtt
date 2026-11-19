import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import type { RollChoice } from '../services/statblockDiceLinks';
import type { ContextMenuController } from '../react/root/ContextMenuContext';
import { RollMenuHost } from '../statblocks/render/shared/RollMenuHost';
import { rollMenuEntries } from '../statblocks/render/shared/rollMenuEntries';
import { portalHost } from '../host/portalHost';
import { PerWindow, type WindowPart } from './perWindow';

/** A window's menu for the roll links of its notes. */
class NoteDiceMenu implements WindowPart {
  private readonly host: HTMLElement;
  private readonly root: Root;
  private readonly controller: { current: ContextMenuController | null } = { current: null };
  private trigger: HTMLElement | null = null;

  constructor(doc: Document) {
    this.host = portalHost(doc).createDiv();
    this.root = createRoot(this.host);
    // Rendered at once, so the menu opens with the click that made it.
    flushSync(() => this.root.render(<RollMenuHost controller={this.controller} />));
  }

  open(choices: readonly RollChoice[], at: { x: number; y: number }, link: HTMLElement): void {
    this.trigger = link;
    this.controller.current?.open(rollMenuEntries(choices), at, { returnFocus: link });
  }

  /** Closes the menu where it was opened from a link in `section`, which goes. */
  closeWithin(section: HTMLElement): void {
    if (this.trigger && section.contains(this.trigger)) {
      this.controller.current?.close();
      this.trigger = null;
    }
  }

  destroy(): void {
    this.root.unmount();
    this.host.remove();
  }
}

/** The menus of the roll links in notes: one per window, popouts included. */
export class NoteDiceMenus {
  private readonly menus = new PerWindow((doc) => new NoteDiceMenu(doc));

  open(choices: readonly RollChoice[], at: { x: number; y: number }, link: HTMLElement): void {
    this.menus.in(link.ownerDocument).open(choices, at, link);
  }

  closeWithin(section: HTMLElement): void {
    this.menus.peek(section.ownerDocument)?.closeWithin(section);
  }

  destroy(): void {
    this.menus.destroy();
  }
}
