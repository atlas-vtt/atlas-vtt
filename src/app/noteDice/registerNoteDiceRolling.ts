import { MarkdownRenderChild, type MarkdownPostProcessor, type Plugin } from 'obsidian';
import { advantageSide } from '../tools/diceAdvantage';
import type { AdvantageSide } from '../types/diceSetTypes';
import { rollChoiceLabel, type RollChoice } from '../services/statblockDiceLinks';
import { linkNoteDice } from './noteDiceLinks';
import { NoteDiceDisplays } from './NoteDiceDisplays';
import { NoteDiceMenus } from './NoteDiceMenus';

class NoteDiceChild extends MarkdownRenderChild {
  constructor(el: HTMLElement, private readonly displays: NoteDiceDisplays, private readonly menus: NoteDiceMenus) {
    super(el);
  }

  onload(): void {
    const linkOf = (event: Event): HTMLElement | null => {
      const target = event.target;
      if (!(target instanceof this.containerEl.ownerDocument.defaultView!.Element)) return null;
      const link = target.closest<HTMLElement>('.atlas-note-dice-link');
      return link && this.containerEl.contains(link) && link.dataset.formula ? link : null;
    };

    const roll = (event: MouseEvent | KeyboardEvent): void => {
      if ('key' in event && event.key !== 'Enter' && event.key !== ' ') return;
      const link = linkOf(event);
      if (!link || !link.dataset.formula) return;
      event.preventDefault();
      event.stopPropagation();
      this.displays.roll(link.ownerDocument, link.dataset.formula, advantageSide(event.shiftKey, event.altKey));
    };
    const contextMenu = (event: MouseEvent): void => {
      const link = linkOf(event);
      const formula = link?.dataset.formula;
      if (!link || !formula) return;
      event.preventDefault();
      event.stopPropagation();
      const sides: Array<AdvantageSide | null> = [null, ...this.displays.advantageSides(formula)];
      const choices: RollChoice[] = sides.map((side) => ({
        label: rollChoiceLabel(side), side, roll: () => this.displays.roll(link.ownerDocument, formula, side),
      }));
      const rect = link.getBoundingClientRect();
      this.menus.open(choices, event.button === 2 ? { x: event.clientX, y: event.clientY } : { x: rect.left, y: rect.bottom }, link);
    };
    this.registerDomEvent(this.containerEl, 'click', roll);
    this.registerDomEvent(this.containerEl, 'keydown', roll);
    this.registerDomEvent(this.containerEl, 'contextmenu', contextMenu);
    this.register(() => this.menus.closeWithin(this.containerEl));
  }
}

export function noteDiceProcessor(displays: NoteDiceDisplays, menus: NoteDiceMenus): MarkdownPostProcessor {
  return (el, ctx) => {
    if (linkNoteDice(el)) ctx.addChild(new NoteDiceChild(el, displays, menus));
  };
}

export function registerNoteDiceRolling(plugin: Plugin): void {
  const displays = new NoteDiceDisplays(plugin.app);
  const menus = new NoteDiceMenus();
  plugin.registerMarkdownPostProcessor(noteDiceProcessor(displays, menus));
  plugin.register(() => { menus.destroy(); displays.destroy(); });
}
