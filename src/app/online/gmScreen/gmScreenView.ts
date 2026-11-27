import { gmScreenUrl } from '../protocol/index.ts';
import type { Knock } from './gmScreenKnocks.ts';
import type { GmScreenRecord } from './gmScreenRecord.ts';

/** Where the GM screen stands: off, asking the relay for its room, or running (connecting or online). */
export type GmScreenStatus = 'stopped' | 'starting' | 'connecting' | 'online';

export interface GmScreenDeviceView {
  readonly id: string;
  readonly name: string;
  readonly connected: boolean;
  readonly lastSeen: number;
}

/** What panels show of the GM screen. */
export interface GmScreenView {
  readonly status: GmScreenStatus;
  /** The link devices open, while the room runs; null otherwise. */
  readonly link: string | null;
  readonly devices: readonly GmScreenDeviceView[];
  /** The device the GM is asked about now. */
  readonly knock: Knock | null;
  /** How many devices wait, that one included. */
  readonly waiting: number;
  /** Why the GM screen did not start or ended, until the next start. */
  readonly problem: string | null;
}

/** What the view is made from. */
export interface GmScreenFacts {
  readonly status: GmScreenStatus;
  readonly origin: string;
  readonly record: GmScreenRecord | null;
  readonly connected: ReadonlySet<string>;
  readonly knock: Knock | null;
  readonly waiting: number;
  readonly problem: string | null;
}

export function gmScreenView({ status, origin, record, connected, knock, waiting, problem }: GmScreenFacts): GmScreenView {
  const running = status === 'connecting' || status === 'online';
  return {
    status,
    link: running && record !== null ? gmScreenUrl(origin, record.link) : null,
    devices: (record?.devices ?? []).map(({ id, name, lastSeen }) => ({ id, name, lastSeen, connected: connected.has(id) })),
    knock,
    waiting,
    problem,
  };
}
