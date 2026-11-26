import { clock, writeText } from './musicClock';

/** Between the hover line and its time, as `.atlas-sound-music__hover-time` sets it (`$spacing-xs + $border-width-s`). */
const LABEL_GAP = 5;

/**
 * The line over a track's waveform where the pointer is, with the time it stands at beside it. Written straight
 * to its elements as the pointer moves; the label goes to the line's left where the wave's end leaves it no room.
 */
export class WaveHover {
  private shownTime = '';

  constructor(private readonly root: HTMLElement, private readonly label: HTMLElement) {}

  /** `share` of a track `frames` long, or null to fade it out. */
  show(share: number | null, frames: number): void {
    if (share === null || frames <= 0) {
      this.root.removeAttribute('data-shown');
      return;
    }
    const wave = this.root.parentElement;
    if (!wave) return;
    const width = wave.clientWidth;
    const scale = this.root.ownerDocument.defaultView?.devicePixelRatio ?? 1;
    // On a device pixel, so the line stays one crisp stroke wherever it stands.
    const x = Math.round(share * width * scale) / scale;
    const time = clock(Math.round(share * frames));
    if (time !== this.shownTime) {
      this.shownTime = time;
      writeText(this.label, time);
    }
    this.root.toggleAttribute('data-flip', x + LABEL_GAP + this.label.offsetWidth > width);
    this.root.setCssProps({ '--atlas-sound-hover-x': `${x}px` });
    this.root.setAttribute('data-shown', '');
  }
}
