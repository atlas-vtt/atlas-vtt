import React, { useState } from 'react';
import { Button } from '../../../packages/components/primitives/button';
import { t } from '../../../i18n';
import type { CheckFinding } from '../../upload/uploadContract';
import { findingSections, sectionLabel, showAllLabel, showFewerLabel, shownGroups, timesLabel, type FindingSection } from '../../upload/text/findingGroups';

/** One group of findings: its first few, the rest behind Show all, each with its file, line, place and sentence. */
function FindingGroupList({ section }: { section: FindingSection }): React.JSX.Element | null {
  const [all, setAll] = useState(false);
  if (section.total === 0) return null;
  const more = showAllLabel(section);
  return (
    <div className="atlas-share-findings" data-level={section.level}>
      <span className="atlas-share-findings__label">{sectionLabel(section)}</span>
      <ul className="atlas-share-findings__list">
        {shownGroups(section, all).map((group, index) => {
          const where = [group.finding.path, group.line === null ? null : t('armariumShare.line', { line: group.line }), group.place].filter((part): part is string => typeof part === 'string' && part !== '');
          const times = timesLabel(group.count);
          return (
            <li key={index} className="atlas-share-finding">
              {where.length > 0 && <span className="atlas-share-finding__where">{where.join(' · ')}</span>}
              <span className="atlas-share-finding__message">{group.message}</span>
              {times !== null && <span className="atlas-share-finding__times">{times}</span>}
            </li>
          );
        })}
      </ul>
      {more !== null && (
        <Button variant="ghost" size="sm" className="atlas-share-findings__more" onClick={() => setAll((shown) => !shown)}>
          {all ? showFewerLabel() : more}
        </Button>
      )}
    </div>
  );
}

/** A check's findings: what refused the bundle first and apart, then the notes, which ask for nothing. */
export function FindingReport({ findings, notesOnly = false }: { findings: readonly CheckFinding[]; notesOnly?: boolean }): React.JSX.Element {
  const { problems, notes } = findingSections(findings);
  return (
    <div className="atlas-share-report">
      {!notesOnly && <FindingGroupList section={problems} />}
      <FindingGroupList section={notes} />
    </div>
  );
}
