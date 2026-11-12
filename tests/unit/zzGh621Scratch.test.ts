// @vitest-environment jsdom
// Scratch measurement for GH621; never committed.
import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { AssetService, type Asset } from '../../src/app/services/AssetService';
import { installBestiaryTokens } from '../../src/app/services/stockPacks/bestiaryTokens';
import { createInMemoryApp } from '../mocks/inMemoryVault';

const PACKS = '/Users/fabian.urbanek/Github/docs/atlas-vtt/stock-packs';
const CACHE = 'atlas-vtt/.atlas-data/assets-metadata.json';

beforeEach(() => AssetService.resetInstance());

function library(records: number): Record<string, string> {
  const assets: Record<string, Asset> = {};
  const files: Record<string, string> = {};
  for (let index = 0; index < records; index++) {
    const art = `atlas-vtt/collections/Fen/tokens/creature-${index}.webp`;
    assets[`token-${index}`] = { name: `Creature ${index}`, tags: ['beast'], collection: 'Fen', createdAt: 1000 + index, modifiedAt: 2000 + index, id: `token-${index}`, type: 'token', imagePath: art };
    files[art] = 'IMG';
  }
  const collections = { Fen: { id: 'Fen', uid: 'uid-Fen', version: 1, name: 'Fen', tags: {}, settings: { conditions: [] }, createdAt: 1, modifiedAt: 1 } };
  files[CACHE] = JSON.stringify({ version: 2, vaultId: 'vault-a', defaultCollectionId: 'Fen', collections, assets });
  return files;
}

const turn = (): Promise<void> => new Promise((resolve) => { setImmediate(resolve); });

function slow(target: Record<string, unknown>, names: readonly string[], count: Map<string, number>): void {
  for (const name of names) {
    const original = target[name] as (...args: unknown[]) => Promise<unknown>;
    target[name] = async (...args: unknown[]): Promise<unknown> => {
      count.set(name, (count.get(name) ?? 0) + 1);
      await turn();
      return original(...args);
    };
  }
}

describe('GH621 scratch', () => {
  for (const records of [0, 3000]) {
    it(`installs the real token pack into a library of ${records}`, async () => {
      const vault = createInMemoryApp({ files: library(records), folders: ['atlas-vtt/collections'] });
      const assets = AssetService.getInstance(vault.app);
      await assets.initialize();
      await assets.vaultChecked();

      const calls = new Map<string, number>();
      let cacheWrites = 0;
      const adapter = vault.app.vault.adapter as unknown as Record<string, unknown>;
      const write = adapter.write as (p: string, c: string) => Promise<void>;
      adapter.write = async (p: string, c: string): Promise<void> => {
        if (p === CACHE) cacheWrites++;
        return write(p, c);
      };
      slow(adapter, ['write', 'writeBinary', 'mkdir', 'read'], calls);
      slow(vault.app.vault as unknown as Record<string, unknown>, ['create', 'createBinary', 'createFolder', 'process'], calls);

      let inFlight = 0;
      let maxInFlight = 0;
      let fetchedBytes = 0;
      const fetch = async (url: string): Promise<ArrayBuffer> => {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await turn();
        const file = fs.readFileSync(path.join(PACKS, url.replace('https://assets.atlas-vtt.dev/starter/', '')));
        inFlight--;
        fetchedBytes += file.byteLength;
        return file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
      };

      const digest = crypto.subtle.digest.bind(crypto.subtle);
      let digests = 0;
      let maxDigest = 0;
      crypto.subtle.digest = ((algorithm: AlgorithmIdentifier, data: BufferSource) => {
        digests++;
        maxDigest = Math.max(maxDigest, data.byteLength);
        return digest(algorithm, data);
      }) as typeof crypto.subtle.digest;

      let running = true;
      let last = performance.now();
      let maxGap = 0;
      const gaps: number[] = [];
      const tick = (): void => {
        const now = performance.now();
        maxGap = Math.max(maxGap, now - last);
        if (now - last > 8) gaps.push(Math.round(now - last));
        last = now;
        if (running) setImmediate(tick);
      };
      setImmediate(tick);
      const start = performance.now();
      const added = await installBestiaryTokens(vault.app, assets, 'Fen', { fetch, statblocks: '5e' });
      const took = performance.now() - start;
      running = false;
      crypto.subtle.digest = digest;

      console.log(JSON.stringify({ records, added, took: Math.round(took), maxGap: Math.round(maxGap), gapsOver8: gaps.length, worst: gaps.sort((a, b) => b - a).slice(0, 12), cacheWrites, calls: Object.fromEntries(calls), maxInFlight, fetchedBytes, digests, maxDigest }));
      expect(added).toBe(155);
    }, 120_000);
  }
});
