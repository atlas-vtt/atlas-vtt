import type { Translation } from '../../types';

export const map: Translation = {
  'map.loading': 'Cargando mapa…',
  'map.readFailed': 'Atlas VTT no pudo leer {file} ({reason}). Se guardó una copia en {backup}.',
  'map.untitled': 'Mapa sin título',
  'map.loadingShort': 'Cargando mapa…',
  'map.clearing': 'Borrando datos anteriores…',
  'map.loadingImage': 'Cargando imagen del mapa…',
  'map.processing': 'Procesando mapa · {percent}%',
  'map.restoring': 'Restaurando datos del mapa…',
  'map.loadingTokens': 'Cargando tokens y chinchetas…',
  'map.alignGrid': 'Alinear la cuadrícula',
  'map.detectingGrid': 'Detectando cuadrícula…',
  'map.loadingNTokens': { one: 'Cargando {count} token…', other: 'Cargando {count} tokens…' },
  'map.finalizing': 'Terminando…',
  'map.noGridFound': 'No se encontró ninguna cuadrícula en este mapa, así que no se muestra ninguna.',
  'map.openFailed': 'Atlas VTT no pudo abrir la escena {name} ({reason}).',
  'map.syncLeavesOutFiles': 'Obsidian Sync no sincroniza las escenas y los mapas de Atlas en este dispositivo. Para incluirlos, activa "Sincronizar todos los demás tipos" en Ajustes → Sincronización en cada dispositivo.',
  'map.imageUnshown': 'Atlas VTT no pudo mostrar la imagen del mapa {file}. {reason}',
  'map.videoTooLarge': 'El mapa animado {file} mide {width} × {height} px, más de lo que este dispositivo puede reproducir ({side} px por lado). Muestra su primer fotograma.',
  'map.videoUnplayable': 'El mapa animado {file} no se puede reproducir aquí, así que muestra su primer fotograma. {reason}',
};
