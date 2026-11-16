import type { Container } from 'pixi.js';
import { MeasureLabel } from '../utils/measureLabel';
import type { LabelTarget } from '../utils/measureLabelLayout';

/**
 * A measurement's distance as the players read it, where that is another than the GM's: the
 * number of tokens they see in an area, the height of the tokens they see under a ruler's ends.
 * It stands in the GM's label's place and is hidden until what shows the players' picture swaps
 * it in (`MeasurePartsVisibility`). Made with the first reading that differs, and written once
 * for as long as it says the same of the measurement as it is drawn.
 */
export class PlayersLabel {
  private label: MeasureLabel | null = null;
  private text: string | null = null;

  /** `labels` holds it, right above the GM's label `gm`. */
  constructor(private readonly labels: Container, private readonly gm: Container) {}

  /** Its drawing; null until one was written. */
  get view(): Container | null {
    return this.label?.view ?? null;
  }

  /** The measurement was drawn anew: what it says is written again, where the GM's label stands now. */
  drawnAnew(): void {
    this.text = null;
  }

  write(text: string, target: LabelTarget, zoom: number, gridSize: number): void {
    if (text === this.text) return;
    this.text = text;
    if (!this.label) {
      this.label = new MeasureLabel();
      this.label.view.visible = false;
      this.labels.addChildAt(this.label.view, this.labels.getChildIndex(this.gm) + 1);
    }
    this.label.show(text, target, zoom, gridSize);
  }
}
