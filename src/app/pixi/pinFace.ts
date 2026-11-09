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
import { PIN_DOT_BELOW } from './pinSizing';

/** A pin as drawn: its view, the name under it where it shows one (not in the view: `PinNameLayer` holds it), and how it turns into a dot and back. */
export interface DrawnPin {
  readonly view: Container;
  readonly name: PinNameLabel | null;
  /** Fits the pin to its badge's diameter on screen: a dot in its tone below `dotBelow`, else its glyph and marks. */
  readonly fitTo: (diameter: number) => void;
  /** Whether it shows its glyph, not a dot: a name stands only under a pin that does. */
  readonly whole: () => boolean;
}

/** The dot's radius inside the badge, which stays around it as its rim. */
const DOT_SHARE = 0.55;

/** A numbered or lettered pin keeps its number down to this diameter on screen: the number is what the map key reads. */
const LABEL_DOT_BELOW = 16;

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

  // The glyph and marks, which a dot hides
  const full = new Container();
  view.addChild(full);
  const icon = resolvePinIcon(pin.icon || 'pin');
  const tone = isPinLabelKind(icon) ? colors.stroke : getPinIconDefinition(icon).tone[isDarkMode ? 'dark' : 'light'];
  const dot = new Graphics().circle(0, 0, badgeRadius * DOT_SHARE).fill(tone);
  dot.visible = false;
  view.addChild(dot);
  if (isPinLabelKind(icon)) {
    const labelText = new Text({
      text: pin.label ?? '',
      style: new TextStyle({ fill: colors.stroke, fontSize: badgeRadius, fontWeight: 'bold', fontFamily: 'Arial, sans-serif' }),
      resolution: 8,
    });
    labelText.anchor.set(0.5);
    // Longer labels ("12", "AB") shrink to stay inside the badge
    labelText.scale.set(Math.min(1, (badgeRadius * 1.5) / labelText.width));
    full.addChild(labelText);
  } else {
    const texture = iconTexture(icon);
    if (texture) {
      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5);
      sprite.setSize(pinSize.iconSize);
      sprite.tint = tone;
      full.addChild(sprite);
    }
  }
  if (marks) {
    if (isEncounterFolderLink(pin.notePath)) full.addChild(createRollMark(badgeRadius, colors));
    else if (pin.readable === true) full.addChild(createReadableMark(badgeRadius, colors));
  }

  // The name stands in a layer of its own above the fog (`PinNameLayer`), placed like the pin
  const name = named && showsPinName(pin) ? new PinNameLabel(pinName(pin)) : null;
  const dotBelow = isPinLabelKind(icon) ? LABEL_DOT_BELOW : PIN_DOT_BELOW;
  const fitTo = (diameter: number): void => {
    const shown = diameter < dotBelow;
    if (dot.visible !== shown) dot.visible = shown;
    if (full.visible === shown) full.visible = !shown;
  };
  return { view, name, fitTo, whole: () => full.visible };
}
