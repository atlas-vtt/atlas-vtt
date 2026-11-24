import { getLocale, t } from '../../../i18n';
import { formatByteSize } from '../../../utils/fileSize';
import { CHECKER_CODES, LISTING_FORMATS, RULE_CODES, UPLOAD_LIMITS, type CheckFinding, type FindingCode } from '../uploadContract';
import type { Say } from './uploadMessages';

/**
 * One sentence for every finding of a check, ported from the Armarium's share page. Atlas shows the file, the line
 * and the field beside it (`findingGroups.ts`), so a sentence says "this file" and names only what the finding's
 * detail adds. A refused check's findings are its statement of reasons; a warning of a check that passed asks for
 * nothing.
 */

const MAX_PICTURE_SIDE = 8192;
const KNOWN_CODES: ReadonlySet<string> = new Set([...RULE_CODES, ...CHECKER_CODES]);
const FORMAT_NAMES: Readonly<Record<string, string>> = { png: 'PNG', jpeg: 'JPEG', webp: 'WebP' };

/** A sentence that depends on the finding's detail, or null where the code's own sentence says it. */
type Variant = (detail: string, level: CheckFinding['level'], say: Say) => string | null;

/** What a finding in a note is about: the part of its detail after the line number (`3: dataviewjs`). */
function noted(detail: string): string | null {
  const what = detail.replace(/^\d+: /, '').trim();
  return what === '' ? null : what;
}

function converted(detail: string, _level: CheckFinding['level'], say: Say): string | null {
  const [real, named] = detail.split(' as ').map((format) => FORMAT_NAMES[format]);
  if (real === undefined || named === undefined) return null;
  return say('armariumFindings.detail.imageTypeConvertedNamed', { real, named });
}

function baseShape(detail: string, _level: CheckFinding['level'], say: Say): string | null {
  if (detail.endsWith(': picture')) return say('armariumFindings.detail.baseShapePicture');
  if (!detail.endsWith(': label')) return null;
  return detail.startsWith('/views') ? say('armariumFindings.detail.baseShapeViewName') : say('armariumFindings.detail.baseShapePropertyName');
}

function baseExpression(detail: string, _level: CheckFinding['level'], say: Say): string | null {
  if (detail.startsWith('/formulas')) return say('armariumFindings.detail.baseExpressionFormula');
  if (detail.startsWith('/summaries')) return say('armariumFindings.detail.baseExpressionSummary');
  return null;
}

/** The listing's own format, which the detail of `format-changed` names. */
function formatChanged(detail: string, _level: CheckFinding['level'], say: Say): string | null {
  const format = LISTING_FORMATS.find((known) => known === detail.trim());
  return format === undefined ? null : say(`armariumFindings.detail.formatChanged.${format}`);
}

const VARIANTS: Readonly<Partial<Record<FindingCode, Variant>>> = {
  'file-type': (extension, _level, say) => (extension === '' ? null : say('armariumFindings.detail.fileTypeNamed', { extension })),
  'note-raw-html': (detail, _level, say) => {
    const tag = noted(detail);
    return tag === null ? null : say('armariumFindings.detail.noteRawHtmlTag', { tag });
  },
  'note-runs-code': (detail, _level, say) => {
    const what = noted(detail);
    return what === null ? null : say('armariumFindings.detail.noteRunsCodeNamed', { what });
  },
  'note-unsafe-link': (detail, _level, say) => {
    const link = noted(detail);
    return link === null ? null : say('armariumFindings.detail.noteUnsafeLinkNamed', { link });
  },
  'note-code-language': (detail, _level, say) => {
    const language = noted(detail);
    return language === null ? null : say('armariumFindings.detail.noteCodeLanguageNamed', { language });
  },
  // An older Atlas may have left the field in a scene, and a fresh export keeps it: the note asks for nothing.
  'json-unknown-property': (_detail, level, say) => (level === 'warning' ? say('armariumFindings.detail.jsonUnknownPropertyKept') : null),
  'base-yaml-unsupported': (detail, _level, say) =>
    /carriage return|line break|control character|byte order mark/.test(detail) ? say('armariumFindings.detail.baseYamlCharacter') : null,
  'base-shape': baseShape,
  'base-expression': baseExpression,
  'image-type-converted': converted,
  'format-changed': formatChanged,
  'rebuild-too-large': (limit, _level, say) => (limit === 'contents' ? say('armariumFindings.detail.rebuildTooManyPaths') : null),
};

const isKnown = (code: string): code is FindingCode => KNOWN_CODES.has(code);

/**
 * What a finding says, in one or two sentences; a code of a newer API than Atlas knows gets a sentence that says so.
 * `say` words it for what is shared (`findingSaid`).
 */
export function findingMessage(finding: CheckFinding, say: Say = t): string {
  const { code } = finding;
  if (!isKnown(code)) return say('armariumFindings.unknown');
  const variant = VARIANTS[code]?.(finding.detail ?? '', finding.level, say);
  if (variant !== null && variant !== undefined) return variant;
  return say(`armariumFindings.code.${code}`, { size: formatByteSize(UPLOAD_LIMITS.maxBytes, getLocale()), pixels: MAX_PICTURE_SIDE });
}

/** The line of a note a finding is about, where its detail names one (`3: dataviewjs`). */
export function findingLine(finding: CheckFinding): number | null {
  const line = /^([1-9]\d*): /.exec(finding.detail ?? '')?.[1];
  return line === undefined ? null : Number(line);
}
