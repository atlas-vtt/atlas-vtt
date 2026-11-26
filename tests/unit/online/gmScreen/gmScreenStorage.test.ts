import type { Plugin } from 'obsidian';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ARM_MS } from '../../../../src/app/online/gm/armedCards.ts';
import { OnlineFeature } from '../../../../src/app/online/gm/OnlineFeature.ts';
import { readSavedTable } from '../../../../src/app/online/gm/savedTable.ts';
import { readGmScreenRecord, type GmScreenRecord } from '../../../../src/app/online/gmScreen/index.ts';
import { createInMemoryApp } from '../../../mocks/inMemoryVault';
import { deviceId, RelaySocket, sessionRig } from './sessionRig.ts';

const PHONE = deviceId('p');

beforeEach(() => {
  RelaySocket.all = [];
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const RECORD: GmScreenRecord = {
  link: { code: 'g'.repeat(26), key: `${'K'.repeat(42)}A` },
  secret: 'room-secret-0123456789abcdef',
  devices: [{ id: PHONE, name: 'Phone', code: '123456', lastSeen: 5 }],
  ending: [{ code: 'h'.repeat(26), secret: 'old-room-secret-0123456789abcdef' }],
};
const TABLE = { code: 't'.repeat(26), secret: 'table-secret-0123456789abcdef', campaignId: 'c'.repeat(24), maxPlayers: 4, mapPath: null, gate: { code: '654321', requireCode: true, askToJoin: true } };

/** Online play's feature with what it read of its data file set by hand, writing into `saved`. */
function feature(): { online: OnlineFeature; saved: Record<string, unknown>[] } {
  const vault = createInMemoryApp({ files: {} });
  const saved: Record<string, unknown>[] = [];
  const online = new OnlineFeature({ app: vault.app, manifest: { version: '0' } } as unknown as Plugin, { read: () => Promise.resolve(null), write: (data: unknown) => (saved.push(JSON.parse(JSON.stringify(data)) as Record<string, unknown>), Promise.resolve()) } as never);
  return { online, saved };
}

describe('where the GM screen is kept', () => {
  it('reads back what it wrote, and nothing it cannot trust', () => {
    expect(readGmScreenRecord(JSON.parse(JSON.stringify(RECORD)))).toEqual(RECORD);
    expect(readGmScreenRecord({ ...RECORD, link: { code: RECORD.link.code, key: 'short' } })).toBeNull();
    expect(readGmScreenRecord({ ...RECORD, secret: 'x' })).toEqual({ ...RECORD, secret: null });
    expect(readGmScreenRecord({ ...RECORD, ending: [...RECORD.ending, { code: 'h'.repeat(26), secret: 'x' }, { code: 'bad', secret: RECORD.secret }, null] })).toEqual(RECORD);
    expect(readGmScreenRecord({ ...RECORD, ending: undefined })).toEqual({ ...RECORD, ending: [] });
    expect(readGmScreenRecord({ ...RECORD, devices: [...RECORD.devices, { id: 'bad', name: 'x', code: '1' }, { ...RECORD.devices[0], name: 'Twin' }] })?.devices).toEqual(RECORD.devices);
  });

  it('is written into online play\'s data file beside the running table, and keeps the table\'s record when it changes, and the reverse', async () => {
    const { online, saved } = feature();
    const fields = online as unknown as { savedTable: unknown; gmScreen: { saved: GmScreenRecord | null } | null };
    fields.savedTable = TABLE;
    fields.gmScreen = { saved: RECORD };
    await online.saveSettings();
    expect(readSavedTable(saved[0]?.table)).toEqual(TABLE);
    expect(readGmScreenRecord(saved[0]?.gmScreen)).toEqual(RECORD);
    fields.gmScreen = { saved: { ...RECORD, devices: [] } };
    await online.saveSettings();
    expect(readSavedTable(saved[1]?.table)).toEqual(TABLE);
    fields.savedTable = null;
    await online.saveSettings();
    expect(readGmScreenRecord(saved[2]?.gmScreen)?.devices).toEqual([]);
  });

  it('hands the link\'s key to nothing but the record it keeps: not to the relay, a notice or the console', async () => {
    const logged: unknown[] = [];
    for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) vi.spyOn(console, level).mockImplementation((...args: unknown[]) => void logged.push(...args));
    const rig = sessionRig();
    await rig.session.start();
    rig.socket().welcome();
    const device = await rig.device(PHONE);
    rig.socket().receive({ t: 'knock', id: PHONE, name: 'Phone' });
    await rig.settle();
    rig.timers.advance(ARM_MS);
    rig.session.allow(PHONE);
    rig.socket().receive({ t: 'player-joined', id: PHONE, name: 'Phone' });
    await rig.settle();
    expect(device.heard.length).toBeGreaterThan(0);
    rig.session.newLink();
    await rig.settle();
    rig.socket().drop(4016);
    const keys = new Set(rig.saved.map((record) => record.link.key));
    expect(keys.size).toBe(2);
    const sent = RelaySocket.all.flatMap((socket) => socket.sent).join('\n');
    const said = [...rig.notices, ...logged.map(String)].join('\n');
    for (const key of keys) {
      expect(sent).not.toContain(key);
      expect(said).not.toContain(key);
    }
  });
});
