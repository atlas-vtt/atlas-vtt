/**
 * The frontmatter Atlas itself wrote into notes, so a view can tell its own write coming back
 * (in the editor it wrote to, in other leaves on the note, from disk) from someone else's.
 */

import { frontmatterBounds } from './frontmatterBounds';

/** How long a write's echoes may take: the editor saves after about 2 s, and the metadata cache follows. */
export const ECHO_WINDOW_MS = 5000;
/** Writes remembered per note; quick commits produce several echoes in flight. */
const MAX_REMEMBERED = 16;

interface Written {
  yaml: string;
  at: number;
}

/** A note's frontmatter YAML (between its `---` lines) with `\n` line breaks; empty without one. */
export function noteYaml(noteText: string): string {
  const bounds = frontmatterBounds(noteText);
  return bounds.exists ? noteText.slice(bounds.from, bounds.to).replace(/\r\n/g, '\n') : '';
}

/** `noteYaml` of a note text; a text that does not open with a `---` line is taken as the YAML itself. */
function yamlOf(text: string): string {
  return /^\uFEFF?---\r?\n/.test(text) ? noteYaml(text) : text.replace(/\r\n/g, '\n');
}

export class OwnEchoes {
  private readonly written = new Map<string, Written[]>();

  /** Notes the frontmatter of a note text Atlas just wrote. */
  remember(path: string, noteText: string): void {
    const now = Date.now();
    const kept = this.live(path, now);
    kept.push({ yaml: noteYaml(noteText), at: now });
    this.written.set(path, kept.slice(-MAX_REMEMBERED));
  }

  /** Whether the frontmatter (or the whole note text) is one Atlas wrote into the note a moment ago. */
  isOwn(path: string, text: string): boolean {
    const yaml = yamlOf(text);
    return this.live(path, Date.now()).some((written) => written.yaml === yaml);
  }

  /** The note was renamed: its writes count under its new path. */
  move(from: string, to: string): void {
    const written = this.written.get(from);
    if (!written) return;
    this.written.delete(from);
    this.written.set(to, written);
  }

  private live(path: string, now: number): Written[] {
    const kept = (this.written.get(path) ?? []).filter((written) => now - written.at <= ECHO_WINDOW_MS);
    if (kept.length === 0) this.written.delete(path);
    return kept;
  }
}
