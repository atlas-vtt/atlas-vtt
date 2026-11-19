import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import type { RollChoice } from '../services/statblockDiceLinks';
import type { ContextMenuController } from '../react/root/ContextMenuContext';
import { RollMenuHost } from '../statblocks/render/shared/RollMenuHost';
import { rollMenuEntries } from '../statblocks/render/shared/rollMenuEntries';
import { portalHost } from '../host/portalHost';

class NoteDiceMenu {
  private readonly host: HTMLElement;
  private readonly root: Root;
  private readonly controller: { current: ContextMenuController | null } = { current: null };
  private trigger: HTMLElement | null = null;

  constructor(doc: Document) {
    this.host = doc.defaultView!.createDiv();
    portalHost(doc).append(this.host);
    this.root = createRoot(this.host);
    flushSync(() => this.root.render(<RollMenuHost controller={this.controller} />));
  }

  open(choices: readonly RollChoice[], at: { x: number; y: number }, link: HTMLElement): void {
    this.trigger = link;
    this.controller.current?.open(rollMenuEntries(choices), at, { returnFocus: link });
  }

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

/** One local Atlas menu per document, including popout windows. */
export class NoteDiceMenus {
  private readonly menus = new Map<Document, NoteDiceMenu>();
  private readonly closing = new Map<Document, () => void>();

  open(choices: readonly RollChoice[], at: { x: number; y: number }, link: HTMLElement): void {
    const doc = link.ownerDocument;
    let menu = this.menus.get(doc);
    if (!menu) {
      menu = new NoteDiceMenu(doc);
      this.menus.set(doc, menu);
      const close = (): void => {
        this.menus.get(doc)?.destroy();
        this.menus.delete(doc);
        this.closing.delete(doc);
      };
      doc.defaultView?.addEventListener('unload', close, { once: true });
      this.closing.set(doc, close);
    }
    menu.open(choices, at, link);
  }

  closeWithin(section: HTMLElement): void {
    this.menus.get(section.ownerDocument)?.closeWithin(section);
  }

  destroy(): void {
    for (const [doc, close] of this.closing) doc.defaultView?.removeEventListener('unload', close);
    for (const menu of this.menus.values()) menu.destroy();
    this.menus.clear();
    this.closing.clear();
  }
}
