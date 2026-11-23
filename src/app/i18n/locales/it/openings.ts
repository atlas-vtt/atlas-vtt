import type { Translation } from '../../types';

export const openings: Translation = {
  'openings.mode': 'Aperture',
  'openings.needsLevels': 'Le aperture guardano sul livello sottostante: aggiungi prima un livello alla scena',
  'openings.title': 'Apertura',
  'openings.kind': 'Cos’è quest’area',
  'openings.open': 'Aperta verso il basso',
  'openings.floor': 'Pavimento',
  'openings.chasm': 'Sotto questo livello non c’è alcun livello: l’apertura appare nera e i token posati al suo interno restano dove sono.',
  'openings.full': 'Un livello contiene al massimo {count} aperture e pavimenti. Eliminane alcuni per disegnarne altri.',
  'openings.fell': { one: '{count} token è caduto fino a {name}', other: '{count} token sono caduti fino a {name}' },
};
