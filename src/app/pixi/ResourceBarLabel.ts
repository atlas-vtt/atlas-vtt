import { Container, Text, TextStyle } from 'pixi.js';
import type { ResourceValue } from './tokenValueEditor';

/** Horizontal distance from the bar centre to the near edge of each number, in bar pixels. */
export const RESOURCE_NUMBER_GAP = 1.5;

/**
 * How every resource writes its numbers, on a bar or in a wheel. One style object for all of them:
 * PIXI shares a text's texture only among texts of the same string, resolution and `TextStyle`
 * instance, so the same number on 300 tokens is rasterised and uploaded once. Never change it in place.
 */
export const RESOURCE_NUMBER_STYLE = new TextStyle({
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial',
  fontSize: 18,
  fill: 0xffffff,
  fontWeight: '600',
  stroke: { color: 0x000000, width: 2 },
});
/** The numbers are drawn large and scaled down, so they stay crisp when zoomed in. */
export const RESOURCE_NUMBER_SCALE = 0.333;

/** Current and maximum numbers hugging a central slash, each in its own clickable half of the bar. */
export class ResourceBarLabel extends Container {
  private currentText: Text;
  private separator: Text;
  private maximumText: Text;

  constructor() {
    super();
    this.currentText = this.createNumber('resource-current', 1, -RESOURCE_NUMBER_GAP);
    this.separator = this.createNumber('resource-separator', 0.5, 0);
    this.separator.text = '/';
    this.maximumText = this.createNumber('resource-max', 0, RESOURCE_NUMBER_GAP);
  }

  setValue(value: ResourceValue): void {
    this.currentText.text = String(value.current);
    this.maximumText.text = String(value.max);
    this.layout(false);
  }

  /** A value that does not count: the one number, centred. */
  setFixed(value: number): void {
    this.currentText.text = String(value);
    this.layout(true);
  }

  private layout(fixed: boolean): void {
    this.separator.visible = !fixed;
    this.maximumText.visible = !fixed;
    this.currentText.anchor.x = fixed ? 0.5 : 1;
    this.currentText.position.x = fixed ? 0 : -RESOURCE_NUMBER_GAP;
  }

  /** Rasterisation resolution of the numbers; set only when it changes, since each change re-rasterises. */
  setResolution(resolution: number): void {
    for (const text of this.children) {
      if (text instanceof Text && text.resolution !== resolution) text.resolution = resolution;
    }
  }

  private createNumber(label: string, anchorX: number, x: number): Text {
    const text = new Text({ label, text: '', resolution: 3, style: RESOURCE_NUMBER_STYLE });
    text.anchor.set(anchorX, 0.5);
    text.scale.set(RESOURCE_NUMBER_SCALE);
    text.position.x = x;
    this.addChild(text);
    return text;
  }
}
