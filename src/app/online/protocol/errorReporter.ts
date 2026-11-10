import { errorId, MAX_FEEDBACK_ERRORS, type DiagnosticSource, type Environment, type ErrorReport } from './diagnostics.ts';
import { reportMessage, reportStack } from './redact.ts';

/** Reports sent in any minute, and in all, by one page or companion load. */
export const REPORTS_PER_MINUTE = 5;
export const MAX_REPORTS = 30;

export interface ReporterPorts {
  readonly source: DiagnosticSource;
  readonly environment: () => Environment;
  /** The tag of the table in use, or null. */
  readonly table: () => Promise<string | null>;
  /** Exact texts never sent: the table code, keys, the names the sender knows. */
  readonly known: () => readonly string[];
  /** Sends a report; a failure is ignored. */
  readonly post: (report: ErrorReport) => Promise<void>;
  readonly now: () => number;
  /** Whether reports go out now (the user's choice); off, errors are only remembered. */
  readonly enabled: () => boolean;
}

/** What a thrown value says, whatever was thrown. */
function said(thrown: unknown): { readonly name: string; readonly message: string; readonly stack: string | undefined } {
  if (thrown instanceof Error) return { name: /^[\w$.]{1,60}$/.test(thrown.name) ? thrown.name : 'Error', message: thrown.message, stack: thrown.stack };
  return { name: 'NonError', message: typeof thrown === 'string' ? thrown : Object.prototype.toString.call(thrown), stack: undefined };
}

/**
 * Turns uncaught errors into reports: redacted and trimmed before they leave, each error (by its id)
 * sent once, at most `REPORTS_PER_MINUTE` a minute and `MAX_REPORTS` in all, and only while `enabled`.
 * Keeps the ids of recent errors, sent or not, for feedback's diagnostics.
 */
export class ErrorReporter {
  private readonly ports: ReporterPorts;
  private readonly sent = new Set<string>();
  private readonly recent: string[] = [];
  private times: number[] = [];

  constructor(ports: ReporterPorts) {
    this.ports = ports;
  }

  /** Reports a thrown value; its id, or null when it could not be read. Never throws. */
  async capture(kind: ErrorReport['kind'], thrown: unknown): Promise<string | null> {
    try {
      const known = this.ports.known();
      const { name, message, stack } = said(thrown);
      const report: ErrorReport = {
        v: 1, source: this.ports.source, kind, name, ...this.ports.environment(),
        message: reportMessage(message, known), stack: reportStack(stack, known), table: await this.ports.table(),
      };
      const id = await errorId(report);
      this.remember(id);
      if (!this.ports.enabled() || this.sent.has(id) || !this.mayPost()) return id;
      this.sent.add(id);
      await this.ports.post(report).catch(() => undefined);
      return id;
    } catch {
      return null;
    }
  }

  /** The ids of the latest errors, newest last. */
  recentIds(): string[] {
    return [...this.recent];
  }

  private remember(id: string): void {
    const at = this.recent.indexOf(id);
    if (at >= 0) this.recent.splice(at, 1);
    this.recent.push(id);
    if (this.recent.length > MAX_FEEDBACK_ERRORS) this.recent.shift();
  }

  private mayPost(): boolean {
    const now = this.ports.now();
    this.times = this.times.filter((at) => now - at < 60_000);
    if (this.times.length >= REPORTS_PER_MINUTE || this.sent.size >= MAX_REPORTS) return false;
    this.times.push(now);
    return true;
  }
}
