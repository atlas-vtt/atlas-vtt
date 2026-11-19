import { t } from '../../../i18n';
import type { CheckFinding } from '../uploadContract';
import { findingLine, findingMessage } from './findingMessages';

/**
 * A check's findings as Atlas lays them out, ported from the Armarium's share page. What refused the bundle stands
 * first and apart from the notes about it; each group shows its first few entries and keeps the rest behind Show
 * all, so a report of hundreds of notes never buries the one reason for a refusal.
 */

type Level = CheckFinding['level'];

/** Findings whose detail is a name of the bundle: the cover it names, its folder, a picture's path, the file a path collides with. */
const NAMED: ReadonlySet<string> = new Set(['manifest-cover', 'manifest-folder', 'manifest-statblock-image', 'path-collision']);

const STEP = ' › ';

/** How many entries a group shows before Show all: enough problems to act on, and a first look at the notes. */
export const FIRST_SHOWN: Readonly<Record<Level, number>> = { error: 5, warning: 3 };

/** A JSON pointer (RFC 6901) as the steps to a field: `/state/grid/size` is `state › grid › size`. */
function steps(pointer: string): string {
  return pointer
    .split('/')
    .slice(1)
    .map((token) => token.replace(/~1/g, '/').replace(/~0/g, '~'))
    .join(STEP);
}

/**
 * The place a finding is about beyond its file and line: the field of a data file or a loot base, or a name of the
 * bundle. Null where the detail names none, or only what the sentence says already (a file type, a limit).
 */
export function findingPlace(finding: CheckFinding): string | null {
  const detail = finding.detail?.trim() ?? '';
  if (detail === '') return null;
  if (NAMED.has(finding.code)) return detail;
  if (!detail.startsWith('/')) return null;
  const end = detail.indexOf(': ');
  return steps(end === -1 ? detail : detail.slice(0, end));
}

/** A finding as a list shows it, and how many findings of the check it stands for. */
export interface FindingGroup {
  finding: CheckFinding;
  message: string;
  line: number | null;
  place: string | null;
  count: number;
}

/** The findings in their order, each once: findings with the same file, line, place and sentence are one, with their number. */
export function groupedFindings(findings: readonly CheckFinding[]): FindingGroup[] {
  const groups = new Map<string, FindingGroup>();
  for (const finding of findings) {
    const group = { finding, message: findingMessage(finding), line: findingLine(finding), place: findingPlace(finding), count: 1 };
    const key = JSON.stringify([finding.level, finding.code, finding.path ?? null, group.line, group.place, group.message]);
    const known = groups.get(key);
    if (known === undefined) groups.set(key, group);
    else known.count += 1;
  }
  return [...groups.values()];
}

export interface FindingSection {
  level: Level;
  /** The findings of this level that the report lists, each once. */
  groups: FindingGroup[];
  /** How many findings of this level the report lists. */
  listed: number;
  /** How many the check made: more than `listed` where the report kept only its first findings. */
  total: number;
}

export interface FindingSections {
  problems: FindingSection;
  notes: FindingSection;
}

/**
 * How many findings beyond the listed ones the report's counts name, as problems and as notes. The counts are by
 * code, and a report lists every problem before any note: what is not listed is a problem only where its code is
 * listed as nothing but problems.
 */
function beyondListed(findings: readonly CheckFinding[], counts: Readonly<Record<string, number>>): Record<Level, number> {
  const beyond = { error: 0, warning: 0 };
  for (const [code, made] of Object.entries(counts)) {
    const listed = findings.filter((finding) => finding.code === code);
    const onlyProblems = listed.length > 0 && listed.every((finding) => finding.level === 'error');
    beyond[onlyProblems ? 'error' : 'warning'] += Math.max(0, made - listed.length);
  }
  return beyond;
}

/** The findings as two groups. `counts` are the report's own counts by code, where Atlas was given them. */
export function findingSections(findings: readonly CheckFinding[], counts: Readonly<Record<string, number>> = {}): FindingSections {
  const beyond = beyondListed(findings, counts);
  const section = (level: Level): FindingSection => {
    const listed = findings.filter((finding) => finding.level === level);
    return { level, groups: groupedFindings(listed), listed: listed.length, total: listed.length + beyond[level] };
  };
  return { problems: section('error'), notes: section('warning') };
}

/** What a group is called above its entries: its number, and that these are the first of more where the report kept only some. */
export function sectionLabel({ level, listed, total }: FindingSection): string {
  if (total > listed) return t(level === 'error' ? 'armariumFindings.firstProblems' : 'armariumFindings.firstNotes', { count: total, listed });
  return t(level === 'error' ? 'armariumFindings.problems' : 'armariumFindings.notes', { count: total });
}

/** The check in a few words for a heading: "1 problem, 146 notes". Null for a check that found nothing. */
export function totalsLabel({ problems, notes }: FindingSections): string | null {
  const problemsText = problems.total > 0 ? t('armariumFindings.totalProblems', { count: problems.total }) : null;
  const notesText = notes.total > 0 ? t('armariumFindings.totalNotes', { count: notes.total }) : null;
  if (problemsText !== null && notesText !== null) return t('armariumFindings.totals', { problems: problemsText, notes: notesText });
  return problemsText ?? notesText;
}

/** The entries a group shows: its first few, or every one once Show all was pressed. */
export function shownGroups({ level, groups }: FindingSection, all: boolean): FindingGroup[] {
  return all ? groups : groups.slice(0, FIRST_SHOWN[level]);
}

/** The button that shows the rest of a group, with the number of findings it then lists. Null where the first few are all. */
export function showAllLabel({ level, groups, listed }: FindingSection): string | null {
  return groups.length > FIRST_SHOWN[level] ? t('armariumFindings.showAll', { count: listed }) : null;
}

/** The button that folds a group back to its first few entries. */
export function showFewerLabel(): string {
  return t('armariumFindings.showFewer');
}

/** How often a finding that is shown once was found; null for one that was found once. */
export function timesLabel(count: number): string | null {
  return count > 1 ? t('armariumFindings.times', { count }) : null;
}
