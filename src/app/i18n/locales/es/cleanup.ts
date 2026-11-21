import type { Translation } from '../../types';

export const cleanup: Translation = {
  'cleanup.backgrounds': { one: '{count} fondo de mapa', other: '{count} fondos de mapa' },
  'cleanup.roofs': { one: '{count} tejado', other: '{count} tejados' },
  'cleanup.confirm': '¿Quitar estas referencias del mapa?',
  'cleanup.done': { one: 'Se limpió {count} referencia a un recurso que falta', other: 'Se limpiaron {count} referencias a recursos que faltan' },
  'cleanup.found': 'Se encontraron {found} que apuntan a imágenes que ya no existen.',
  'cleanup.noMapData': 'No se puede acceder a los datos del mapa',
  'cleanup.nothingMissing': 'No falta ningún recurso',
  'cleanup.title': 'Limpiar recursos que faltan',
  'cleanup.tokens': { one: '{count} token', other: '{count} tokens' },
};
