import { MAX_REPORT_MESSAGE, MAX_STACK_LINE, MAX_STACK_LINES, redact, withoutTableCodes } from './redact.ts';
import { isRecord } from './shape.ts';

/**
 * Error reports and feedback, sent over HTTP to the relay (`POST /api/reports`, `POST /api/feedback`).
 * Pseudonymous by construction: no names, no keys, no game content; the table is named only by its
 * tag, a hash of its code.
 */

export const REPORTS_PATH = '/api/reports';
export const FEEDBACK_PATH = '/api/feedback';

/** Who sends: the player's browser or the GM's companion plugin. */
export type DiagnosticSource = 'play' | 'companion';
const SOURCES: readonly DiagnosticSource[] = ['play', 'companion'];

/** The largest body either endpoint reads, in bytes. */
export const MAX_DIAGNOSTIC_BODY = 8 * 1024;
/** The longest feedback text, in characters. */
export const MAX_FEEDBACK_TEXT = 2000;
/** Error ids a feedback's diagnostics may name. */
export const MAX_FEEDBACK_ERRORS = 10;

/** A table's tag: 48 bits of a hash of its code, which names the table in logs without opening it. */
export const TABLE_TAG_PATTERN = /^[0-9a-f]{12}$/;
/** An error's id: 40 bits of a hash of what it says and where it was thrown. */
export const ERROR_ID_PATTERN = /^[0-9a-f]{10}$/;
const BUILD_PATTERN = /^[\w.+/ -]{1,80}$/;
const BROWSER_PATTERN = /^[A-Za-z][A-Za-z ]{0,23}(?: [\d.]{1,16})?$/;
export const OS_FAMILIES = ['Windows', 'macOS', 'Linux', 'Android', 'iOS', 'ChromeOS', 'Other'] as const;
export type OsFamily = (typeof OS_FAMILIES)[number];

/** Where the report comes from: the build, and the browser and system by family only. */
export interface Environment {
  readonly build: string;
  readonly browser: string;
  readonly os: OsFamily;
}

export interface ErrorReport extends Environment {
  readonly v: 1;
  readonly source: DiagnosticSource;
  readonly kind: 'error' | 'rejection';
  readonly name: string;
  readonly message: string;
  readonly stack: readonly string[];
  readonly table: string | null;
}

/**
 * A socket as its page sees it: none, its handshake running, open with its hello unanswered, `heard`
 * (the relay answered a ping, the table not yet the hello), or answered.
 */
export const SOCKET_PHASES = ['none', 'connecting', 'open', 'heard', 'answered'] as const;
export type SocketPhase = (typeof SOCKET_PHASES)[number];
/**
 * How a try to reach the table ended without the table's answer: the socket could not be made, did
 * not open in time, opened and got no answer in time, or closed (`lastClose` has the code).
 */
export const ATTEMPT_ENDS = ['no-socket', 'no-open', 'no-answer', 'closed'] as const;
export type AttemptEnd = (typeof ATTEMPT_ENDS)[number];
/** What a plain request to the site said while the table was not reached: it answered, nothing did, or not known. */
export const SITE_REACHES = ['unknown', 'site', 'none'] as const;
export type SiteReach = (typeof SITE_REACHES)[number];
/** How a page reaches its table: over a WebSocket, or over the stream lane where none opens (`stream.ts`). */
export const LANES = ['socket', 'stream'] as const;
export type Lane = (typeof LANES)[number];

/** How a page's tries to reach its table go, which tells a hanging socket from one never tried again. */
export interface AttemptStats {
  readonly socket: SocketPhase;
  /** Tries since the table last answered, and how long ago the first of them began. */
  readonly tries: number;
  readonly sinceFirstMs: number | null;
  readonly lastEnd: AttemptEnd | null;
  /** What the browser says of the page; it is wrong about both at times. */
  readonly offline: boolean;
  readonly hidden: boolean;
  /** Left out by a page from before it asked. */
  readonly site?: SiteReach;
  /** The lane of the try under way or last made; left out by a page from before there were two. */
  readonly lane?: Lane;
}

/** How the sender's connection went, for feedback with diagnostics. */
export interface ConnectionStats {
  readonly status: string;
  readonly reconnects: number;
  readonly lastClose: number | null;
  readonly latencyMs: number | null;
  readonly players: number | null;
  /** The player's page only. */
  readonly attempt?: AttemptStats;
}

export interface FeedbackDiagnostics extends Environment {
  readonly table: string | null;
  readonly errors: readonly string[];
  readonly connection: ConnectionStats | null;
}

export interface FeedbackPost {
  readonly v: 1;
  readonly source: DiagnosticSource;
  readonly text: string;
  readonly diagnostics: FeedbackDiagnostics | null;
}

/** Web Crypto and the text encoder are globals of every host of this code: browser, Worker, Obsidian and Node. */
async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** The tag of a table code: the same in the client, the companion and the relay's logs. */
export async function tableTag(code: string): Promise<string> {
  return (await sha256Hex(`atlas-online-table:${code}`)).slice(0, 12);
}

/** An error's id: the same for the same error at the same place, whatever its numbers. */
export async function errorId(report: Pick<ErrorReport, 'source' | 'name' | 'message' | 'stack'>): Promise<string> {
  const message = report.message.replace(/\d+/g, '#');
  return (await sha256Hex(`${report.source}|${report.name}|${message}|${report.stack[0] ?? ''}`)).slice(0, 10);
}

/** The browser by name and major version, and the system by family, from a user agent; nothing finer. */
export function environmentOf(userAgent: string): { readonly browser: string; readonly os: OsFamily } {
  const major = (pattern: RegExp): string => pattern.exec(userAgent)?.[1] ?? '';
  const named = (name: string, version: string): string => (version === '' ? name : `${name} ${version}`);
  const browser = /obsidian\//i.test(userAgent) ? named('Obsidian', major(/obsidian\/(\d+(?:\.\d+){0,2})/i))
    : /Edg\//.test(userAgent) ? named('Edge', major(/Edg\/(\d+)/))
      : /Firefox\//.test(userAgent) ? named('Firefox', major(/Firefox\/(\d+)/))
        : /(?:Chrome|CriOS)\//.test(userAgent) ? named('Chrome', major(/(?:Chrome|CriOS)\/(\d+)/))
          : /Safari\//.test(userAgent) ? named('Safari', major(/Version\/(\d+)/))
            : 'Other';
  const os: OsFamily = /iPhone|iPad|iPod/.test(userAgent) ? 'iOS'
    : /Android/.test(userAgent) ? 'Android'
      : /CrOS/.test(userAgent) ? 'ChromeOS'
        : /Windows/.test(userAgent) ? 'Windows'
          : /Mac OS X|Macintosh/.test(userAgent) ? 'macOS'
            : /Linux/.test(userAgent) ? 'Linux'
              : 'Other';
  return { browser, os };
}

const text = (value: unknown, max: number): string | null => (typeof value === 'string' && value.length <= max * 2 ? value : null);
const matching = (value: unknown, pattern: RegExp): string | null => (typeof value === 'string' && pattern.test(value) ? value : null);
const count = (value: unknown): number | null => (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 1e9 ? value : null);
const source = (value: unknown): DiagnosticSource | null => (SOURCES.includes(value as DiagnosticSource) ? (value as DiagnosticSource) : null);
const os = (value: unknown): OsFamily | null => (OS_FAMILIES.includes(value as OsFamily) ? (value as OsFamily) : null);
const tag = (value: unknown): string | null | undefined => (value === null ? null : (matching(value, TABLE_TAG_PATTERN) ?? undefined));

function environment(value: Record<string, unknown>): Environment | null {
  const build = matching(value.build, BUILD_PATTERN);
  const browser = matching(value.browser, BROWSER_PATTERN);
  const family = os(value.os);
  return build === null || browser === null || family === null ? null : { build, browser, os: family };
}

/**
 * An error report read from a request body, or null for anything malformed. Message and stack are
 * redacted again here, whatever the sender did.
 */
export function parseErrorReport(value: unknown): ErrorReport | null {
  if (!isRecord(value) || value.v !== 1) return null;
  const from = source(value.source);
  const env = environment(value);
  const name = matching(value.name, /^[\w$.]{1,60}$/);
  const message = text(value.message, MAX_REPORT_MESSAGE);
  const table = tag(value.table);
  const kind = value.kind === 'error' || value.kind === 'rejection' ? value.kind : null;
  const stack = Array.isArray(value.stack) && value.stack.length <= MAX_STACK_LINES && value.stack.every((line) => text(line, MAX_STACK_LINE) !== null) ? (value.stack as string[]) : null;
  if (from === null || env === null || name === null || message === null || table === undefined || kind === null || stack === null) return null;
  return {
    v: 1, source: from, kind, ...env, name, table,
    message: redact(message).slice(0, MAX_REPORT_MESSAGE),
    stack: stack.map((line) => redact(line).slice(0, MAX_STACK_LINE)),
  };
}

function attemptStats(value: unknown): AttemptStats | undefined {
  if (!isRecord(value)) return undefined;
  const socket = SOCKET_PHASES.find((phase) => phase === value.socket);
  const tries = count(value.tries);
  const sinceFirstMs = value.sinceFirstMs === null ? null : count(value.sinceFirstMs);
  const lastEnd = value.lastEnd === null ? null : ATTEMPT_ENDS.find((end) => end === value.lastEnd);
  if (socket === undefined || tries === null || (value.sinceFirstMs !== null && sinceFirstMs === null) || lastEnd === undefined) return undefined;
  const site = value.site === undefined ? null : SITE_REACHES.find((reach) => reach === value.site);
  const lane = value.lane === undefined ? null : LANES.find((known) => known === value.lane);
  if (typeof value.offline !== 'boolean' || typeof value.hidden !== 'boolean' || site === undefined || lane === undefined) return undefined;
  return { socket, tries, sinceFirstMs, lastEnd, offline: value.offline, hidden: value.hidden, ...(site === null ? {} : { site }), ...(lane === null ? {} : { lane }) };
}

function connectionStats(value: unknown): ConnectionStats | null | undefined {
  if (value === null) return null;
  if (!isRecord(value)) return undefined;
  const status = matching(value.status, /^[a-z-]{1,20}$/);
  const reconnects = count(value.reconnects);
  const lastClose = value.lastClose === null ? null : count(value.lastClose);
  const latencyMs = value.latencyMs === null ? null : count(value.latencyMs);
  const players = value.players === null ? null : count(value.players);
  const attempt = value.attempt === undefined ? null : attemptStats(value.attempt);
  if (status === null || reconnects === null || (value.lastClose !== null && lastClose === null) || (value.latencyMs !== null && latencyMs === null) || (value.players !== null && players === null)) return undefined;
  if (attempt === undefined) return undefined;
  return { status, reconnects, lastClose, latencyMs, players, ...(attempt === null ? {} : { attempt }) };
}

function feedbackDiagnostics(value: unknown): FeedbackDiagnostics | null | undefined {
  if (value === null) return null;
  if (!isRecord(value)) return undefined;
  const env = environment(value);
  const table = tag(value.table);
  const errors = Array.isArray(value.errors) && value.errors.length <= MAX_FEEDBACK_ERRORS && value.errors.every((id) => matching(id, ERROR_ID_PATTERN) !== null) ? (value.errors as string[]) : null;
  const connection = connectionStats(value.connection);
  if (env === null || table === undefined || errors === null || connection === undefined) return undefined;
  return { ...env, table, errors, connection };
}

/** Feedback read from a request body, or null for anything malformed or empty; a pasted join link loses its code. */
export function parseFeedback(value: unknown): FeedbackPost | null {
  if (!isRecord(value) || value.v !== 1) return null;
  const from = source(value.source);
  const body = typeof value.text === 'string' ? value.text.trim() : '';
  const diagnostics = feedbackDiagnostics(value.diagnostics);
  if (from === null || body === '' || [...body].length > MAX_FEEDBACK_TEXT || diagnostics === undefined) return null;
  return { v: 1, source: from, text: withoutTableCodes(body), diagnostics };
}

/** Days the relay keeps feedback; the forms say so. */
export const FEEDBACK_KEPT_DAYS = 180;
/** Days the relay keeps an error group after its last report. */
export const ERROR_REPORTS_KEPT_DAYS = 30;

/** What a feedback form tells its sender is sent, in plain words. */
export function feedbackNote(withDiagnostics: boolean): string {
  const what = withDiagnostics
    ? 'your message and diagnostics (app version, browser or Obsidian version, system, recent error codes, connection quality)'
    : 'only your message';
  return `Sends ${what} to the Atlas team. No names and nothing from your game. Kept for ${FEEDBACK_KEPT_DAYS} days.`;
}

/** How sending feedback went: sent, refused for now (a rate or the hour's cap), or not sent. */
export type FeedbackResult = 'sent' | 'busy' | 'failed';

/** What a feedback form sends through. */
export interface FeedbackSender {
  send(text: string, withDiagnostics: boolean): Promise<FeedbackResult>;
}

/** The result of the relay's answer to feedback, by its HTTP status. */
export const feedbackResultOf = (status: number): FeedbackResult => (status >= 200 && status < 300 ? 'sent' : status === 429 || status === 503 ? 'busy' : 'failed');
