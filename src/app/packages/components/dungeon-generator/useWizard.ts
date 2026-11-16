import { useEffect, useId, useMemo, useState } from 'react';
import type { App } from 'obsidian';
import type { DungeonStyleId } from '../../../dungeons/styleCatalog';
import { dungeonStyle } from '../../../dungeons/styleCatalog';
import type { ThemeId } from '../../../dungeons/themes/themeTypes';
import { DungeonWorkerClient } from '../../../dungeons/worker/DungeonWorkerClient';
import { usePreviewSize } from './PreviewCanvas';
import { useThumbnailSize } from './StyleGallery';
import { useDungeonState, type DungeonState } from './useDungeonState';
import { useGeneratorActions, type CreatedDungeonScene, type GeneratorActions } from './useGeneratorActions';
import { useMapPreview, type MapPreview } from './useMapPreview';
import { useStyleThumbnails } from './useStyleThumbnails';
import { useThemePreviews } from './useThemePreviews';

export interface WizardOptions {
  app: App;
  collectionId: string;
  /** The name typed where the wizard was opened from: the scene's name to begin with. */
  initialName?: string | undefined;
  onCreated: (scene: CreatedDungeonScene) => void;
  /** A scene is being created: whoever holds the wizard waits for it before letting go. */
  onBusyChange?: ((busy: boolean) => void) | undefined;
}

/** Everything a wizard's panel and preview show, wherever they stand. */
export interface Wizard {
  state: DungeonState;
  actions: GeneratorActions;
  preview: MapPreview;
  thumbnails: ReadonlyMap<DungeonStyleId, ImageBitmap>;
  themePreviews: ReadonlyMap<ThemeId, ImageBitmap>;
  step: number;
  direction: 1 | -1;
  goTo: (step: number) => void;
  titleId: string;
  /** The preview's frame, the style card's art and a theme card's art, measured for what is drawn into them. */
  setFrame: (frame: HTMLDivElement | null) => void;
  setArt: (art: HTMLSpanElement | null) => void;
  setThemeArt: (art: HTMLSpanElement | null) => void;
  /** The panel, focused on the chosen theme once it is first laid out. */
  setPanel: (panel: HTMLElement | null) => void;
}

/**
 * The dungeon wizard's state and drawings: the dungeon asked for, the live map, the style and
 * theme pictures, the step shown and the actions. Shared by the wizard over the map
 * (`DungeonWizard`) and the generator's own tab (`DungeonGeneratorPage`).
 */
export function useWizard({ app, collectionId, initialName, onCreated, onBusyChange }: WizardOptions): Wizard {
  const client = useMemo(() => DungeonWorkerClient.forApp(app), [app]);
  const state = useDungeonState(app, initialName);
  const [{ step, direction }, setPosition] = useState<{ step: number; direction: 1 | -1 }>({ step: 0, direction: 1 });
  const goTo = (next: number): void => setPosition((now) => ({ step: next, direction: next >= now.step ? 1 : -1 }));
  const [frame, setFrame] = useState<HTMLDivElement | null>(null);
  const [art, setArt] = useState<HTMLSpanElement | null>(null);
  const [themeArt, setThemeArt] = useState<HTMLSpanElement | null>(null);
  const [panel, setPanel] = useState<HTMLElement | null>(null);
  const titleId = useId();
  const { settings } = state;

  const preview = useMapPreview(client, {
    request: state.request,
    generated: state.generated,
    model: state.model,
    style: dungeonStyle(settings.style),
    view: settings.view,
    floor: state.floor,
    size: usePreviewSize(frame),
  }, state.setGenerated);
  // Drawn only while the Theme step is shown: every change of the dungeon asks for three of them.
  const themeSize = useThumbnailSize(themeArt);
  const themePreviews = useThemePreviews(client, { request: state.request, style: settings.style, view: settings.view, size: step === 0 ? themeSize : null });
  // Drawn once the theme cards are in (or the GM went on), so those wait for none of them. Theme and
  // style cards share one grid: the theme card measured on the first step gives the style cards' size.
  const styleCardSize = useThumbnailSize(art);
  const thumbnails = useStyleThumbnails(client, styleCardSize ?? (step > 0 || themePreviews.size > 0 ? themeSize : null), settings.style);
  const actions = useGeneratorActions({ app, client, state, collectionId, onCreated, onBusyChange });

  // Opens on the chosen theme, so the arrows run through the themes at once.
  useEffect(() => {
    panel?.querySelector<HTMLElement>('[role="radio"][tabindex="0"]')?.focus({ preventScroll: true });
  }, [panel]);

  return { state, actions, preview, thumbnails, themePreviews, step, direction, goTo, titleId, setFrame, setArt, setThemeArt, setPanel };
}
