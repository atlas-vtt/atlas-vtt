/**
 * The report of the Tablet diagnostics command: what only a device can tell about itself, as text a
 * tester pastes into an issue. It is English throughout, like every report, and holds nothing of
 * the vault: no path, no file name, no note.
 */

/** One line of a section: what was asked, and the answer. */
export type ReportRow = readonly [label: string, value: string];

export interface ReportSection {
  title: string;
  rows: readonly ReportRow[];
}

/** The titles of the report's sections, in their order. */
export const REPORT_SECTIONS = [
  'Versions', 'Platform', 'Resource URLs', 'Pointer', 'Viewport', 'Keyboard', 'Images', 'Canvas', 'WebGL 2',
  'Storage', 'Web APIs', 'Audio', 'Memory', 'Lighting',
] as const;
export type ReportSectionTitle = (typeof REPORT_SECTIONS)[number];

export const section = (title: ReportSectionTitle, rows: readonly ReportRow[]): ReportSection => ({ title, rows });

export const yesNo = (value: boolean): string => (value ? 'yes' : 'no');

/** Bytes as whole mebibytes. */
export const mebibytes = (bytes: number): string => `${Math.round(bytes / 1024 ** 2)} MiB`;

/** `width × height`, rounded to whole pixels. */
export const pixels = (width: number, height: number): string => `${Math.round(width)} × ${Math.round(height)}`;

/** The report as Markdown: a heading and a list per section. */
export function formatReport(sections: readonly ReportSection[]): string {
  return sections
    .map(({ title, rows }) => [`### ${title}`, ...rows.map(([label, value]) => `- ${label}: ${value}`)].join('\n'))
    .join('\n\n');
}

/** `sections` with the section of `next`'s title replaced by it, or `next` added at the end. */
export function withSection(sections: readonly ReportSection[], next: ReportSection): ReportSection[] {
  return sections.some(({ title }) => title === next.title)
    ? sections.map((current) => (current.title === next.title ? next : current))
    : [...sections, next];
}
