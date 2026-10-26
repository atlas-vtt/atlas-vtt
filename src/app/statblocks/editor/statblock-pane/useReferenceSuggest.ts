import { useEffect, useRef, type RefObject } from 'react';
import type { App } from 'obsidian';
import type { StatblockTemplate } from '../../model/templateTypes';
import type { FieldRecord } from '../../values/fieldValues';
import { referenceNames, type ReferenceName } from '../../values/referenceNames';
import { watchReferenceTyping } from '../markdown-typing/referenceTyping';

interface Statblock {
  readonly template: StatblockTemplate;
  readonly record: FieldRecord;
}

/**
 * `@` in any value of the pane under `root` offers the names this statblock's references read
 * (`referenceNames`), worked out when a list opens and kept while template and values stay the same.
 * Nothing is offered without a template.
 */
export function useReferenceSuggest(app: App, root: RefObject<HTMLElement | null>, template: StatblockTemplate | null, record: FieldRecord): void {
  const statblock = useRef<Statblock | null>(null);
  statblock.current = template ? { template, record } : null;
  const worked = useRef<{ readonly from: Statblock; readonly names: readonly ReferenceName[] } | null>(null);

  useEffect(() => {
    const host = root.current;
    if (!host) return undefined;
    const names = (): readonly ReferenceName[] => {
      const now = statblock.current;
      if (!now) return [];
      const held = worked.current;
      if (held && held.from.template === now.template && held.from.record === now.record) return held.names;
      const fresh = referenceNames(now.template, now.record);
      worked.current = { from: now, names: fresh };
      return fresh;
    };
    return watchReferenceTyping(app, host, names);
  }, [app, root]);
}
