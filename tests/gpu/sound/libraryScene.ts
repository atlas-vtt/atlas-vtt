import { act } from '@testing-library/react';
import css from '../../../styles/main.scss?inline';
import toneUrl from '../../fixtures/sound/tone220-3s.ogg?url';
import { libraryRig, type LibraryRig, type LibraryRigOptions } from '../../helpers/libraryRig';

const SHARED = `
  body { margin: 0; font: var(--font-ui-small)/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: var(--text-normal); background: #0b0907;
    --radius-s: 4px; --radius-m: 8px; --radius-l: 12px; --radius-xl: 24px; --corner-shape: squircle; --cursor: pointer;
    --font-ui-smaller: 12px; --font-ui-small: 13px; --font-ui-medium: 15px; --font-ui-large: 20px; --input-height: 30px; --line-height-tight: 1.3;
    --font-normal: 400; --font-medium: 500; --font-semibold: 600; --font-bold: 700; --font-interface: -apple-system, BlinkMacSystemFont, sans-serif; }
  button, input { corner-shape: var(--corner-shape); font: inherit; color: inherit; }
  button { height: 30px; padding: 4px 12px; border: 0; border-radius: var(--radius-m); background: var(--interactive-normal); box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2); }
  input[type='search'] { height: 30px; padding: 0 8px; border: 1px solid var(--background-modifier-border); border-radius: var(--radius-m); background: var(--background-modifier-form-field); }
`;

/** The Atlas theme's values, as the owner's look is judged by them. */
export const ATLAS_DARK = `${SHARED}
  body { --background-primary: #201b15; --background-primary-alt: #262019; --background-secondary: #2b241c; --background-secondary-alt: #322a20; --background-modifier-border: #4a4030; --background-modifier-border-focus: #a89878;
    --background-modifier-hover: rgba(240, 230, 208, 0.08); --background-modifier-form-field: #17130e; --interactive-normal: #2b241c; --text-normal: #ded2b8; --text-muted: #a89878; --text-faint: #7d6f55; --text-warning: #e3b341; --mono-100: #f0e6d0;
    --text-on-accent: #fff; --interactive-accent: hsl(0, 69%, 57%); --text-accent: hsl(0, 69%, 67%); --h3-font: 'Atlas Fantaisie Artistique', Georgia, serif; }`;

export const OBSIDIAN_LIGHT = `${SHARED}
  body { background: #e9e9e9; --background-primary: #ffffff; --background-primary-alt: #fafafa; --background-secondary: #f2f2f2; --background-secondary-alt: #e3e3e3; --background-modifier-border: #e0e0e0; --background-modifier-border-focus: #9f8cf0;
    --background-modifier-hover: rgba(0, 0, 0, 0.05); --background-modifier-form-field: #ffffff; --interactive-normal: #ffffff; --text-normal: #222222; --text-muted: #5c5c5c; --text-faint: #8a8a8a; --text-warning: #b8791a; --mono-100: #000000;
    --text-on-accent: #fff; --interactive-accent: #705dcf; --text-accent: #705dcf; --h3-font: 'Atlas Fantaisie Artistique', Georgia, serif; }`;

/** The page's room: the DM screen's container, with no inset, so the surface is as wide as asked. */
export function stageFrame(theme: string, width = 1644, height = 960): { host: HTMLElement; remove: () => void } {
  const style = document.createElement('style');
  style.textContent = theme + css + `
    .lib-frame { position: absolute; inset: 0; width: ${width}px; height: ${height}px; background: #080706; display: flex; flex-direction: column; container: atlas-dm-screen / size; --atlas-dm-screen-inset: 0px; }`;
  document.head.append(style);
  document.body.classList.toggle('theme-light', theme === OBSIDIAN_LIGHT);
  document.body.classList.toggle('theme-dark', theme !== OBSIDIAN_LIGHT);
  const frame = document.body.createDiv({ cls: 'atlas-vtt-plugin lib-frame workspace-leaf mod-active' });
  return { host: frame, remove: () => { frame.remove(); style.remove(); document.body.classList.remove('theme-light'); } };
}

const BATTLE: ReadonlyArray<[string, number]> = [['Blood on the ford', 222], ['Steel in the reeds', 258], ['The last gate', 365], ['Riders at the treeline', 178], ['Shield wall', 311], ['Under siege', 444], ['No quarter', 187], ['Horns over the ridge', 289]];

const secondsByName = new Map(BATTLE.map(([name, seconds]) => [name, seconds]));

/** The mock's library, with real copies: a track that plays was really converted from the fixture. */
export async function mockLibrary(options: LibraryRigOptions = {}): Promise<LibraryRig> {
  const rig = await libraryRig({ ...MOCK_LIBRARY, ...options });
  await fillMockLibrary(rig.locations);
  return rig;
}

export const MOCK_LIBRARY: LibraryRigOptions = {
  local: { music: '/Users/gm/Music/Tabletop' },
  shared: { music: { type: 'external' }, ambience: { type: 'vault', path: 'Audio/Ambience' } },
  seconds: (url) => secondsByName.get(decodeURIComponent(url).replace(/^.*\//, '').replace(/\.[^.]*$/, '')) ?? 200,
};

/** The mock's folders and files, whose reads give a real fixture. */
export async function fillMockLibrary(locations: LibraryRig['locations']): Promise<void> {
  const bytes = await (await fetch(toneUrl)).blob();
  const never = new Promise<Blob>(() => undefined);
  locations.music.blobOf = (path) => (path.includes('Under siege') ? never : Promise.resolve(bytes));
  for (const [name] of BATTLE) locations.music.addFile(`Battle/${name}.ogg`, 4_000_000);
  for (let index = 1; index <= 5; index++) locations.music.addFile(`Battle/Bosses/Boss ${index}.ogg`);
  locations.music.addFile('Battle/Horns again.mp3');
  const counts: ReadonlyArray<[string, number]> = [['Taverns', 9], ['Travel', 22], ['Wonder', 6], ['Dread', 7]];
  for (const [folder, count] of counts) for (let index = 1; index <= count; index++) locations.music.addFile(`${folder}/Track ${index}.ogg`);
  const ambience: ReadonlyArray<[string, number]> = [['Weather', 31], ['Towns', 18], ['Wilds', 44], ['Dungeons', 28]];
  for (const [folder, count] of ambience) for (let index = 1; index <= count; index++) locations.ambience.addFile(`${folder}/Loop ${index}.ogg`);
}

export const settled = async (): Promise<void> => {
  await act(async () => { await new Promise((resolve) => { window.setTimeout(resolve, 80); }); });
};
