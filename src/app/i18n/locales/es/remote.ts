import type { Translation } from '../../types';

export const remote: Translation = {
  'remote.heading': 'Stream Deck',
  'remote.plugin': 'Plugin de Atlas para Stream Deck',
  'remote.pluginHint': 'Instálalo en la app Stream Deck de Elgato, o en OpenDeck en Linux; después activa el control abajo y vincúlalo.',
  'remote.pluginGet': 'Obtener el plugin',
  'remote.enable': 'Controlar Atlas desde un Stream Deck',
  'remote.enableHint': 'Permite que el plugin de Atlas para Stream Deck, u otro programa de este ordenador que vincules, reproduzca ambientes y cambie niveles, lleve el combate, presente el mapa, muestre imágenes y tire dados. Atlas solo escucha en este ordenador (127.0.0.1, puerto {port}); nada sale de él.',
  'remote.paired': 'Controlador vinculado',
  'remote.pairedWith': '{client}, vinculado el {date}.',
  'remote.notPaired': 'Ninguno todavía. Pulsa Vincular con Atlas en los ajustes del plugin en tu Stream Deck mientras Atlas está abierto.',
  'remote.revoke': 'Revocar',
  'remote.revoked': 'El Stream Deck ya no puede controlar Atlas hasta que se vuelva a vincular.',
  'remote.pairTitle': '¿Permitir que {client} controle Atlas?',
  'remote.pairMessage': 'Un programa de este ordenador pide reproducir ambientes y cambiar niveles, llevar el combate, presentar el mapa, mostrar imágenes y tirar dados en Atlas.',
  'remote.pairHint': 'Permítelo solo si acabas de pulsar Vincular en tu Stream Deck. Puedes revocarlo cuando quieras en Ajustes → Stream Deck.',
  'remote.allow': 'Permitir',
  'remote.portTaken': 'Atlas no pudo escuchar al Stream Deck: otro programa usa el puerto {port}.',
  'remote.rollsShown': 'Los jugadores ahora ven tus tiradas.',
  'remote.rollsHidden': 'Tus tiradas ahora están ocultas para los jugadores.',
};
