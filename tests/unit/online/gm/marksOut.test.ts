import { describe, expect, it } from 'vitest';
import type { GmMessage, MarksMessage } from '../../../../src/app/online/protocol/index.ts';
import { CURSOR_KEEPALIVE_MS } from '../../../../src/app/online/protocol/index.ts';
import { MarksOut } from '../../../../src/app/online/gm/marksOut.ts';

const ANA = 'a'.repeat(20);
const BEN = 'b'.repeat(20);

/** Marks holding the GM's areas `areas` (a kept circle each), and a cursor where `cursor` is set. */
function marks(areas: number, cursor = false): MarksMessage {
  const kept = Array.from({ length: areas }, (_, index) => ({ shape: 'circle' as const, points: [{ x: index, y: 0 }, { x: index + 1, y: 0 }] }));
  return { t: 'marks', scene: 's', lasers: [], measures: areas === 0 ? [] : [{ who: 'gm', color: '#8a5cf5', live: null, kept: [] , full: { live: null, kept } }], ...(cursor && { cursors: [{ who: 'gm', x: 1, y: 1, at: 0 }] }) } as MarksMessage;
}

function outbox(): { readonly out: MarksOut; readonly sent: { readonly to: string | undefined; readonly areas: number; readonly live: boolean }[] } {
  const sent: { to: string | undefined; areas: number; live: boolean }[] = [];
  const areasOf = (body: GmMessage): number => (body.t === 'marks' ? body.measures.flatMap((entry) => entry.full?.kept ?? []).length : -1);
  const out = new MarksOut({
    send: (body, to) => void sent.push({ to, areas: areasOf(body), live: false }),
    sendLive: (body, _key, to) => void sent.push({ to, areas: areasOf(body), live: true }),
  });
  return { out, sent };
}

describe('the marks as each player is told them', () => {
  it('go once to all while every player is told the same, and not again while nothing changed', () => {
    const { out, sent } = outbox();
    out.tell([{ body: marks(0) }], 0);
    out.tell([{ body: marks(1) }], 10);
    out.tell([{ players: [ANA], body: marks(1) }, { players: [BEN], body: marks(1) }], 20);
    out.tell([{ body: marks(1) }], 30);
    expect(sent).toEqual([{ to: undefined, areas: 1, live: true }]);
  });

  it('go to each player whose own changed where they differ, then once to all when they agree again', () => {
    const { out, sent } = outbox();
    out.tell([{ body: marks(1) }], 0);
    out.tell([{ players: [ANA], body: marks(1) }, { players: [BEN], body: marks(2) }], 10);
    out.tell([{ players: [ANA], body: marks(1) }, { players: [BEN], body: marks(2) }], 20);
    out.tell([{ players: [ANA], body: marks(2) }, { players: [BEN], body: marks(2) }], 30);
    expect(sent).toEqual([{ to: undefined, areas: 1, live: true }, { to: BEN, areas: 2, live: true }, { to: undefined, areas: 2, live: true }]);
  });

  it('give a player their own on a catch-up or a resend, and nothing to a player told nothing yet', () => {
    const { out, sent } = outbox();
    out.tell([{ players: [ANA], body: marks(1) }, { players: [BEN], body: marks(2) }], 0);
    sent.length = 0;
    out.catchUp(ANA);
    out.resend(BEN);
    out.resend();
    out.catchUp('c'.repeat(20));
    expect(sent).toEqual([{ to: ANA, areas: 1, live: true }, { to: BEN, areas: 2, live: false }, { to: ANA, areas: 1, live: false }, { to: BEN, areas: 2, live: false }]);
  });

  it('keep a showing cursor alive for every player while nothing changes', () => {
    const { out, sent } = outbox();
    out.tell([{ players: [ANA], body: marks(1, true) }, { players: [BEN], body: marks(2, true) }], 0);
    out.tell([{ players: [ANA], body: marks(1, true) }, { players: [BEN], body: marks(2, true) }], CURSOR_KEEPALIVE_MS - 1);
    out.tell([{ players: [ANA], body: marks(1, true) }, { players: [BEN], body: marks(2, true) }], CURSOR_KEEPALIVE_MS);
    expect(sent.map(({ to }) => to)).toEqual([ANA, BEN, ANA, BEN]);
  });
});
