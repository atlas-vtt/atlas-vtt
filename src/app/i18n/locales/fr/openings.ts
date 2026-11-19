import type { Translation } from '../../types';

export const openings: Translation = {
  'openings.mode': 'Ouvertures',
  'openings.needsLevels': 'Les ouvertures donnent sur le niveau du dessous : ajoutez d\'abord un niveau à la scène',
  'openings.title': 'Ouverture',
  'openings.kind': 'Nature de cette zone',
  'openings.open': 'Ouvert vers le bas',
  'openings.floor': 'Sol',
  'openings.chasm': 'Aucun niveau ne se trouve sous celui-ci : l\'ouverture apparaît en noir et les jetons posés dedans y restent.',
  'openings.full': 'Un niveau contient au plus {count} ouvertures et sols. Supprimez-en pour en dessiner d\'autres.',
  'openings.fell': { one: '{count} jeton est tombé jusqu\'à {name}', other: '{count} jetons sont tombés jusqu\'à {name}' },
};
