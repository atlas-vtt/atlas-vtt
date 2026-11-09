import { Container, Graphics, Sprite, Text, TextStyle, type Texture } from 'pixi.js';
import type { NotePin } from '../types';
import { pinSize } from '../styles/designTokens';
import { isPinLabelKind } from '../tools/pinLabels';
import { pinName, showsPinName } from '../tools/pinNames';
import { getPinIconDefinition, resolvePinIcon, type PinIconId } from '../types/pinIcons';
import { isEncounterFolderLink } from '../links/atlasLinkTargets';
import { canvasBadgeColors, isDarkTheme } from './utils/canvasBadgeColors';
import { createReadableMark, createRollMark } from './pinBadgeMarks';
import { PinNameLabel } from './pinNameLabel';

/** A pin as drawn: its view, and the name under it where it shows one. */
export interface DrawnPin {
  readonly view: Container;
  readonly name: PinNameLabel | null;
}

export interface PinFaceOptions {
  /** The GM's marks on the badge: a folder of encounters, a pin shown to players. */
  readonly marks: boolean;
  /** The name under the badge, where the pin shows one. */
  readonly named: boolean;
}

/**
 * A pin's face in its group's units: the badge in the theme's colours, its glyph (tinted with the
 * icon's tone) or its sequence label, the GM's marks and its name. The GM's pins and the ones the
 * players' picture shows are drawn alike.
 */
export function drawPinFace(pin: NotePin, iconTexture: (icon: PinIconId) => Texture | null, { marks, named }: PinFaceOptions): DrawnPin {
  const view = new Container();
  const colors = canvasBadgeColors();
  const isDarkMode = isDarkTheme();
  const badgeRadius = pinSize.badgeRadius;

  const badge = new Graphics();
  badge.circle(0, 0, badgeRadius).fill({ color: colors.background, alpha: 0.95 });
  badge.circle(0, 0, badgeRadius).stroke({ width: 0.5, color: colors.stroke, alpha: isDarkMode ? 0.4 : 0.3 });
  view.addChild(badge);

  const icon = resolvePinIcon(pin.icon || 'pin');
  if (isPinLabelKind(icon)) {
    const labelText = new Text({
      text: pin.label ?? '',
      style: new TextStyle({ fill: colors.stroke, fontSize: badgeRadius, fontWeight: 'bold', fontFamily: 'Arial, sans-serif' }),
      resolution: 8,
    });
    labelText.anchor.set(0.5);
    // Longer labels ("12", "AB") shrink to stay inside the badge
    labelText.scale.set(Math.min(1, (badgeRadius * 1.5) / labelText.width));
    view.addChild(labelText);
  } else {
    const texture = iconTexture(icon);
    if (texture) {
      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5);
      sprite.setSize(pinSize.iconSize);
      sprite.tint = getPinIconDefinition(icon).tone[isDarkMode ? 'dark' : 'light'];
      view.addChild(sprite);
    }
  }
  if (marks) {
    if (isEncounterFolderLink(pin.notePath)) view.addChild(createRollMark(badgeRadius, colors));
    else if (pin.readable === true) view.addChild(createReadableMark(badgeRadius, colors));
  }

  let name: PinNameLabel | null = null;
  if (named && showsPinName(pin)) {
    name = new PinNameLabel(pinName(pin));
    view.addChildAt(name.view, 0);
  }
  return { view, name };
}
