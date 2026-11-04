import { useEffect, useMemo, useRef, useState } from 'react';
import type { DungeonRequest } from '../../../dungeons/model';
import type { DungeonView } from '../../../dungeons/style';
import { dungeonStyle, type DungeonStyleId } from '../../../dungeons/styleCatalog';
import { THEME_IDS, type ThemeId } from '../../../dungeons/themes/themeTypes';
import type { DungeonJob } from '../../../dungeons/worker/dungeonJob';
import { ThumbnailCache } from './thumbnailCache';
import type { ThumbnailRenderer, ThumbnailSize } from './useStyleThumbnails';

const GROUP = 'themes';
const NONE: ReadonlyMap<ThemeId, ImageBitmap> = new Map();

export interface ThemePreviewInput {
  /** What the wizard asks for; each card draws it in its own theme. */
  request: DungeonRequest;
  style: DungeonStyleId;
  view: DungeonView;
  /** A card's art in device pixels; null while the Theme step is not shown, which draws nothing. */
  size: ThumbnailSize | null;
}

/**
 * A picture of the whole entry floor for every theme: the dungeon the wizard asks for, on the same
 * seed, tags and floors, generated in that theme and drawn in the chosen style by the dungeon
 * worker and its helpers while nothing else waits, and shown together once all are drawn.
 * Another request, style, view or card size drops the pictures still asked for; those drawn are
 * kept for the last two, so going back to one draws nothing.
 */
export function useThemePreviews(renderer: ThumbnailRenderer, input: ThemePreviewInput): ReadonlyMap<ThemeId, ImageBitmap> {
  const cache = useRef<ThumbnailCache<ThemeId> | null>(null);
  cache.current ??= new ThumbnailCache<ThemeId>(THEME_IDS);
  const [, redraw] = useState(0);
  const { request, style, view, size } = input;
  // The theme picked is the one thing a card changes, so it is left out of the picture.
  const picture = useMemo(() => {
    if (!size) return null;
    const { theme: _theme, ...rest } = request;
    return `${JSON.stringify(rest)}|${style}|${JSON.stringify(view)}|${size.width}x${size.height}@${size.ratio}`;
  }, [request, style, view, size]);
  // Read when the picture changes; a change of theme alone draws nothing anew.
  const latest = useRef(input);
  latest.current = input;

  useEffect(() => {
    const now = latest.current;
    if (!picture || !now.size) return undefined;
    const { width, height } = now.size;
    const kept = cache.current!.of(picture);
    // The chosen theme first: its card is the one looked at
    const missing = THEME_IDS.filter((theme) => !kept.has(theme))
      .sort((a, b) => Number(b === now.request.theme) - Number(a === now.request.theme));
    let live = true;
    for (const theme of missing) {
      const job: DungeonJob = {
        request: { ...now.request, theme },
        style: dungeonStyle(now.style),
        view: now.view,
        output: { kind: 'preview', width, height, floor: 0 },
      };
      renderer.thumbnail(job, GROUP).then((result) => {
        if (!result || result.image.type !== 'bitmap') return;
        if (cache.current!.put(picture, theme, result.image.bitmap) && live) redraw((n) => n + 1);
      }, (error: unknown) => {
        console.error('[Atlas] A dungeon theme preview could not be drawn', error);
        if (cache.current!.fail(picture, theme) && live) redraw((n) => n + 1);
      });
    }
    return () => {
      live = false;
      renderer.dropThumbnails(GROUP);
    };
  }, [renderer, picture]);

  useEffect(() => () => cache.current?.clear(), []);

  return picture ? cache.current.shown(picture) : NONE;
}
