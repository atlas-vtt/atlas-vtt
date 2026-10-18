import { createElement, useCallback, useContext, useLayoutEffect, useRef, type ReactNode } from 'react';
import { Platform, type App } from 'obsidian';
import { attachDiceRolling, type RollChoice, type RollMenuOpener } from '../../../services/statblockDiceLinks';
import { rollHitPoints } from '../../../services/statblockHitPoints';
import type { DiceRollSource, StatblockBonuses } from '../../../services/statblockRolls';
import type { TokenVitals } from '../../../services/statblockVitalsSync';
import { AtlasUIContext } from '../../../react/root/AtlasUIContext';
import { useOptionalContextMenu, type ContextMenuController, type ContextMenuEntry } from '../../../react/root/ContextMenuContext';
import { t } from '../../../i18n';
import { RollMenuHost } from './RollMenuHost';
import type { TokenRollContext } from '../../../types/diceRollOrigin';
import { OffMapRollsContext } from './offMapRolls';

export interface StatblockDiceRolling {
  app: App | undefined;
  /** The statblock note: rolls are tagged with it, and its tokens take rolled hit points. */
  notePath: string | undefined;
  /** The tokens the statblock is shown for; read when a roll is made, the first one names it. */
  tokens: readonly TokenVitals[];
  /** Names a roll made while no token is given. */
  name: string | undefined;
  /** The map view that owns the statblock, where it renders outside one; else the view it renders in. */
  viewId?: string | undefined;
  /** The view, scene and tokens the statblock was opened for; rolls for them name it. */
  originContext?: TokenRollContext | undefined;
  /** The statblock whose armed values its rolls take, and what the card shows of them; rolled hit points take none. */
  bonuses?: StatblockBonuses | undefined;
}

/** A ref callback for the statblock's container; what it returns detaches the listeners. */
export type StatblockDiceRef = (el: HTMLElement | null) => (() => void) | undefined;

/** The container's ref, and the menu host to render beside it where no surface has a context menu (else null). */
export type StatblockDiceRolls = [ref: StatblockDiceRef, rollMenu: ReactNode];

/** The keys a menu row names for its roll. */
function keyHint(choice: RollChoice): string | undefined {
  if (choice.side === 'advantage') return t('dice.shiftClick');
  if (choice.side === 'disadvantage') return Platform.isMacOS ? t('dice.optionClick') : t('dice.altClick');
  return undefined;
}

const SIDE_ICONS = { advantage: 'chevrons-up', disadvantage: 'chevrons-down' } as const;

function menuEntries(choices: readonly RollChoice[]): ContextMenuEntry[] {
  return choices.map((choice): ContextMenuEntry => {
    const hint = keyHint(choice);
    return { type: 'item', label: choice.label, icon: choice.side ? SIDE_ICONS[choice.side] : 'dices', onClick: choice.roll, ...(hint && { detail: hint }) };
  });
}

function rollSource({ notePath, tokens, name, viewId, originContext, bonuses }: StatblockDiceRolling): DiceRollSource {
  const [token] = tokens;
  return {
    viewId,
    originContext,
    bonuses,
    tokenId: token?.id,
    statblockPath: notePath,
    tokenName: token?.name ?? name,
    tokenImagePath: token?.imagePath,
  };
}

/**
 * Click-to-roll for a statblock: a ref for its container, which then rolls the
 * dice links inside it through the open map's dice tool, or shows them where
 * `OffMapRollsContext` says when no map on screen does. Dice on the hit point
 * line put rolled hit points on the tokens. Only listens, so it is safe on DOM
 * React owns; the options are read at the moment of a roll. A right-click on a
 * roll opens its menu in the surface's context menu, else in the menu host
 * returned beside the ref, which the statblock renders.
 */
export function useStatblockDiceRolling(rolling: StatblockDiceRolling): StatblockDiceRolls {
  const offMap = useContext(OffMapRollsContext);
  const surfaceMenu = useOptionalContextMenu();
  const ownMenu = useRef<ContextMenuController | null>(null);
  const menu = useRef(surfaceMenu);
  const ownView = useContext(AtlasUIContext)?.view?.viewId;
  const options = { ...rolling, viewId: rolling.viewId ?? ownView };
  const latest = useRef({ options, offMap });
  useLayoutEffect(() => {
    latest.current = { options, offMap };
    menu.current = surfaceMenu;
  });

  const { app } = options;
  const ref = useCallback((el: HTMLElement | null): (() => void) | undefined => {
    if (!el || !app) return undefined;
    const openMenu: RollMenuOpener = (choices, at, link) => {
      (menu.current ?? ownMenu.current)?.open(menuEntries(choices), at, { returnFocus: link });
    };
    return attachDiceRolling(
      el,
      app,
      () => rollSource(latest.current.options),
      (formula, abilityName) => {
        const { options: { notePath, tokens, viewId, originContext }, offMap: shownOn } = latest.current;
        rollHitPoints(app, formula, notePath ?? '', tokens, abilityName, viewId, originContext, shownOn);
      },
      () => latest.current.offMap,
      openMenu,
    );
  }, [app]);
  return [ref, surfaceMenu ? null : createElement(RollMenuHost, { controller: ownMenu })];
}
