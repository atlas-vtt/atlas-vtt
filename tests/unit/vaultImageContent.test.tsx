// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TFile } from 'obsidian';
import { VaultImageContent } from '../../src/app/packages/components/asset-manager/vault-images/VaultImageContent';
import { VaultImageThumbnails } from '../../src/app/packages/components/asset-manager/vault-images/vaultImageThumbnails';
import { vaultImages } from '../../src/app/packages/components/asset-manager/vault-images/vaultImageFiles';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { stubLayout } from '../mocks/jsdomLayout';

const thumbnail = vi.hoisted(() => vi.fn());
vi.mock('../../src/app/imageProcessing/imageProcessing', () => ({ renderThumbnail: thumbnail }));
stubLayout({ width: 800, height: 600 });
afterEach(cleanup);
beforeEach(() => {
  thumbnail.mockReset();
  thumbnail.mockResolvedValue(new ArrayBuffer(4));
  URL.createObjectURL = vi.fn(() => 'blob:thumbnail');
  URL.revokeObjectURL = vi.fn();
});

const FILES = {
  'Art/Goblin.png': 'art',
  'Maps/Cave.jpg': 'map',
  'Notes/Goblin.md': '# Goblin',
  'atlas-vtt/assets/goblin.webp': 'token art',
  'atlas-vtt/assets/thumbnails/goblin.webp': 'thumbnail',
};

function setup(queuedPaths: string[] = []) {
  const { app } = createInMemoryApp({ files: FILES });
  const controller = new AbortController();
  const onAdd = vi.fn();
  render(<VaultImageContent app={app} mode="token" queuedPaths={queuedPaths} onAdd={onAdd} onClose={vi.fn()} controller={controller} />);
  return { app, controller, onAdd };
}

it('offers the vault\'s images outside Atlas\' own folder, by path', () => {
  const { app } = createInMemoryApp({ files: FILES });
  expect(vaultImages(app).map((file) => file.path)).toEqual(['Art/Goblin.png', 'Maps/Cave.jpg']);
});

it('adds the chosen images as uploads and writes nothing to the vault', async () => {
  const { app, onAdd } = setup();
  fireEvent.click(screen.getByRole('checkbox', { name: 'Select Cave' }));
  fireEvent.click(screen.getByRole('button', { name: 'Add 1 to import' }));
  await waitFor(() => expect(onAdd).toHaveBeenCalledWith([{ file: expect.any(File), vaultPath: 'Maps/Cave.jpg' }]));
  const [[[image]]] = onAdd.mock.calls as [[[{ file: File }]]];
  expect(image.file).toMatchObject({ name: 'Cave.jpg', type: 'image/jpeg' });
  expect(app.vault.adapter.write).not.toHaveBeenCalled();
});

it('keeps images already added out of another addition and searches by path', async () => {
  const { onAdd } = setup(['Art/Goblin.png']);
  expect((screen.getByRole('checkbox', { name: 'Select Goblin' }) as HTMLInputElement).disabled).toBe(true);
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'maps' } });
  expect(screen.queryByRole('checkbox', { name: 'Select Goblin' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Select all shown' }));
  fireEvent.click(screen.getByRole('button', { name: 'Add 1 to import' }));
  await waitFor(() => expect(onAdd).toHaveBeenCalledWith([expect.objectContaining({ vaultPath: 'Maps/Cave.jpg' })]));
});

it('adds nothing read after the creator stopped the addition', async () => {
  const { app, controller, onAdd } = setup();
  let finish!: (buffer: ArrayBuffer) => void;
  app.vault.readBinary = vi.fn(() => new Promise((resolve) => { finish = resolve; }));
  fireEvent.click(screen.getByRole('checkbox', { name: 'Select Cave' }));
  fireEvent.click(screen.getByRole('button', { name: 'Add 1 to import' }));
  await act(async () => { controller.abort(); finish(new ArrayBuffer(1)); });
  expect(onAdd).not.toHaveBeenCalled();
});

it('makes each thumbnail once in the image workers and gives them back when the pane closes', async () => {
  const { app } = createInMemoryApp({ files: FILES });
  const thumbnails = new VaultImageThumbnails(app);
  const file = new TFile('Maps/Cave.jpg');
  expect(await thumbnails.load(file)).toBe('blob:thumbnail');
  await thumbnails.load(file);
  expect(thumbnail).toHaveBeenCalledTimes(1);
  expect(thumbnail.mock.lastCall?.[2]).toMatchObject({ background: true });
  thumbnails.dispose();
  await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:thumbnail'));
});

it('shows no thumbnail for an image the workers cannot read', async () => {
  thumbnail.mockRejectedValue(new Error('cannot decode'));
  const { app } = createInMemoryApp({ files: FILES });
  expect(await new VaultImageThumbnails(app).load(new TFile('Art/Goblin.png'))).toBeNull();
});

it('lays a large vault out in rows of cards and mounts only the rows in view', () => {
  const files = Object.fromEntries(Array.from({ length: 600 }, (_, index) => [`Art/${String(index).padStart(3, '0')}.png`, 'art']));
  const { app } = createInMemoryApp({ files });
  const { container } = render(<VaultImageContent app={app} mode="map" queuedPaths={[]} onAdd={vi.fn()} onClose={vi.fn()} controller={new AbortController()} />);
  const rows = container.querySelectorAll('.atlas-vault-images__row');
  expect(rows.length).toBeGreaterThan(0);
  expect(rows[0]!.querySelectorAll('.atlas-asset-card').length).toBeGreaterThan(1);
  expect(container.querySelectorAll('.atlas-asset-card').length).toBeLessThan(100);
});
