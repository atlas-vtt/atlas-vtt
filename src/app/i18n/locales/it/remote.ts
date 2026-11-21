import type { Translation } from '../../types';

export const remote: Translation = {
  'remote.heading': 'Stream Deck',
  'remote.plugin': 'Plugin di Atlas per Stream Deck',
  'remote.pluginHint': 'Installalo nell\'app Stream Deck di Elgato, o in OpenDeck su Linux, poi attiva il controllo qui sotto e associalo.',
  'remote.pluginGet': 'Ottieni il plugin',
  'remote.enable': 'Controlla il suono da uno Stream Deck',
  'remote.enableHint': 'Consente al plugin di Atlas per Stream Deck, o a un altro programma di questo computer che associ, di avviare atmosfere, fermare, mettere in pausa, saltare brani e cambiare i livelli. Atlas ascolta solo su questo computer (127.0.0.1, porta {port}); niente ne esce.',
  'remote.paired': 'Controller associato',
  'remote.pairedWith': '{client}, associato il {date}.',
  'remote.notPaired': 'Ancora nessuno. Premi Associa con Atlas nelle impostazioni del plugin sul tuo Stream Deck mentre Atlas è aperto.',
  'remote.revoke': 'Revoca',
  'remote.revoked': 'Lo Stream Deck non può più controllare il suono finché non viene associato di nuovo.',
  'remote.pairTitle': 'Consentire a {client} di controllare il suono?',
  'remote.pairMessage': 'Un programma di questo computer chiede di avviare atmosfere, fermare, mettere in pausa, saltare brani e cambiare i livelli in Atlas.',
  'remote.pairHint': 'Consenti solo se hai appena premuto Associa sul tuo Stream Deck. Puoi revocarlo quando vuoi in Impostazioni → Stream Deck.',
  'remote.allow': 'Consenti',
  'remote.portTaken': 'Atlas non è riuscito ad ascoltare lo Stream Deck: la porta {port} è usata da un altro programma.',
};
