/**
 * Dice in notes roll with Atlas: every rendered note (reading view, embeds, hover previews, the DM
 * screen and note previews) links the rolls in its text, and a click rolls them as a statblock's are
 * rolled (`statblockDiceLinks.ts`): into the dice log of the map on screen, else of an open map, and
 * shown at the top right of the note's window where no map on screen there shows it. In Live Preview
 * the editor marks the same rolls and Ctrl/Cmd-click rolls them (`editorDice.ts`).
 */
import { MarkdownRenderChild, type App, type MarkdownPostProcessor, type Plugin } from 'obsidian';
import { attachDiceRolling } from '../services/statblockDiceLinks';
import { rollStatblockDice } from '../services/statblockRolls';
import { editorDiceExtension } from './editorDice';
import { linkNoteDice, STATBLOCK_SURFACES } from './noteDiceLinks';
import { NoteDiceDisplays } from './NoteDiceDisplays';
import { NoteDiceMenus } from './NoteDiceMenus';

/** What a note's roll links roll with and open their menus in. */
export interface NoteDice {
  app: App;
  displays: Pick<NoteDiceDisplays, 'rollsIn'>;
  menus: Pick<NoteDiceMenus, 'open' | 'closeWithin'>;
}

/** Rolls the links of one rendered section of a note, for as long as the section is shown. */
class NoteDiceChild extends MarkdownRenderChild {
  constructor(el: HTMLElement, private readonly dice: NoteDice) {
    super(el);
  }

  onload(): void {
    const { app, displays, menus } = this.dice;
    const el = this.containerEl;
    this.register(attachDiceRolling(el, app, () => ({}), {
      offMap: () => displays.rollsIn(el.ownerDocument),
      openMenu: (choices, at, link) => menus.open(choices, at, link),
      leaves: STATBLOCK_SURFACES,
    }));
    this.register(() => menus.closeWithin(el));
  }
}

export function noteDiceProcessor(dice: NoteDice): MarkdownPostProcessor {
  return (el, ctx) => {
    if (linkNoteDice(el)) ctx.addChild(new NoteDiceChild(el, dice));
  };
}

export function registerNoteDiceRolling(plugin: Plugin): void {
  const displays = new NoteDiceDisplays(plugin.app);
  const menus = new NoteDiceMenus();
  plugin.registerMarkdownPostProcessor(noteDiceProcessor({ app: plugin.app, displays, menus }));
  plugin.registerEditorExtension(editorDiceExtension((formula, side, doc) => {
    rollStatblockDice(plugin.app, formula, {}, displays.rollsIn(doc), side);
  }));
  plugin.register(() => {
    menus.destroy();
    displays.destroy();
  });
}
