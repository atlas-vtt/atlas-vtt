import type { Translation } from '../../types';

export const openings: Translation = {
  'openings.mode': 'Aberturas',
  'openings.needsLevels': 'Las aberturas miran a la planta de abajo: añade primero una planta a la escena',
  'openings.title': 'Abertura',
  'openings.kind': 'Qué es esta zona',
  'openings.open': 'Abierta hacia abajo',
  'openings.floor': 'Suelo',
  'openings.chasm': 'No hay ninguna planta debajo de esta: la abertura se ve negra y los tokens que se dejan en ella se quedan ahí.',
  'openings.full': 'Una planta admite como máximo {count} aberturas y suelos. Elimina alguna para dibujar más.',
  'openings.fell': { one: '{count} token cayó a {name}', other: '{count} tokens cayeron a {name}' },
};
