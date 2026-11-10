import { createContext, useContext } from 'react';

/** Where a value is written in the note's frontmatter: a key, then list positions and keys below it. */
export type StatblockEditPath = Array<string | number>;

export interface StatblockEditApi {
  /** Whether values in this statblock can be edited in place. */
  editable: boolean;
  /** Writes a value back to the note. `path` addresses the frontmatter key. */
  commit(path: StatblockEditPath, value: string): void;
}

const noop: StatblockEditApi = { editable: false, commit: () => undefined };

export const StatblockEditContext = createContext<StatblockEditApi>(noop);

export function useStatblockEdit(): StatblockEditApi {
  return useContext(StatblockEditContext);
}
