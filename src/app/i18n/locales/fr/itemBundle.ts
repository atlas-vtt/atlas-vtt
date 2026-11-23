import type { Translation } from '../../types';

export const itemBundle: Translation = {
  'itemBundle.notItem': 'Ce fichier n\'est pas un export d\'Atlas.',
  'itemBundle.tooNew': 'Ce fichier a été exporté par une version plus récente d\'Atlas. Mettez Atlas à jour pour l\'importer.',
  'itemBundle.damaged': 'Ce fichier est endommagé.',
  'itemBundle.unsafe': 'Ce fichier contient un fichier qu\'Atlas n\'écrira pas : {path}',
  'itemBundle.builtIn': 'Ce qui est intégré à Atlas se trouve déjà dans chaque coffre, il n\'est donc pas partagé.',
  'itemBundle.missing': 'Ceci n\'est plus dans votre coffre.',
  'itemBundle.unreadable': 'Impossible de lire ce modèle.',
  'itemBundle.exported': '{name} enregistré sous {file}.',
  'itemBundle.exportFailed': 'Échec de l\'export : {reason}',
};
