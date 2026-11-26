import type { Translation } from '../../types';

export const map: Translation = {
  'map.loading': 'Chargement de la carte…',
  'map.readFailed': 'Atlas VTT n\'a pas pu lire {file} ({reason}). Une copie a été conservée dans {backup}.',
  'map.untitled': 'Carte sans titre',
  'map.loadingShort': 'Chargement de la carte…',
  'map.clearing': 'Effacement des données précédentes…',
  'map.loadingImage': 'Chargement de l\'image de la carte…',
  'map.processing': 'Traitement de la carte · {percent} %',
  'map.restoring': 'Restauration des données de la carte…',
  'map.loadingTokens': 'Chargement des jetons et des épingles…',
  'map.alignGrid': 'Aligner la grille',
  'map.detectingGrid': 'Détection de la grille…',
  'map.loadingNTokens': { one: 'Chargement de {count} jeton…', other: 'Chargement de {count} jetons…' },
  'map.finalizing': 'Finalisation…',
  'map.noGridFound': 'Aucune grille n\'a été trouvée sur cette carte, aucune n\'est donc affichée.',
  'map.openFailed': 'Atlas VTT n\'a pas pu ouvrir la scène {name} ({reason}).',
  'map.syncLeavesOutFiles': 'Obsidian Sync ignore les scènes et cartes d\'Atlas sur cet appareil. Pour les synchroniser, activez « Synchroniser tous les autres types » dans Paramètres → Synchronisation sur chaque appareil.',
  'map.imageUnshown': 'Atlas VTT n\'a pas pu afficher l\'image de carte {file}. {reason}',
  'map.videoTooLarge': 'La carte animée {file} fait {width} × {height} px, plus que ce que cet appareil peut lire ({side} px de côté). Sa première image est affichée.',
  'map.videoUnplayable': 'La carte animée {file} ne peut pas être lue ici, sa première image est donc affichée. {reason}',
};
