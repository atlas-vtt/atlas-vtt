import { describe, expect, it, vi } from 'vitest';
import type { CampaignSeat, YourCodeMessage } from '../../../../src/app/online/protocol/index.ts';
import { TableRoster } from '../../../../src/app/online/gm/tableRoster.ts';
import { fakeCampaigns } from './fakeSeats.ts';

vi.mock('obsidian', async (original) => ({ ...(await original<object>()), Notice: class {} }));

const ANA = 'a'.repeat(20);
/** A random source that draws these numbers in turn, then zeros. */
const seq = (...draws: number[]): (() => number) => () => draws.shift() ?? 0;

/** A roster of a campaign where Ana has code 100000, at a table whose join code is 100001, drawing `draws`. */
function roster(...draws: number[]): { roster: TableRoster; seats: ReturnType<typeof fakeCampaigns>['seats']; codes: [string, YourCodeMessage][]; rosters: CampaignSeat[][]; kicked: string[] } {
  const { seats } = fakeCampaigns([{ id: ANA, name: 'Ana' }]);
  const codes: [string, YourCodeMessage][] = [];
  const rosters: CampaignSeat[][] = [];
  const kicked: string[] = [];
  const made = new TableRoster(seats, {
    setPlayers: (players) => void rosters.push([...players]),
    sendCode: (message, to) => void codes.push([to, message]),
  }, { kick: (id) => void kicked.push(id), turnAway: (id) => void kicked.push(id), joinCode: () => '100001', random: seq(...draws) });
  made.start();
  return { roster: made, seats, codes, rosters, kicked };
}

describe('the codes the roster makes', () => {
  it('are never another player\'s nor the join code, for a newcomer and for a player the GM adds', () => {
    const table = roster(100_000, 100_001, 42, 100_000, 100_001, 42, 43);
    expect(table.roster.joined({ id: 'n'.repeat(20), name: 'Noor' })).toBe(true);
    expect(table.seats.codeOf('n'.repeat(20))).toBe('000042');
    expect(table.roster.add('Cal')?.code).toBe('000043');
  });

  it('are never another player\'s nor the join code when the GM gives a new one', () => {
    const table = roster(100_000, 100_001, 7);
    table.roster.newCode(ANA);
    expect(table.seats.codeOf(ANA)).toBe('000007');
    expect(table.codes).toEqual([[ANA, { t: 'your-code', code: '000007', first: false }]]);
  });
});
