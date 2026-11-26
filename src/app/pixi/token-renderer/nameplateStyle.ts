import { TextStyle } from 'pixi.js';
import { NAMEPLATE_TEXT } from './tokenSizing';

const styles = new Map<number, TextStyle>();

/**
 * The nameplates' text style in ink `fill`, one object per ink: PIXI shares a text's texture only
 * among texts of the same string, resolution and `TextStyle` instance, so tokens of one name share
 * one rasterised nameplate. Never change it in place; take the style of the other ink instead.
 */
export function nameplateStyle(fill: number): TextStyle {
  let style = styles.get(fill);
  if (!style) {
    style = new TextStyle({
      fontFamily: NAMEPLATE_TEXT.fontFamily,
      fontSize: NAMEPLATE_TEXT.fontSize,
      fill,
      fontWeight: NAMEPLATE_TEXT.fontWeight,
    });
    styles.set(fill, style);
  }
  return style;
}
