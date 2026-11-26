import type { Translation } from '../../types';

export const itemBundle: Translation = {
  'itemBundle.notItem': 'Questo file non è un’esportazione di Atlas.',
  'itemBundle.tooNew': 'Questo file è stato esportato da una versione più recente di Atlas. Aggiorna Atlas per importarlo.',
  'itemBundle.damaged': 'Questo file è danneggiato.',
  'itemBundle.unsafe': 'Questo file contiene un file che Atlas non scriverà: {path}',
  'itemBundle.builtIn': 'Ciò che è incluso in Atlas è già in ogni vault, quindi non viene condiviso.',
  'itemBundle.missing': 'Non è più nel tuo vault.',
  'itemBundle.unreadable': 'Impossibile leggere questo modello.',
  'itemBundle.exported': '{name} salvato come {file}.',
  'itemBundle.exportFailed': 'Esportazione non riuscita: {reason}',
};
