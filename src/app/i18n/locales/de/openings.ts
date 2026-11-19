import type { Translation } from '../../types';

export const openings: Translation = {
  'openings.mode': 'Öffnungen',
  'openings.needsLevels': 'Öffnungen blicken auf die Ebene darunter: Füge der Szene zuerst eine Ebene hinzu',
  'openings.title': 'Öffnung',
  'openings.kind': 'Was dieser Bereich ist',
  'openings.open': 'Nach unten offen',
  'openings.floor': 'Boden',
  'openings.chasm': 'Unter dieser Ebene liegt keine: Die Öffnung erscheint schwarz, und Tokens, die darin abgelegt werden, bleiben dort.',
  'openings.full': 'Eine Ebene hat höchstens {count} Öffnungen und Böden. Lösche welche, um mehr zu zeichnen.',
  'openings.fell': { one: '{count} Token ist nach {name} durchgefallen', other: '{count} Tokens sind nach {name} durchgefallen' },
};
