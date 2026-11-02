import React from 'react';
import { noteName } from '../../../utils/pathUtils';
import { BY_PATH } from '../../fs/fsLayoutNotes';
import { statblockCount, type LayoutStatblocks } from '../../fs/fsLayoutStatblocks';
import type { FsImportReport } from '../../fs/fsLayoutTypes';
import { BatchProgress, Disclosure, LeftNoteRows, NoteRow } from '../batchParts';
import {
  detailSentences, detailsLine, detailsToggleLabel, fsOnlyLine, leftoversLabel, moveExplanation, movedLine, placeLabel, readyLine,
} from './importReportText';
import type { StatblockMoveResult } from './statblockMove';
import type { AdoptionPhase } from './useLayoutAdoption';
import { t } from '../../../i18n';

/** What Atlas can do now, and what of the look it shows only through Fantasy Statblocks or not in full, each part folded away. */
export function ImportSummary({ layoutName, fsOnlyParts, report }: {
  layoutName: string;
  fsOnlyParts: number;
  report: FsImportReport | null;
}): React.JSX.Element {
  const lines = [readyLine(layoutName), fsOnlyLine(fsOnlyParts), detailsLine(report)].filter((line) => line !== null);
  const details = detailSentences(report);
  return (
    <div className="atlas-fs-import__section">
      <p className="atlas-te-dialog__text atlas-fs-import__lead">{lines.join(' ')}</p>
      {details.length > 0 && (
        <Disclosure label={detailsToggleLabel(details.length)}>
          {details.map((sentence, index) => <li key={index}>{sentence}</li>)}
        </Disclosure>
      )}
    </div>
  );
}

/** The statblocks a batch left as they were: those it could not move, with why, and those Cancel kept it from. */
function Leftovers({ result }: { result: StatblockMoveResult }): React.JSX.Element | null {
  const left = result.skipped.length + result.notReached.length;
  if (left === 0) return null;
  return (
    <Disclosure label={leftoversLabel(left)}>
      <LeftNoteRows skipped={result.skipped} notReached={result.notReached} nameOf={noteName} />
    </Disclosure>
  );
}

/** The statblocks by path; those written into a note's text say so, since moving changes that text. */
function StatblockRows({ statblocks }: { statblocks: LayoutStatblocks }): React.JSX.Element {
  const rows = (['frontmatter', 'fences'] as const)
    .flatMap((kind) => statblocks[kind].map((path) => ({ path, kind })))
    .sort((a, b) => BY_PATH.compare(a.path, b.path));
  return <>{rows.map(({ path, kind }) => <NoteRow key={`${kind}:${path}`} name={noteName(path)} detail={placeLabel(kind)} />)}</>;
}

/** The batch that moves the statblocks (§6.4): what moving does and the statblocks folded away, then its progress, then what it did. */
export function AdoptionSection({ statblocks, phase }: { statblocks: LayoutStatblocks; phase: AdoptionPhase }): React.JSX.Element {
  const total = statblockCount(statblocks);
  return (
    <div className="atlas-fs-import__section">
      {phase.kind === 'ready' && (
        <>
          <p className="atlas-te-dialog__text">{moveExplanation(statblocks)}</p>
          <Disclosure label={t('statblockEditor.fs.showStatblocks', { count: total })}>
            <StatblockRows statblocks={statblocks} />
          </Disclosure>
        </>
      )}
      {phase.kind === 'running' && (
        <BatchProgress done={phase.done} total={phase.total} label={t('statblockEditor.fs.moving')} text={t('statblockEditor.fs.movingProgress', { done: phase.done, total: phase.total })} />
      )}
      {phase.kind === 'finished' && phase.result && (
        <>
          <p className="atlas-te-dialog__text" role="status">{movedLine(phase.result.moved.length, total)}</p>
          <Leftovers result={phase.result} />
        </>
      )}
      {phase.kind === 'finished' && !phase.result && <p className="atlas-te-setting__problem" role="status">{phase.problem}</p>}
    </div>
  );
}
