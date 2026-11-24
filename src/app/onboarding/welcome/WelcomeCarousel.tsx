import React, { useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUpRight } from 'lucide-react';
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
 * holds while the pointer is over it or its window is hidden, and stops for good once the GM picks a slide or moves
 * the focus into it (a chip), so the keyboard can stop it too.
 */
export function WelcomeCarousel(): React.JSX.Element {
  const root = useRef<HTMLDivElement>(null);
  const [pointerOver, setPointerOver] = useState(false);
  const [stopped, setStopped] = useState(false);
  const hidden = useDocumentHidden(root);
  const paused = pointerOver || hidden || stopped;
  const { index, go, elapsed, run } = useSlideTimer(WELCOME_SLIDES.length, paused);
  const leaving = useLeaving(index);
  const pick = (at: number): void => {
    setStopped(true);
    go(at);
  };
  const footStart = useContext(WelcomeFootStart);

  const chips = (
    <div className="atlas-welcome-carousel__chips" role="group" aria-label={t('tour.welcome.slidesLabel')}>
      {WELCOME_SLIDES.map((slide, at) => (
        <button key={slide.id} type="button" className="atlas-welcome-carousel__chip" aria-current={at === index} onClick={() => pick(at)}>
          <span className="atlas-welcome-carousel__chip-name">{t(slide.chip)}</span>
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
      data-stopped={stopped}
      style={timing}
      onFocus={() => setStopped(true)}
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
            onClick={() => pick(at)}
          >
            {/* A new fill for every run of the showing slide's time, started from the time already gone. */}
            {at === index ? <i key={`run-${run}`} style={{ animationDelay: `-${elapsed}ms` }} /> : <i key="still" />}
          </button>
        ))}
      </div>
      {footStart ? createPortal(chips, footStart) : chips}
    </div>
  );
}

function Slide({ slide, state }: { slide: WelcomeSlide; state: SlideState }): React.JSX.Element {
  // Counted each time the slide comes to show, so its picture drifts and its words rise afresh, also when it comes
  // back while still fading out.
  const [showing, setShowing] = useState(0);
  const [wasOn, setWasOn] = useState(state === 'on');
  if ((state === 'on') !== wasOn) {
    setWasOn(state === 'on');
    if (state === 'on') setShowing(showing + 1);
  }
  return (
    <div
      className={`atlas-welcome-slide atlas-welcome-slide--${slide.id}`}
      role="group"
      aria-roledescription="slide"
      aria-label={t(slide.chip)}
      aria-hidden={state !== 'on'}
      inert={state !== 'on'}
      data-state={state}
    >
      <img key={`picture-${showing}`} className="atlas-welcome-slide__picture" src={slide.picture} alt="" draggable={false} />
      {slide.id === 'welcome' && <img key={`sword-${showing}`} className="atlas-welcome-slide__sword" src={swordPicture} alt="" draggable={false} />}
      <div key={`copy-${showing}`} className="atlas-welcome-slide__copy">
        <WelcomeText
          kicker={t(slide.kicker)}
          title={t(slide.title)}
          body={t(slide.body)}
          {...(slide.aside && { aside: { line: t(slide.aside.line), tag: t(slide.aside.tag) } })}
        >
          {slide.links && (
            <div className="atlas-welcome-slide__links">
              {slide.links.map((link) => (
                <button key={link.url} type="button" className="atlas-welcome-slide__link" onClick={() => window.open(link.url)}>
                  {t(link.label)}
                  <ArrowUpRight aria-hidden="true" />
                </button>
              ))}
            </div>
          )}
        </WelcomeText>
      </div>
    </div>
  );
}

/** The slide that was showing until `index` came: it lies under the new one while that fades in, then goes. */
function useLeaving(index: number): number | null {
  const [current, setCurrent] = useState(index);
  const [leaving, setLeaving] = useState<number | null>(null);
  if (index !== current) {
    setLeaving(current);
    setCurrent(index);
  }
  useEffect(() => {
    if (leaving === null) return;
    const timer = window.setTimeout(() => setLeaving(null), CROSSFADE_MS);
    return () => window.clearTimeout(timer);
  }, [leaving, current]);
  return leaving;
}
