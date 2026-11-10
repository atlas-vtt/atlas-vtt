import React, { useEffect, useState } from 'react';
import type { App } from 'obsidian';
import { RevealImage } from '../../../packages/components/primitives/RevealImage';
import { useImageReveal } from '../../../packages/components/primitives/useImageReveal';
import { cn } from '../../../../utils/cn';
import { mapPictureUrl } from './mapPicture';

interface MapPicture {
  url: string | null;
  /** Still being made for the path asked for. */
  pending: boolean;
}

/** The sharp picture of the map image at `path` (`mapPictureUrl`); none for a null path. */
export function useMapPicture(app: App, path: string | null): MapPicture {
  const [made, setMade] = useState<{ path: string; url: string | null } | null>(null);

  useEffect(() => {
    if (path === null) return undefined;
    let current = true;
    void mapPictureUrl(app, path).then((url) => { if (current) setMade({ path, url }); });
    return () => { current = false; };
  }, [app, path]);

  if (path === null) return { url: null, pending: false };
  return made?.path === path ? { url: made.url, pending: false } : { url: null, pending: true };
}

interface MapArtProps {
  app: App;
  /** The map image's vault path, or null while it is not known or there is none. */
  path: string | null;
  /** Whether `path` is still being looked up: a placeholder holds the place meanwhile. */
  pathPending?: boolean;
  /** A small picture shown at once, until the sharp one has faded in over it: a thumbnail. */
  thumbnailUrl?: string | null;
  className?: string;
  /** What stands in the place when there is no picture at all. */
  empty?: React.ReactNode;
}

/**
 * A map's artwork filling its well (a positioned parent, which clips and rounds it): the thumbnail
 * at once, the sharp picture fading in over it once it is made. Decorative: the card around it
 * names what it shows.
 */
export function MapArt({ app, path, pathPending = false, thumbnailUrl = null, className, empty = null }: MapArtProps): React.JSX.Element {
  const sharp = useMapPicture(app, path);
  const reveal = useImageReveal(sharp.url ?? '');
  const waiting = pathPending || sharp.pending;

  if (thumbnailUrl === null && sharp.url === null) {
    return waiting
      ? <span className={cn('atlas-image-placeholder', 'atlas-map-art__waiting')} aria-hidden="true" />
      : <>{empty}</>;
  }

  return (
    <span className={cn('atlas-map-art', className)} aria-hidden="true">
      {thumbnailUrl !== null && <RevealImage src={thumbnailUrl} alt="" className="atlas-map-art__image" fallback={null} />}
      {sharp.url !== null && (
        <img
          className="atlas-image-reveal atlas-map-art__image atlas-map-art__sharp"
          src={sharp.url}
          alt=""
          draggable={false}
          decoding="async"
          {...reveal.imageProps}
        />
      )}
    </span>
  );
}
