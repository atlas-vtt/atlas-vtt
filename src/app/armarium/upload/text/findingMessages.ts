import { getLocale, t } from '../../../i18n';
import { formatByteSize } from '../../../utils/fileSize';
import { CHECKER_CODES, RULE_CODES, UPLOAD_LIMITS, type CheckFinding, type FindingCode } from '../uploadContract';

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
type Variant = (detail: string, level: CheckFinding['level']) => string | null;

/** What a finding in a note is about: the part of its detail after the line number (`3: dataviewjs`). */
function noted(detail: string): string | null {
  const what = detail.replace(/^\d+: /, '').trim();
  return what === '' ? null : what;
}

function converted(detail: string): string | null {
  const [real, named] = detail.split(' as ').map((format) => FORMAT_NAMES[format]);
  if (real === undefined || named === undefined) return null;
  return t('armariumFindings.detail.imageTypeConvertedNamed', { real, named });
}

function baseShape(detail: string): string | null {
  if (detail.endsWith(': picture')) return t('armariumFindings.detail.baseShapePicture');
  if (!detail.endsWith(': label')) return null;
  return detail.startsWith('/views') ? t('armariumFindings.detail.baseShapeViewName') : t('armariumFindings.detail.baseShapePropertyName');
}

function baseExpression(detail: string): string | null {
  if (detail.startsWith('/formulas')) return t('armariumFindings.detail.baseExpressionFormula');
  if (detail.startsWith('/summaries')) return t('armariumFindings.detail.baseExpressionSummary');
  return null;
}

const VARIANTS: Readonly<Partial<Record<FindingCode, Variant>>> = {
  'file-type': (extension) => (extension === '' ? null : t('armariumFindings.detail.fileTypeNamed', { extension })),
  'note-raw-html': (detail) => {
    const tag = noted(detail);
    return tag === null ? null : t('armariumFindings.detail.noteRawHtmlTag', { tag });
  },
  'note-runs-code': (detail) => {
    const what = noted(detail);
    return what === null ? null : t('armariumFindings.detail.noteRunsCodeNamed', { what });
  },
  'note-unsafe-link': (detail) => {
    const link = noted(detail);
    return link === null ? null : t('armariumFindings.detail.noteUnsafeLinkNamed', { link });
  },
  'note-code-language': (detail) => {
    const language = noted(detail);
    return language === null ? null : t('armariumFindings.detail.noteCodeLanguageNamed', { language });
  },
  // An older Atlas may have left the field in a scene, and a fresh export keeps it: the note asks for nothing.
  'json-unknown-property': (_detail, level) => (level === 'warning' ? t('armariumFindings.detail.jsonUnknownPropertyKept') : null),
  'base-yaml-unsupported': (detail) =>
    /carriage return|line break|control character|byte order mark/.test(detail) ? t('armariumFindings.detail.baseYamlCharacter') : null,
  'base-shape': baseShape,
  'base-expression': baseExpression,
  'image-type-converted': converted,
  'rebuild-too-large': (limit) => (limit === 'contents' ? t('armariumFindings.detail.rebuildTooManyPaths') : null),
};

const isKnown = (code: string): code is FindingCode => KNOWN_CODES.has(code);

/** What a finding says, in one or two sentences; a code of a newer API than Atlas knows gets a sentence that says so. */
export function findingMessage(finding: CheckFinding): string {
  const { code } = finding;
  if (!isKnown(code)) return t('armariumFindings.unknown');
  const variant = VARIANTS[code]?.(finding.detail ?? '', finding.level);
  if (variant !== null && variant !== undefined) return variant;
  return t(`armariumFindings.code.${code}`, { size: formatByteSize(UPLOAD_LIMITS.maxBytes, getLocale()), pixels: MAX_PICTURE_SIDE });
}

/** The line of a note a finding is about, where its detail names one (`3: dataviewjs`). */
export function findingLine(finding: CheckFinding): number | null {
  const line = /^([1-9]\d*): /.exec(finding.detail ?? '')?.[1];
  return line === undefined ? null : Number(line);
}
