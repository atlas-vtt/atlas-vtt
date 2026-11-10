import { createContext, useContext } from 'react';
import type { App } from 'obsidian';
import type { SheetState } from './sheetState';

export interface SheetContextValue {
  state: SheetState;
  /** Renders Markdown and resolves images; without it values show as plain text. */
  app: App | undefined;
  /** The statblock note, which links and images resolve from. */
  sourcePath: string | undefined;
}

export const SheetContext = createContext<SheetContextValue | null>(null);

/** The statblock a block is rendered for. Blocks render only inside `StatblockSheet`. */
export function useSheet(): SheetContextValue {
  const sheet = useContext(SheetContext);
  if (!sheet) throw new Error('A statblock block was rendered outside StatblockSheet.');
  return sheet;
}
