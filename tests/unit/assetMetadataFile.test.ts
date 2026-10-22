// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import type { DataAdapter } from 'obsidian';
import { preserveUnreadableMetadata, readStoredMetadata } from '../../src/app/services/assetMetadataFile';
import { createInMemoryApp } from '../mocks/inMemoryVault';

const INDEX = 'atlas-vtt/.atlas-data/assets-metadata.json';
const LEGACY = 'atlas-vtt/assets-metadata.json';
const valid = JSON.stringify({ version: 2, collections: {}, assets: {} });
const options = { retries: 2, retryDelayMs: 1 };

const adapterWith = (files: Record<string, string>): { adapter: DataAdapter; files: Map<string, string> } => {
  const { app, files: stored } = createInMemoryApp({ files });
  return { adapter: app.vault.adapter as DataAdapter, files: stored };
};

it('reads the first index that exists and reports a missing one', async () => {
  expect(await readStoredMetadata(adapterWith({}).adapter, [INDEX, LEGACY], options)).toEqual({ kind: 'missing' });
  expect(await readStoredMetadata(adapterWith({ [LEGACY]: valid }).adapter, [INDEX, LEGACY], options)).toMatchObject({ kind: 'current' });
  expect(await readStoredMetadata(adapterWith({ [LEGACY]: JSON.stringify({ tokens: {} }) }).adapter, [INDEX, LEGACY], options)).toMatchObject({ kind: 'legacy' });
});

it('reads again when the file is caught halfway through a write', async () => {
  const { adapter } = adapterWith({ [INDEX]: valid });
  const read = adapter.read.bind(adapter);
  adapter.read = vi.fn().mockResolvedValueOnce('{"collections": {').mockImplementation(read);

  expect(await readStoredMetadata(adapter, [INDEX], options)).toMatchObject({ kind: 'current' });
});

it('calls a file unreadable only after every retry failed', async () => {
  const { adapter } = adapterWith({ [INDEX]: '' });
  const stored = await readStoredMetadata(adapter, [INDEX], options);

  expect(stored).toMatchObject({ kind: 'unreadable', path: INDEX });
  expect(adapter.read).toHaveBeenCalledTimes(3);
});

it('keeps a copy of an unreadable index next to it', async () => {
  const { adapter, files } = adapterWith({ [INDEX]: '{"collections": {' });
  const copy = await preserveUnreadableMetadata(adapter, INDEX, new Date('2026-09-24T15:40:00.000Z'));

  expect(copy).toBe('atlas-vtt/.atlas-data/assets-metadata.unreadable-2026-09-24T15-40-00-000Z.json');
  expect(files.get(copy)).toBe('{"collections": {');
});
