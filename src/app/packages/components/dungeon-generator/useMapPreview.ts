import { useEffect, useRef, useState } from 'react';
import type { DungeonModel, DungeonRequest } from '../../../dungeons/model';
import type { MapLayout } from '../../../dungeons/render/layoutSize';
import type { DungeonStyle, DungeonView } from '../../../dungeons/style';
import type { DungeonJob, DungeonRendered } from '../../../dungeons/worker/dungeonJob';

/** Draws previews: the dungeon worker, which answers null for a preview a newer one replaced. */
export interface PreviewRenderer {
  preview: (job: DungeonJob) => Promise<DungeonRendered | null>;
}

/** A drawn map and where it lies on the grid. */
export interface MapPicture {
  bitmap: ImageBitmap;
  map: MapLayout;
  /** The dungeon it shows, for hit-testing. */
  model: DungeonModel;
  /** The floor it shows, by index. */
  floor: number;
}

export interface MapPreviewInput {
  request: DungeonRequest;
  /** The dungeon before the GM's edits, once generated; null asks the worker to generate it. */
  generated: DungeonModel | null;
  /** The dungeon as shown, with the GM's edits. */
  model: DungeonModel | null;
  style: DungeonStyle;
  view: DungeonView;
  /** The floor drawn, by index. */
  floor: number;
  /** Device pixels the map is fitted into; null until the preview's frame was measured. */
  size: { width: number; height: number } | null;
}

export interface MapPreview {
  picture: MapPicture | null;
  /** A newer picture is being drawn; the one shown is held until it arrives. */
  drawing: boolean;
  failed: boolean;
}

interface Drawn {
  request: DungeonRequest;
  model: DungeonModel | null;
  style: DungeonStyle;
  view: DungeonView;
  floor: number;
  width: number;
  height: number;
}

const sameDrawing = (a: Drawn | null, b: Drawn): boolean => a !== null
  && a.request === b.request && a.model === b.model && a.style === b.style && a.view === b.view
  && a.floor === b.floor && a.width === b.width && a.height === b.height;

/**
 * The live map preview, fitted into the preview's frame and drawn by the dungeon worker so the
 * panel never loses a frame. The latest change wins: a preview a newer one replaced is never
 * shown, and the last picture stays until the next arrives, so the pane is never empty once it
 * had a picture. The first answer for a request also brings its generated dungeon (`onGenerated`).
 */
export function useMapPreview(renderer: PreviewRenderer, input: MapPreviewInput, onGenerated: (request: DungeonRequest, model: DungeonModel) => void): MapPreview {
  const [picture, setPicture] = useState<MapPicture | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [failed, setFailed] = useState(false);
  const asked = useRef(0);
  const drawn = useRef<Drawn | null>(null);
  const onGeneratedRef = useRef(onGenerated);
  onGeneratedRef.current = onGenerated;
  const { request, generated, model, style, view, floor, size } = input;

  useEffect(() => {
    if (!size) return;
    // The generated dungeon drawn as it came needs no second drawing once it is stored.
    const shown = model === generated ? null : model;
    const next: Drawn = { request, model: generated ? shown : null, style, view, floor, width: size.width, height: size.height };
    if (generated && model === generated && sameDrawing(drawn.current, { ...next, model: null })) return;
    const id = ++asked.current;
    setDrawing(true);
    const job: DungeonJob = { request, ...(generated && model ? { model } : {}), style, view, output: { kind: 'preview', width: size.width, height: size.height, floor } };
    renderer.preview(job).then((result) => {
      if (!result) return;
      if (id !== asked.current || result.image.type !== 'bitmap') {
        if (result.image.type === 'bitmap') result.image.bitmap.close();
        return;
      }
      drawn.current = next;
      const bitmap = result.image.bitmap;
      setPicture((old) => {
        old?.bitmap.close();
        return { bitmap, map: result.map, model: result.model, floor };
      });
      setFailed(false);
      setDrawing(false);
      if (!generated) onGeneratedRef.current(request, result.model);
    }, (error: unknown) => {
      if (id !== asked.current) return;
      console.error('[Atlas] The dungeon preview could not be drawn', error);
      setFailed(true);
      setDrawing(false);
    });
  }, [renderer, request, generated, model, style, view, floor, size]);

  // The last picture's pixels go with the panel.
  const pictureRef = useRef(picture);
  pictureRef.current = picture;
  useEffect(() => () => {
    // A preview answering after the panel closed is stale too, so its bitmap is closed on arrival
    asked.current++;
    pictureRef.current?.bitmap.close();
  }, []);

  return { picture, drawing, failed };
}
