import { mebibytes, section, type ReportSection } from './reportModel';

const MIB = 1024 ** 2;

/** Bytes taken with each step of the memory test. */
export const MEMORY_STEP = 64 * MIB;
/** Where the test stops by itself: more than Atlas ever holds at once on a tablet. */
export const MEMORY_CAP = 1536 * MIB;
/** One byte is written to every page of a step, so the system has to give the memory for real. */
const PAGE = 4096;

/**
 * Where a memory test stands, kept on the device across a reload: a web view that takes too much
 * is ended without a word, so the last step it wrote down is all that is left of the test.
 * `ended`: `cap` it held `MEMORY_CAP`, `refused` an allocation failed, null it was still running.
 */
export interface MemoryRecord {
  reached: number;
  ended: 'cap' | 'refused' | null;
}

export interface MemoryTestDeps {
  /** Takes `bytes` of memory for real. Throws where the web view gives no more. */
  allocate: (bytes: number) => unknown;
  /** Writes down where the test stands, before the next step is taken. */
  record: (state: MemoryRecord) => void;
  /** Lets the page draw and the system look at what the web view holds. */
  pause: () => Promise<void>;
  step?: number;
  cap?: number;
}

/** Bytes of memory with every page written to. */
export function takeMemory(bytes: number): Uint8Array {
  const block = new Uint8Array(bytes);
  for (let at = 0; at < bytes; at += PAGE) block[at] = 1;
  return block;
}

/**
 * Takes memory in steps until a step fails or the cap is held, and gives all of it back. Each
 * step is written down before it is taken, so a test the system ended is read from its last note.
 */
export async function runMemoryTest({ allocate, record, pause, step = MEMORY_STEP, cap = MEMORY_CAP }: MemoryTestDeps): Promise<MemoryRecord> {
  const held: unknown[] = [];
  let reached = 0;
  let ended: MemoryRecord['ended'] = 'cap';
  try {
    while (reached + step <= cap) {
      record({ reached, ended: null });
      held.push(allocate(step));
      reached += step;
      await pause();
    }
  } catch {
    ended = 'refused';
  } finally {
    held.length = 0;
  }
  const result: MemoryRecord = { reached, ended };
  record(result);
  return result;
}

/** A record as it was stored, or null for anything else. */
export function readMemoryRecord(stored: unknown): MemoryRecord | null {
  if (typeof stored !== 'object' || stored === null) return null;
  const reached: unknown = Reflect.get(stored, 'reached');
  const ended: unknown = Reflect.get(stored, 'ended');
  if (typeof reached !== 'number' || !Number.isFinite(reached) || reached < 0) return null;
  return { reached, ended: ended === 'cap' || ended === 'refused' ? ended : null };
}

export function memorySection(record: MemoryRecord | null, running: boolean): ReportSection {
  if (record === null) return section('Memory', [['Memory test', 'not run']]);
  const held = mebibytes(record.reached);
  if (record.ended === 'cap') return section('Memory', [['Memory test', `held ${held}, the most it asks for`]]);
  if (record.ended === 'refused') return section('Memory', [['Memory test', `held ${held}; the next ${mebibytes(MEMORY_STEP)} were refused`]]);
  return section('Memory', [['Memory test', running ? `running, holds ${held}` : `held ${held}, then the app reloaded during the next ${mebibytes(MEMORY_STEP)}`]]);
}
