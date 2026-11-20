import { useEffect, useState } from 'react';
import { canonicalJson } from '../../../utils/hashing';

/**
 * Whether a settings dialog's draft differs from the one it opened with. `draft` is everything the
 * GM edits there, read by content (its functions are left out); `loadKey` names what the dialog's
 * effect loads the draft from, null while it loads nothing (a closed dialog).
 */
export function useUnsavedChanges(draft: unknown, loadKey: string | null): boolean {
  const content = canonicalJson(draft);
  // Counted in an effect of the render the draft is loaded in, so this count and the loaded draft
  // are rendered together: what the draft holds on the first render of a count is what was opened.
  const [loads, setLoads] = useState(0);
  useEffect(() => {
    if (loadKey !== null) setLoads((count) => count + 1);
  }, [loadKey]);

  const [opened, setOpened] = useState<{ load: number; content: string } | null>(null);
  if (loads > 0 && opened?.load !== loads) setOpened({ load: loads, content });

  return loadKey !== null && opened?.load === loads && opened.content !== content;
}
