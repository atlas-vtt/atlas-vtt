import { useEffect, useRef, useState } from 'react';
import { resultsMessage, selectionMessage, type GridResults } from '../utils/gridAnnouncement';

/** How long the results must stand before they are read, so typing a search does not chatter. */
export const RESULTS_SETTLE_MS = 500;

/**
 * The text of the grid's polite live region: the last of the two things it reports. A change of the selection is
 * read at once; a search or filter that narrows the list is read once its results have stood `RESULTS_SETTLE_MS`.
 * `results` is null while the grid's assets belong to another place (loading, failed): nothing is said for them.
 * What the grid shows as it mounts is not read; the list it opens on is what the GM left.
 */
export function useGridAnnouncement(selectionCount: number, results: GridResults | null): string {
  const [text, setText] = useState('');

  const announcedSelection = useRef(selectionCount);
  useEffect(() => {
    if (announcedSelection.current === selectionCount) return;
    announcedSelection.current = selectionCount;
    setText(selectionMessage(selectionCount));
  }, [selectionCount]);

  const resultsText = results ? resultsMessage(results) : null;
  const announcedResults = useRef(resultsText ?? '');
  useEffect(() => {
    if (resultsText === null || resultsText === announcedResults.current) return undefined;
    const timer = window.setTimeout(() => {
      announcedResults.current = resultsText;
      setText(resultsText);
    }, RESULTS_SETTLE_MS);
    return (): void => window.clearTimeout(timer);
  }, [resultsText]);

  return text;
}
