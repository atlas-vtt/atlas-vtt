import { isPinLabelKind } from '../../../tools/pinLabels';
import type { NotePin } from '../../../types';
import { resolvePinIcon } from '../../../types/pinIcons';

/** The face of a GM's pin as players are sent it, so they see the pin the GM sees. */
export interface SentPinFace {
  /** Its icon as Atlas reads a stored one. */
  readonly icon: string;
  /** The label of a numbered or lettered pin. */
  readonly label?: string;
}

/**
 * A pin's face as players are sent it: its icon as Atlas reads it, and with a numbered or lettered pin
 * its label. One without a label shows Atlas's own pin, as it would draw no text on its badge.
 */
export function sentPinFace(pin: Pick<NotePin, 'icon' | 'label'>): SentPinFace {
  const icon = resolvePinIcon(pin.icon);
  if (!isPinLabelKind(icon)) return { icon };
  return pin.label ? { icon, label: pin.label } : { icon: 'pin' };
}
