import React from 'react';
import { cn } from '../../../../utils/cn';
import { useImageReveal } from './useImageReveal';
import './skeleton.scss';

interface RevealImageProps {
  src: string;
  alt: string;
  /**
   * Defer loading until the image nears the viewport, for long lists. Not for a virtual list's
   * cards: its rows mount ahead of the view so that their art is there when they scroll in.
   */
  lazy?: boolean | undefined;
  className?: string | undefined;
  /** Shown in place of an image that could not be loaded. */
  fallback?: React.ReactNode;
}

/**
 * An image whose place is held by a placeholder until it can be painted, and
 * which then fades in over it. The parent is the image's well: positioned, and
 * with the corner radius the placeholder takes over. An image this window has
 * shown before appears at once, so scrolling a list back never flickers.
 */
export function RevealImage({ src, alt, lazy, className, fallback }: RevealImageProps): React.JSX.Element {
  const reveal = useImageReveal(src);
  if (reveal.status === 'failed' && fallback !== undefined) return <>{fallback}</>;

  return (
    <>
      {reveal.fresh && reveal.status !== 'failed' && (
        <span
          className="atlas-image-placeholder"
          data-settled={reveal.status === 'shown' || undefined}
          style={reveal.placeholderStyle}
          aria-hidden="true"
        />
      )}
      <img
        className={cn('atlas-image-reveal', className)}
        src={src}
        alt={alt}
        draggable={false}
        decoding="async"
        loading={lazy ? 'lazy' : undefined}
        {...reveal.imageProps}
      />
    </>
  );
}
