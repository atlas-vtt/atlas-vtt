import React, { useContext, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { WelcomeText } from './welcomePages';
import { CROSSFADE_MS, SLIDE_MS, WELCOME_SLIDES, type WelcomeSlide } from './welcomeSlides';
import { useDocumentHidden, useSlideTimer } from './useSlideTimer';
import { WelcomeFootStart } from './welcomeFoot';
import swordPicture from '../../assets/brand/sword.webp';
import { t } from '../../i18n';
import './carousel.scss';

/** A slide that shows, the one that fades out under it, or one that waits. */
type SlideState = 'on' | 'leaving' | 'off';

/**
 * The welcome wizard's first page: what Atlas does, one picture at a time across the whole dialog. A slide shows for
 * `SLIDE_MS`, then the next fades in over it; the story bars at the top and the chips at the foot jump to a slide. It
 * holds while the pointer is over it or its window is hidden.
 */
export function WelcomeCarousel(): React.JSX.Element {
  const root = useRef<HTMLDivElement>(null);
  const [pointerOver, setPointerOver] = useState(false);
  const hidden = useDocumentHidden(root);
  const paused = pointerOver || hidden;
  const { index, go } = useSlideTimer(WELCOME_SLIDES.length, paused);
  const leaving = usePrevious(index);
  const footStart = useContext(WelcomeFootStart);

  const chips = (
    <div className="atlas-welcome-carousel__chips" role="group" aria-label={t('tour.welcome.slidesLabel')}>
      {WELCOME_SLIDES.map((slide, at) => (
        <button key={slide.id} type="button" className="atlas-welcome-carousel__chip" aria-current={at === index} onClick={() => go(at)}>
          {t(slide.chip)}
        </button>
      ))}
    </div>
  );

  const timing = { '--atlas-slide-ms': `${SLIDE_MS}ms`, '--atlas-crossfade-ms': `${CROSSFADE_MS}ms` } as React.CSSProperties;
  return (
    <div
      ref={root}
      className="atlas-welcome-carousel"
      role="region"
      aria-roledescription="carousel"
      aria-label={t('tour.welcome.carouselLabel')}
      data-paused={paused}
      style={timing}
      onPointerEnter={() => setPointerOver(true)}
      onPointerLeave={() => setPointerOver(false)}
    >
      {WELCOME_SLIDES.map((slide, at) => (
        <Slide key={slide.id} slide={slide} state={at === index ? 'on' : at === leaving ? 'leaving' : 'off'} />
      ))}
      {/* The chips name the slides for assistive technology; the bars are the same jumps for the pointer. */}
      <div className="atlas-welcome-carousel__stories" aria-hidden="true">
        {WELCOME_SLIDES.map((slide, at) => (
          <button
            key={slide.id}
            type="button"
            tabIndex={-1}
            className="atlas-welcome-carousel__story"
            data-state={at < index ? 'done' : at === index ? 'on' : 'next'}
            onClick={() => go(at)}
          >
            {/* A new fill for the slide that starts, so its animation starts from empty. */}
            <i key={at === index ? 'filling' : 'still'} />
          </button>
        ))}
      </div>
      {footStart ? createPortal(chips, footStart) : chips}
    </div>
  );
}

function Slide({ slide, state }: { slide: WelcomeSlide; state: SlideState }): React.JSX.Element {
  return (
    <div
      className={`atlas-welcome-slide atlas-welcome-slide--${slide.id}`}
      role="group"
      aria-roledescription="slide"
      aria-label={t(slide.chip)}
      aria-hidden={state !== 'on'}
      data-state={state}
    >
      <img className="atlas-welcome-slide__picture" src={slide.picture} alt="" draggable={false} />
      {slide.id === 'welcome' && <img className="atlas-welcome-slide__sword" src={swordPicture} alt="" draggable={false} />}
      <div className="atlas-welcome-slide__copy">
        <WelcomeText kicker={t(slide.kicker)} title={t(slide.title)} body={t(slide.body)} />
      </div>
    </div>
  );
}

/** The value before the last change: the slide that was showing until the current one came. */
function usePrevious(value: number): number | null {
  const [current, setCurrent] = useState(value);
  const [previous, setPrevious] = useState<number | null>(null);
  if (value !== current) {
    setPrevious(current);
    setCurrent(value);
  }
  return previous;
}
