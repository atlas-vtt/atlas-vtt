// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StatblockImportContent } from '../../src/app/packages/components/asset-manager/statblock-import/StatblockImportContent';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { stubLayout } from '../mocks/jsdomLayout';

const fake = vi.hoisted(() => ({ scan: vi.fn() }));
vi.mock('../../src/app/services/StatblockTokenImportService', () => ({ StatblockTokenImportService: class { scan = fake.scan; } }));
stubLayout({ width: 800, height: 600 });
afterEach(cleanup);
function setup(queuedPaths: string[] = []) {
  fake.scan.mockResolvedValue([
    { name: 'Goblin', path: 'Bestiary/Goblin.md', imagePath: 'goblin.webp', status: 'ready', detail: 'Ready', layoutName: 'Basic 5e Layout' },
    { name: 'Ogre', path: 'Bestiary/Ogre.md', imagePath: 'ogre.webp', status: 'ready', detail: 'Ready', layoutName: 'Daggerheart Adversary' },
    { name: 'Dragon', path: 'Bestiary/Dragon.md', status: 'missing-image', detail: 'Image missing' },
    { name: 'Rat', path: 'Bestiary/Rat.md', status: 'imported', detail: 'Already imported' },
  ]);
  const { app } = createInMemoryApp({ files: { 'goblin.webp': 'art', 'ogre.webp': 'art' } });
  app.vault.getResourcePath = (p: { path: string }) => p.path;
  const controller = new AbortController();
  const onAdd = vi.fn();
  render(<StatblockImportContent app={app} queuedPaths={queuedPaths} onAdd={onAdd} onClose={vi.fn()} controller={controller} />);
  return { app, controller, onAdd };
}
it('selects only ready creatures and stages only the chosen layout without saving assets', async () => {
  const { app, onAdd } = setup();
  await screen.findByRole('button', { name: 'Add 2 to import' });
  expect((screen.getByRole('checkbox', { name: 'Select Dragon' }) as HTMLInputElement).disabled).toBe(true);
  expect((screen.getByRole('checkbox', { name: 'Select Rat' }) as HTMLInputElement).disabled).toBe(true);
  fireEvent.keyDown(screen.getByRole('button', { name: 'System / layout' }), { key: 'Enter' });
  fireEvent.click(await screen.findByRole('menuitemcheckbox', { name: 'Daggerheart Adversary' }));
  expect(screen.getByRole('button', { name: 'System / layout' }).textContent).toContain('Daggerheart Adversary');
  expect(screen.queryByRole('checkbox', { name: 'Select Goblin' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Add 1 to import' }));
  await waitFor(() => expect(onAdd).toHaveBeenCalledWith([expect.objectContaining({ name: 'Ogre', statblockPath: 'Bestiary/Ogre.md', file: expect.any(File) })]));
  expect(app.vault.adapter.write).not.toHaveBeenCalled();
});
it('keeps queued notes out of subsequent additions and preserves selection while searching', async () => {
  const { onAdd } = setup(['Bestiary/Goblin.md']);
  await screen.findByRole('button', { name: 'Add 1 to import' });
  expect((screen.getByRole('checkbox', { name: 'Select Goblin' }) as HTMLInputElement).disabled).toBe(true);
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Goblin' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add 1 to import' }));
  await waitFor(() => expect(onAdd).toHaveBeenCalledWith([expect.objectContaining({ name: 'Ogre' })]));
});
it('does not stage partially read images after cancellation', async () => {
  const { app, controller, onAdd } = setup();
  await screen.findByRole('button', { name: 'Add 2 to import' });
  let finish!: (buffer: ArrayBuffer) => void;
  app.vault.readBinary = vi.fn(() => new Promise(resolve => { finish = resolve; }));
  fireEvent.click(screen.getByRole('button', { name: 'Add 2 to import' }));
  expect((screen.getByRole('button', { name: 'Loading images…' }) as HTMLButtonElement).disabled).toBe(true);
  await act(async () => { controller.abort(); finish(new ArrayBuffer(1)); });
  expect(onAdd).not.toHaveBeenCalled();
});
it('mounts only the rows in view of a large bestiary', async () => {
  const creatures = Array.from({ length: 6000 }, (_, index) => ({ name: `Creature ${index}`, path: `Bestiary/${index}.md`, imagePath: 'goblin.webp', status: 'ready', detail: 'Ready', layoutName: 'Basic 5e Layout' }));
  fake.scan.mockResolvedValue(creatures);
  const { app } = createInMemoryApp({ files: { 'goblin.webp': 'art' } });
  app.vault.getResourcePath = (p: { path: string }) => p.path;
  render(<StatblockImportContent app={app} queuedPaths={[]} onAdd={vi.fn()} onClose={vi.fn()} controller={new AbortController()} />);
  await screen.findByRole('button', { name: 'Add 6,000 to import' });
  const mounted = screen.getAllByRole('checkbox');
  expect(mounted.length).toBeGreaterThan(0);
  expect(mounted.length).toBeLessThan(50);
});
