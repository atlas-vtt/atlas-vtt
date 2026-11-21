import type { Translation } from '../../types';

export const remote: Translation = {
  'remote.heading': 'Stream Deck',
  'remote.enable': 'Sound mit einem Stream Deck steuern',
  'remote.enableHint': 'Erlaubt dem Atlas-Plugin für Stream Deck oder einem anderen Programm auf diesem Computer, das du koppelst, Stimmungen abzuspielen, zu stoppen, zu pausieren, Titel zu überspringen und Lautstärken zu ändern. Atlas hört nur auf diesem Computer (127.0.0.1, Port {port}); nichts verlässt ihn.',
  'remote.paired': 'Gekoppelter Controller',
  'remote.pairedWith': '{client}, gekoppelt am {date}.',
  'remote.notPaired': 'Noch keiner. Drücke in den Einstellungen des Plugins auf deinem Stream Deck auf „Mit Atlas koppeln“, während Atlas läuft.',
  'remote.revoke': 'Widerrufen',
  'remote.revoked': 'Das Stream Deck kann den Sound erst wieder steuern, wenn es neu gekoppelt wird.',
  'remote.pairTitle': '{client} erlauben, den Sound zu steuern?',
  'remote.pairMessage': 'Ein Programm auf diesem Computer möchte in Atlas Stimmungen abspielen, stoppen, pausieren, Titel überspringen und Lautstärken ändern.',
  'remote.pairHint': 'Erlaube es nur, wenn du gerade auf deinem Stream Deck „Koppeln“ gedrückt hast. Du kannst es jederzeit unter Einstellungen → Stream Deck widerrufen.',
  'remote.allow': 'Erlauben',
  'remote.portTaken': 'Atlas kann nicht auf das Stream Deck hören: Port {port} wird von einem anderen Programm benutzt.',
};
