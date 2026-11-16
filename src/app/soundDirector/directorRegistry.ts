import type { App } from 'obsidian';
import type { SoundDirector } from './SoundDirector';

const directors = new WeakMap<App, SoundDirector>();

/** The app's director if one was opened: what else runs without it asks here, and loads nothing of it. */
export const openedDirector = (app: App): SoundDirector | undefined => directors.get(app);

export function noteDirector(app: App, director: SoundDirector | null): void {
  if (director) directors.set(app, director);
  else directors.delete(app);
}
