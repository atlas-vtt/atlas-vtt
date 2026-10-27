// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import { MotionGlobalConfig } from 'framer-motion';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import { generateDungeon } from '../../src/app/dungeons/generate';
import { DEFAULT_STYLE_ID, DUNGEON_STYLES, dungeonStyle } from '../../src/app/dungeons/styleCatalog';
import { mapLayout } from '../../src/app/dungeons/render/layoutSize';
import { roomCentre } from '../../src/app/dungeons/render/geometry';
import { createDungeonScene } from '../../src/app/dungeons/scene/createDungeonScene';
import type { DungeonJob, DungeonRendered } from '../../src/app/dungeons/worker/dungeonJob';
import { randomSeed } from '../../src/app/dungeons/rng';
import { DungeonWizard } from '../../src/app/packages/components/dungeon-generator/DungeonWizard';
import { SAMPLE_REQUEST } from '../../src/app/packages/components/dungeon-generator/sampleStyleCards';
import { DEFAULT_VIEW } from '../../src/app/dungeons/style';
import { useDungeonState } from '../../src/app/packages/components/dungeon-generator/useDungeonState';
import { AssetService } from '../../src/app/services/AssetService';
import { SettingsService } from '../../src/app/services/SettingsService';
import { stubLayout } from '../mocks/jsdomLayout';
import { t } from '../../src/app/i18n';

const worker = vi.hoisted(() => ({ preview: vi.fn(), render: vi.fn(), thumbnail: vi.fn(), dropThumbnails: vi.fn() }));
/** A new client per test: the style cards are kept per client for as long as the app runs. */
const clients = vi.hoisted(() => ({ current: {} as object }));
vi.mock('../../src/app/dungeons/worker/DungeonWorkerClient', () => ({ DungeonWorkerClient: { forApp: () => clients.current } }));
vi.mock('../../src/app/dungeons/rng', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/app/dungeons/rng')>();
  return { ...actual, randomSeed: vi.fn(actual.randomSeed) };
});
vi.mock('../../src/app/dungeons/scene/createDungeonScene', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../src/app/dungeons/scene/createDungeonScene')>(),
  createDungeonScene: vi.fn(),
}));

stubLayout({ width: 800, height: 560 });

/** The worker as the panel sees it: the dungeon of the job's request, drawn as nothing. */
function answer(job: DungeonJob): Promise<DungeonRendered> {
  const model = job.model ?? generateDungeon(job.request);
  const bitmap = { width: 10, height: 10, close: vi.fn() } as unknown as ImageBitmap;
  return Promise.resolve({ model, map: mapLayout(model, 1), image: { type: 'bitmap', bitmap } });
}

const assets = { initialize: vi.fn().mockResolvedValue(undefined) } as unknown as AssetService;
let app: App;
let settings: SettingsService;

beforeEach(() => {
  MotionGlobalConfig.skipAnimations = true;
  vi.clearAllMocks();
  vi.stubGlobal('ResizeObserver', class { observe(): void {} unobserve(): void {} disconnect(): void {} });
  HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;
  app = { scope: {} } as unknown as App;
  settings = new SettingsService(app);
  worker.preview.mockImplementation(answer);
  worker.thumbnail.mockImplementation(answer);
  clients.current = { ...worker };
  vi.spyOn(AssetService, 'getInstance').mockReturnValue(assets);
});
afterEach(() => {
  cleanup();
  document.body.empty();
  vi.restoreAllMocks();
  MotionGlobalConfig.skipAnimations = false;
});

function renderPanel(onCreated = vi.fn(), initialName = 'Sunken Vault', step?: string): ReturnType<typeof vi.fn> {
  const layer = document.body.createDiv();
  render(<DungeonWizard app={app} layer={layer} collectionId="Dungeons" initialName={initialName} onCreated={onCreated} onClose={vi.fn()} />);
  if (step) goTo(step);
  return onCreated;
}

/** Goes to a step by its mark in the wizard's header. */
function goTo(step: string): void {
  fireEvent.click(within(screen.getByRole('list', { name: 'Steps' })).getByRole('button', { name: step }));
}

const preview = (): HTMLElement => document.querySelector<HTMLElement>('.atlas-dungeon-wizard-preview')!;

const lastJob = (): DungeonJob => worker.preview.mock.calls.at(-1)![0] as DungeonJob;
const tag = (name: string): HTMLElement => screen.getByRole('button', { name, pressed: undefined });
const exportButton = (): HTMLElement => within(preview()).getByRole('button', { name: 'Export' });
/** The thumbnails asked for by one set of cards: `styles` or `themes`. */
const thumbnailJobs = (group: string): DungeonJob[] => worker.thumbnail.mock.calls.filter((call) => call[1] === group).map((call) => call[0] as DungeonJob);

describe('the dungeon wizard', () => {
  it('draws the map fitted into the card beside the panel, off the main thread', async () => {
    renderPanel();
    await waitFor(() => expect(worker.preview).toHaveBeenCalled());
    const job = lastJob();
    expect(job.output).toMatchObject({ kind: 'preview' });
    expect(job.model).toBeUndefined();
    expect(await within(preview()).findByRole('img', { name: 'Dungeon preview' })).toBeTruthy();
  });

  it('asks one thing a step, theme first, and goes back and forth with Back and Next', async () => {
    renderPanel();
    // The step leaving is gone once it has slid away
    const shows = (title: string): Promise<void> => waitFor(() => expect(screen.getByRole('heading', { level: 2 }).textContent).toBe(title));
    await shows('What kind of place is it?');
    expect(screen.getByRole('button', { name: 'Back' }).hasAttribute('disabled')).toBe(true);
    const order = ['How is it laid out?', 'What is it like?', 'How should the map look?', 'What is it called?'];
    for (const next of order) {
      fireEvent.click(screen.getByRole('button', { name: 'Next' }));
      await shows(next);
    }
    // The last step creates the scene instead
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Create scene' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    await shows('How should the map look?');
    goTo('Theme');
    await shows('What kind of place is it?');
    expect(screen.getByText('Step 1 of 5')).toBeTruthy();
  });

  it('opens with the chosen theme focused, so the arrows run through the themes', async () => {
    renderPanel();
    await waitFor(() => expect(document.activeElement?.getAttribute('aria-checked')).toBe('true'));
    expect(document.activeElement?.querySelector('.atlas-dungeon-card-name')?.textContent).toBe('Surprise me');
  });

  it('never draws another dungeon for another name', async () => {
    renderPanel(vi.fn(), 'Sunken Vault', 'Name');
    await waitFor(() => expect(worker.preview).toHaveBeenCalled());
    const calls = worker.preview.mock.calls.length;
    const { request } = lastJob();
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'Moon Temple' } });
    await act(async () => { await Promise.resolve(); });
    expect(worker.preview.mock.calls.length).toBe(calls);
    expect(lastJob().request).toBe(request);
  });

  it('creates a scene only once it has a name', () => {
    renderPanel(vi.fn(), '', 'Name');
    const create = screen.getByRole('button', { name: 'Create scene' });
    expect(create.hasAttribute('disabled')).toBe(true);
    const name = screen.getByRole('textbox', { name: 'Name' });
    expect(name.getAttribute('placeholder')).toBe('Name it to create the scene');
    fireEvent.change(name, { target: { value: '   ' } });
    expect(create.hasAttribute('disabled')).toBe(true);
    fireEvent.change(name, { target: { value: 'Grey Vault' } });
    expect(create.hasAttribute('disabled')).toBe(false);
  });

  it('generates at once with a tag picked, on the same seed, and lets one tag of a group stand', async () => {
    renderPanel(vi.fn(), 'Sunken Vault', 'Features');
    await waitFor(() => expect(worker.preview).toHaveBeenCalled());
    const seed = lastJob().request.seed;
    fireEvent.click(tag('wet'));
    await waitFor(() => expect(lastJob().request.tags).toEqual(['medium', 'wet']));
    fireEvent.click(tag('flooded'));
    expect(tag('wet').getAttribute('aria-pressed')).toBe('false');
    expect(tag('flooded').getAttribute('aria-pressed')).toBe('true');
    await waitFor(() => expect(lastJob().request.tags).toEqual(['medium', 'flooded']));
    expect(lastJob().request.seed).toBe(seed);
    expect(settings.getDungeonGenerator().tags).toEqual(['medium', 'flooded']);
  });

  it('chooses the size as one of three, medium where the tags name none', async () => {
    renderPanel(vi.fn(), 'Sunken Vault', 'Features');
    const size = screen.getByRole('radiogroup', { name: 'Size' });
    expect(within(size).getAllByRole('radio').map((radio) => radio.textContent)).toEqual(['Small', 'Medium', 'Large']);
    expect(within(size).getByRole('radio', { checked: true }).textContent).toBe('Medium');
    fireEvent.click(within(size).getByRole('radio', { name: 'Large' }));
    await waitFor(() => expect(lastJob().request.tags).toEqual(['large']));
    // Choosing it again keeps it
    fireEvent.click(within(size).getByRole('radio', { name: 'Large' }));
    expect(settings.getDungeonGenerator().tags).toEqual(['large']);
    // No size is a chip any more
    expect(document.querySelector('.atlas-dungeon-tag[data-tag="small"]')).toBeNull();
  });

  it('asks for no, some or many secret rooms', async () => {
    renderPanel(vi.fn(), 'Sunken Vault', 'Features');
    const secrets = screen.getByRole('radiogroup', { name: 'Secret rooms' });
    expect(within(secrets).getByRole('radio', { checked: true }).textContent).toBe('Some');
    fireEvent.click(within(secrets).getByRole('radio', { name: 'None' }));
    await waitFor(() => expect(lastJob().request.tags).toEqual(['medium', 'no-secrets']));
    fireEvent.click(within(secrets).getByRole('radio', { name: 'Many' }));
    await waitFor(() => expect(lastJob().request.tags).toEqual(['medium', 'secret']));
    fireEvent.click(within(secrets).getByRole('radio', { name: 'Some' }));
    await waitFor(() => expect(lastJob().request.tags).toEqual(['medium']));
  });

  it('draws a new layout from the card, everything else as it is', async () => {
    renderPanel(vi.fn(), 'Sunken Vault', 'Features');
    fireEvent.click(tag('overgrown'));
    await waitFor(() => expect(lastJob().request.tags).toEqual(['medium', 'overgrown']));
    const seed = lastJob().request.seed;
    fireEvent.click(within(preview()).getByRole('button', { name: 'New layout' }));
    await waitFor(() => expect(lastJob().request.seed).not.toBe(seed));
    expect(lastJob().request.tags).toEqual(['medium', 'overgrown']);
  });

  it('keeps what is shown in Atlas settings', async () => {
    renderPanel(vi.fn(), 'Sunken Vault', 'Style');
    fireEvent.click(screen.getByText('Map options'));
    fireEvent.click(screen.getByRole('switch', { name: 'Monochrome' }));
    expect(settings.getDungeonGenerator().view.monochrome).toBe(true);
    await waitFor(() => expect(lastJob().view.monochrome).toBe(true));
  });

  it('picks the grid in sight on the Style step', async () => {
    renderPanel(vi.fn(), 'Sunken Vault', 'Style');
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Grid' })).getByRole('radio', { name: 'Dashed' }));
    expect(settings.getDungeonGenerator().view.grid).toBe('dashed');
    await waitFor(() => expect(lastJob().view.grid).toBe('dashed'));
  });

  it('creates the scene of the dungeon as shown and hands it on', async () => {
    vi.mocked(createDungeonScene).mockResolvedValue({ ok: true, name: 'Sunken Vault', scenePath: 'atlas-vtt/collections/Dungeons/scenes/Sunken Vault.atlasmap' });
    const onCreated = renderPanel(vi.fn(), 'Sunken Vault', 'Name');
    await waitFor(() => expect(worker.preview).toHaveBeenCalled());
    await waitFor(() => expect(exportButton().hasAttribute('disabled')).toBe(false));

    fireEvent.click(screen.getByRole('button', { name: 'Create scene' }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith({ name: 'Sunken Vault', scenePath: 'atlas-vtt/collections/Dungeons/scenes/Sunken Vault.atlasmap' }));
    const [, service, options] = vi.mocked(createDungeonScene).mock.calls[0]!;
    expect(service).toBe(assets);
    expect(options).toMatchObject({ collectionId: 'Dungeons', name: 'Sunken Vault' });
    expect(options.model?.floors[0]?.rooms.length).toBeGreaterThan(0);
    expect(options.style).toBe(dungeonStyle(settings.getDungeonGenerator().style));
  });

  it('creates the scene with Enter in the name field', async () => {
    vi.mocked(createDungeonScene).mockResolvedValue({ ok: true, name: 'Crypt', scenePath: 'atlas-vtt/collections/Dungeons/scenes/Crypt.atlasmap' });
    const onCreated = renderPanel(vi.fn(), 'Crypt', 'Name');
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Name' }), { key: 'Enter' });
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
  });

  it('says why a scene could not be created', async () => {
    vi.mocked(createDungeonScene).mockResolvedValue({ ok: false, problem: 'The collection no longer exists.' });
    const onCreated = renderPanel(vi.fn(), 'Sunken Vault', 'Name');
    fireEvent.click(screen.getByRole('button', { name: 'Create scene' }));
    expect(await screen.findByText('The collection no longer exists.')).toBeTruthy();
    expect(onCreated).not.toHaveBeenCalled();
  });

  it('has no keyboard shortcuts: keys pressed in the panel change nothing', async () => {
    renderPanel();
    await waitFor(() => expect(worker.preview).toHaveBeenCalled());
    const calls = worker.preview.mock.calls.length;
    const { request } = lastJob();
    const before = settings.getDungeonGenerator();
    const panel = document.querySelector<HTMLElement>('.atlas-dungeon-wizard')!;
    for (const key of ['Enter', ' ', 'n', 'g', 'G', 'h', 'm', 'w', 'p', 'e', 'j', '1']) {
      fireEvent.keyDown(panel, { key, shiftKey: key === 'G' });
    }
    await act(async () => { await Promise.resolve(); });
    expect(worker.preview.mock.calls.length).toBe(calls);
    expect(lastJob().request).toEqual(request);
    expect(settings.getDungeonGenerator()).toEqual(before);
  });
});

describe('the theme', () => {
  const chooseTheme = (label: string): void => {
    goTo('Theme');
    fireEvent.click(screen.getByRole('radio', { name: new RegExp(`^${label}`) }));
  };
  const chips = (): string[] => [...document.querySelectorAll('.atlas-dungeon-tag')].map((chip) => chip.getAttribute('data-tag') ?? '');
  const refused = (): string[] => [...document.querySelectorAll('.atlas-dungeon-tag[aria-disabled="true"]')].map((chip) => chip.getAttribute('data-tag') ?? '');

  it('offers the themes as cards, Surprise me first', () => {
    renderPanel();
    const cards = within(screen.getByRole('radiogroup', { name: 'Theme' })).getAllByRole('radio');
    expect(cards.map((card) => card.querySelector('.atlas-dungeon-card-name')?.textContent)).toEqual(['Surprise me', 'Fortress', 'Haunted Mansion', 'Cavern']);
    expect(cards.filter((card) => card.tabIndex === 0)).toEqual([cards[0]]);
  });

  it('runs through the themes with the arrow keys, drawing each at once', async () => {
    renderPanel();
    fireEvent.keyDown(screen.getByRole('radio', { name: /^Surprise me/ }), { key: 'ArrowRight' });
    await waitFor(() => expect(lastJob().request.theme).toBe('fortress'));
    expect(document.activeElement?.querySelector('.atlas-dungeon-card-name')?.textContent).toBe('Fortress');
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowLeft' });
    await waitFor(() => expect(lastJob().request.theme).toBe('any'));
  });

  it('offers the Haunted Mansion only the tags that change it, and no secret rooms', async () => {
    renderPanel();
    chooseTheme('Haunted Mansion');
    await waitFor(() => expect(lastJob().request.theme).toBe('mansion'));
    goTo('Features');
    expect(chips()).toEqual(['dry', 'wet', 'overgrown', 'crumbling', 'ruined', 'inhabited']);
    expect(screen.queryByRole('group', { name: 'Layout' })).toBeNull();
    expect(screen.queryByRole('radiogroup', { name: 'Secret rooms' })).toBeNull();
    expect(screen.getByRole('radiogroup', { name: 'Size' })).toBeTruthy();
  });

  it('names the tag a refusal comes from', async () => {
    renderPanel(vi.fn(), 'Sunken Vault', 'Features');
    chooseTheme('Cavern');
    await waitFor(() => expect(lastJob().request.theme).toBe('cavern'));
    goTo('Features');
    fireEvent.click(tag('dry'));
    const reason = document.getElementById(tag('inhabited').getAttribute('aria-describedby')!);
    expect(reason?.textContent).toBe('Not available with dry');
  });

  it('hides a tag picked before the theme that ignores it, and gives it back with a theme that takes it', async () => {
    renderPanel();
    chooseTheme('Cavern');
    goTo('Features');
    fireEvent.click(tag('lava'));
    await waitFor(() => expect(lastJob().request.tags).toEqual(['medium', 'lava']));
    chooseTheme('Fortress');
    await waitFor(() => expect(lastJob().request.theme).toBe('fortress'));
    goTo('Features');
    expect(chips()).not.toContain('lava');
    chooseTheme('Cavern');
    await waitFor(() => expect(lastJob().request.theme).toBe('cavern'));
    goTo('Features');
    expect(tag('lava').getAttribute('aria-pressed')).toBe('true');
  });

  it('offers the Cavern neither ruins nor columns, and the Fortress no molten pools', () => {
    renderPanel();
    chooseTheme('Cavern');
    goTo('Features');
    expect(chips().filter((chip) => ['ruined', 'colonnades', 'square'].includes(chip))).toEqual([]);
    expect(refused()).toEqual([]);
    chooseTheme('Fortress');
    goTo('Features');
    expect(chips().filter((chip) => ['lava', 'acid'].includes(chip))).toEqual([]);
    expect(chips()).toContain('string');
  });

  it('offers every tag for Surprise me', () => {
    renderPanel(vi.fn(), 'Sunken Vault', 'Features');
    expect(chips()).toContain('lava');
    expect(chips()).toContain('string');
    expect(chips()).toContain('ruined');
  });

  it('refuses nothing for Surprise me', () => {
    renderPanel(vi.fn(), 'Sunken Vault', 'Features');
    expect(refused()).toEqual([]);
  });

  it('keeps the seed when the theme changes, and persists the theme', async () => {
    renderPanel();
    await waitFor(() => expect(worker.preview).toHaveBeenCalled());
    const seed = lastJob().request.seed;
    chooseTheme('Fortress');
    await waitFor(() => expect(lastJob().request.theme).toBe('fortress'));
    expect(lastJob().request.seed).toBe(seed);
    expect(settings.getDungeonGenerator().theme).toBe('fortress');
  });

  it('names the theme Surprise me picked once the dungeon is there', async () => {
    renderPanel();
    const card = screen.getByRole('radio', { name: 'Surprise me' });
    await waitFor(() => expect(document.getElementById(card.getAttribute('aria-describedby') ?? '')?.textContent).toMatch(/^This time: (Fortress|Haunted Mansion|Cavern)$/));
  });
});

describe('the theme pictures', () => {
  it('draws the whole entry floor of the dungeon asked for in every theme, the chosen one first', async () => {
    settings.setDungeonGenerator({ theme: 'cavern', style: 'night' });
    renderPanel();
    await waitFor(() => expect(thumbnailJobs('themes')).toHaveLength(3));
    const jobs = thumbnailJobs('themes');
    expect(jobs.map((job) => job.request.theme)).toEqual(['cavern', 'fortress', 'mansion']);
    expect(new Set(jobs.map((job) => job.request.seed)).size).toBe(1);
    expect(jobs.every((job) => job.output.kind === 'preview' && job.output.floor === 0 && job.style === dungeonStyle('night'))).toBe(true);
    // Surprise me shows the three, each theme card its own
    await waitFor(() => expect(document.querySelectorAll('.atlas-dungeon-theme canvas:not([hidden])')).toHaveLength(6));
  });

  it('draws nothing anew for a change of theme alone, and anew for another dungeon', async () => {
    renderPanel();
    await waitFor(() => expect(thumbnailJobs('themes')).toHaveLength(3));
    fireEvent.click(screen.getByRole('radio', { name: /^Fortress/ }));
    await act(async () => { await Promise.resolve(); });
    expect(thumbnailJobs('themes')).toHaveLength(3);
    fireEvent.click(within(preview()).getByRole('button', { name: 'New layout' }));
    await waitFor(() => expect(thumbnailJobs('themes')).toHaveLength(6));
    expect(worker.dropThumbnails).toHaveBeenCalledWith('themes');
  });

  it('draws none while another step is shown', async () => {
    renderPanel();
    await waitFor(() => expect(thumbnailJobs('themes')).toHaveLength(3));
    goTo('Features');
    fireEvent.click(tag('overgrown'));
    await waitFor(() => expect(lastJob().request.tags).toEqual(['medium', 'overgrown']));
    expect(thumbnailJobs('themes')).toHaveLength(3);
  });
});

describe('floors, the boss room and five-room dungeons', () => {
  const floorSwitcher = (): HTMLElement | null => screen.queryByRole('radiogroup', { name: 'Floor shown' });

  it('asks for as many floors as the stepper says, one to four', async () => {
    renderPanel(vi.fn(), 'Sunken Vault', 'Layout');
    await waitFor(() => expect(worker.preview).toHaveBeenCalled());
    const fewer = screen.getByRole('button', { name: 'Fewer floors' });
    const more = screen.getByRole('button', { name: 'More floors' });
    expect(lastJob().request.floors).toBe(1);
    expect(fewer.hasAttribute('disabled')).toBe(true);
    for (let floors = 2; floors <= 4; floors++) {
      fireEvent.click(more);
      await waitFor(() => expect(lastJob().request.floors).toBe(floors));
    }
    expect(more.hasAttribute('disabled')).toBe(true);
    fireEvent.click(fewer);
    await waitFor(() => expect(lastJob().request.floors).toBe(3));
  });

  it('shows the floor picked on the card, drawing that floor of the same dungeon', async () => {
    renderPanel(vi.fn(), 'Sunken Vault', 'Layout');
    await waitFor(() => expect(worker.preview).toHaveBeenCalled());
    expect(floorSwitcher()).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'More floors' }));
    const switcher = await within(preview()).findByRole('radiogroup', { name: 'Floor shown' });
    expect(within(switcher).getAllByRole('radio').map((radio) => radio.textContent)).toEqual(['A', 'B']);
    await waitFor(() => expect(exportButton().hasAttribute('disabled')).toBe(false));
    const { request } = lastJob();

    fireEvent.click(within(switcher).getByRole('radio', { name: 'B' }));
    await waitFor(() => expect(lastJob().output).toMatchObject({ kind: 'preview', floor: 1 }));
    expect(lastJob().request).toBe(request);
    expect(within(switcher).getByRole('radio', { name: 'B' }).getAttribute('aria-checked')).toBe('true');
  });

  it('builds the boss room unless switched off', async () => {
    renderPanel(vi.fn(), 'Sunken Vault', 'Layout');
    await waitFor(() => expect(worker.preview).toHaveBeenCalled());
    const boss = screen.getByRole('switch', { name: 'Boss room' });
    expect(boss.getAttribute('aria-checked')).toBe('true');
    expect(lastJob().request.bossRoom).not.toBe(false);
    fireEvent.click(boss);
    await waitFor(() => expect(lastJob().request.bossRoom).toBe(false));
  });

  it('makes a five-room dungeon one floor, its boss room fixed', async () => {
    renderPanel(vi.fn(), 'Sunken Vault', 'Layout');
    await waitFor(() => expect(worker.preview).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: 'More floors' }));
    await screen.findByRole('radiogroup', { name: 'Floor shown' });
    fireEvent.click(screen.getByRole('switch', { name: 'Boss room' }));

    fireEvent.click(screen.getByRole('switch', { name: 'Five-room dungeon' }));
    await waitFor(() => expect(lastJob().request.fiveRoom).toBe(true));
    expect(floorSwitcher()).toBeNull();
    expect(lastJob().output).toMatchObject({ kind: 'preview', floor: 0 });
    const floors = screen.getByRole('group', { name: 'Floors' });
    expect(floors.getAttribute('aria-disabled')).toBe('true');
    expect(floors.querySelector('output')?.textContent).toBe('1');
    const boss = screen.getByRole('switch', { name: 'Boss room' });
    expect([boss.getAttribute('aria-checked'), boss.getAttribute('aria-disabled')]).toEqual(['true', 'true']);

    // Switched off again, the dungeon has the floors asked for before
    fireEvent.click(screen.getByRole('switch', { name: 'Five-room dungeon' }));
    expect(await screen.findByRole('radiogroup', { name: 'Floor shown' })).toBeTruthy();
    expect(screen.getByRole('switch', { name: 'Boss room' }).getAttribute('aria-checked')).toBe('false');
  });

  it('hides the secret rooms right-clicked on the floor shown', async () => {
    const seed = Array.from({ length: 40 }, (_, k) => k + 1)
      .find((candidate) => generateDungeon({ seed: candidate, tags: ['medium'], floors: 2, bossRoom: true, fiveRoom: false }).floors[1]?.rooms.some((room) => room.wing === 'secret'))!;
    vi.mocked(randomSeed).mockReturnValue(seed);
    renderPanel(vi.fn(), 'Sunken Vault', 'Layout');
    fireEvent.click(screen.getByRole('button', { name: 'More floors' }));
    fireEvent.click(within(await screen.findByRole('radiogroup', { name: 'Floor shown' })).getByRole('radio', { name: 'B' }));
    await waitFor(() => expect(lastJob().output).toMatchObject({ floor: 1 }));
    await waitFor(() => expect(exportButton().hasAttribute('disabled')).toBe(false));

    // The answer is 10 px wide at 1 px a cell, the canvas 800 px wide: 80 client px a map pixel
    const model = generateDungeon(lastJob().request);
    const map = mapLayout(model, 1);
    const centre = roomCentre(model.floors[1]!.rooms.find((room) => room.wing === 'secret')!);
    const client = { clientX: (centre.x - map.originCell.x) * 80, clientY: (centre.y - map.originCell.y) * 80 };
    fireEvent.contextMenu(screen.getByRole('img', { name: 'Dungeon preview' }), client);
    fireEvent.click(await screen.findByText('Hide these secret rooms'));
    await waitFor(() => expect(lastJob().model?.floors[1]?.hiddenWings).toHaveLength(1));
    expect(lastJob().model?.floors[0]?.hiddenWings).toBeUndefined();
    expect(lastJob().output).toMatchObject({ floor: 1 });
  });

  it('explains the two switches in a line each', () => {
    renderPanel(vi.fn(), 'Sunken Vault', 'Layout');
    for (const [name, hint] of [['Boss room', 'A large arena'], ['Five-room dungeon', 'Five main rooms']] as const) {
      const id = screen.getByRole('switch', { name }).getAttribute('aria-describedby')!;
      expect(document.getElementById(id)?.textContent).toContain(hint);
    }
  });
});

describe('the style gallery', () => {
  it('offers every style as one radio group, the chosen one checked', () => {
    renderPanel(vi.fn(), 'Sunken Vault', 'Style');
    const group = screen.getByRole('radiogroup', { name: 'Style' });
    const radios = within(group).getAllByRole('radio');
    expect(radios).toHaveLength(DUNGEON_STYLES.length);
    const chosen = within(group).getByRole('radio', { checked: true });
    expect(chosen.textContent).toBe('Scriptorium');
    // Tab reaches only the chosen card
    expect(radios.filter((radio) => radio.tabIndex === 0)).toEqual([chosen]);
  });

  it('keeps the style picked by its id and draws the map in it', async () => {
    renderPanel(vi.fn(), 'Sunken Vault', 'Style');
    fireEvent.click(screen.getByRole('radio', { name: 'Lantern' }));
    expect(settings.getDungeonGenerator().style).toBe('night');
    expect(screen.getByRole('radio', { name: 'Lantern' }).getAttribute('aria-checked')).toBe('true');
    await waitFor(() => expect(lastJob().style).toBe(dungeonStyle('night')));
  });

  it('moves the choice with the arrow keys, Home and End', () => {
    renderPanel(vi.fn(), 'Sunken Vault', 'Style');
    const first = screen.getByRole('radio', { name: 'Scriptorium' });
    fireEvent.keyDown(first, { key: 'ArrowRight' });
    const second = DUNGEON_STYLES[1]!.id;
    expect(settings.getDungeonGenerator().style).toBe(second);
    expect(document.activeElement?.getAttribute('aria-checked')).toBe('true');
    fireEvent.keyDown(document.activeElement!, { key: 'End' });
    expect(settings.getDungeonGenerator().style).toBe(DUNGEON_STYLES.at(-1)!.id);
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
    expect(settings.getDungeonGenerator().style).toBe(DEFAULT_STYLE_ID);
  });

  it('draws the style cards once the theme cards are in, before the Style step', async () => {
    renderPanel();
    await waitFor(() => expect(thumbnailJobs('styles')).toHaveLength(DUNGEON_STYLES.length));
    const order = (group: string): number[] => worker.thumbnail.mock.calls
      .map((call, index) => (call[1] === group ? worker.thumbnail.mock.invocationCallOrder[index]! : -1))
      .filter((at) => at >= 0);
    expect(Math.min(...order('styles'))).toBeGreaterThan(Math.max(...order('themes')));
  });

  it('draws every style on one sample dungeon, made once, the chosen one first', async () => {
    settings.setDungeonGenerator({ style: 'volcanic' });
    renderPanel(vi.fn(), 'Sunken Vault', 'Style');
    await waitFor(() => expect(thumbnailJobs('styles')).toHaveLength(DUNGEON_STYLES.length));
    const [first, ...rest] = thumbnailJobs('styles');
    expect(first!.style).toBe(dungeonStyle('volcanic'));
    expect(first!.model).toBeUndefined();
    expect(new Set(thumbnailJobs('styles').map((job) => job.style)).size).toBe(DUNGEON_STYLES.length);
    expect(thumbnailJobs('styles').every((job) => job.request === SAMPLE_REQUEST && job.view === DEFAULT_VIEW)).toBe(true);
    expect(new Set(rest.map((job) => job.model)).size).toBe(1);
    expect(rest[0]!.model).toBeDefined();
  });

  it('never draws them again for what the GM chooses, nor in the next wizard', async () => {
    renderPanel(vi.fn(), 'Sunken Vault', 'Style');
    await waitFor(() => expect(thumbnailJobs('styles')).toHaveLength(DUNGEON_STYLES.length));
    fireEvent.click(screen.getByText('Map options'));
    fireEvent.click(screen.getByRole('switch', { name: 'Monochrome' }));
    goTo('Features');
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Size' })).getByRole('radio', { name: 'Large' }));
    await waitFor(() => expect(lastJob().request.tags).toEqual(['large']));
    goTo('Style');
    cleanup();
    renderPanel(vi.fn(), 'Sunken Vault', 'Style');
    await act(async () => { await Promise.resolve(); });
    expect(thumbnailJobs('styles')).toHaveLength(DUNGEON_STYLES.length);
    expect(worker.dropThumbnails).not.toHaveBeenCalledWith('styles');
  });
});

describe('the generator state', () => {
  /** A seed of the first `count` whose dungeon has what `fits` asks for. */
  const seedWhere = (count: number, fits: (seed: number) => boolean): number => {
    const seed = Array.from({ length: count }, (_, k) => k + 1).find(fits);
    expect(seed).toBeDefined();
    return seed!;
  };

  it('names the scene with the Name field and keeps the dungeon as it is', () => {
    const { result } = renderHook(() => useDungeonState(app, ' Sunken Vault '));
    expect(result.current.name).toBe('Sunken Vault');
    const request = result.current.request;
    act(() => result.current.setGenerated(request, generateDungeon(request)));
    const model = result.current.model;

    act(() => result.current.setName('Moon Temple'));
    expect(result.current.name).toBe('Moon Temple');
    expect(result.current.request).toBe(request);
    expect(result.current.model).toBe(model);
  });

  it('keeps the hidden wings while only the water changes, and drops them for another seed', () => {
    // A seed whose first floor has a secret wing: the test must not depend on a random one
    vi.mocked(randomSeed).mockReturnValue(seedWhere(60, (seed) => generateDungeon({ seed, tags: ['medium'] }).floors[0]!.rooms.some((room) => room.wing === 'secret')));
    const { result } = renderHook(() => useDungeonState(app));
    const request = result.current.request;
    act(() => result.current.setGenerated(request, generateDungeon(request)));
    const secret = result.current.model!.floors[0]!.rooms.find((room) => room.wing === 'secret')!;
    act(() => result.current.hideWing(0, secret.id));
    expect(result.current.edits.hiddenWings?.length).toBe(1);
    act(() => result.current.setWaterLevel(0.5));
    expect(result.current.edits.hiddenWings?.length).toBe(1);
    vi.mocked(randomSeed).mockReturnValue(999);
    act(() => result.current.newSeed());
    expect(result.current.edits).toEqual({});
  });

  it('hides a secret wing on the floor it lies on', () => {
    vi.mocked(randomSeed).mockReturnValue(seedWhere(40, (seed) => generateDungeon({ seed, tags: ['medium'], floors: 2 }).floors[1]?.rooms.some((room) => room.wing === 'secret') ?? false));
    const { result } = renderHook(() => useDungeonState(app));
    act(() => result.current.setFloors(2));
    const request = result.current.request;
    act(() => result.current.setGenerated(request, generateDungeon(request)));
    const secret = result.current.model!.floors[1]!.rooms.find((room) => room.wing === 'secret')!;
    act(() => result.current.hideWing(1, secret.id));
    expect(result.current.edits.hiddenWings).toEqual([{ floor: 1, wing: expect.any(Number) }]);
    expect(result.current.model!.floors[1]!.hiddenWings).toHaveLength(1);
    expect(result.current.model!.floors[0]!.hiddenWings).toBeUndefined();
  });

  it('shows the deepest floor there is while fewer are asked for, and the one picked again once they are back', () => {
    const { result } = renderHook(() => useDungeonState(app));
    act(() => result.current.setFloors(3));
    act(() => result.current.setFloor(2));
    expect(result.current.floor).toBe(2);
    act(() => result.current.setFloors(2));
    expect(result.current.floor).toBe(1);
    act(() => result.current.setFloors(3));
    expect(result.current.floor).toBe(2);
    act(() => result.current.setFiveRoom(true));
    expect([result.current.floors, result.current.floor]).toEqual([1, 0]);
  });
});
