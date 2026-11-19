import type { Translation } from '../../types';

export const cleanup: Translation = {
  'cleanup.backgrounds': { one: '{count} fond de carte', other: '{count} fonds de carte' },
  'cleanup.roofs': { one: '{count} toit', other: '{count} toits' },
  'cleanup.confirm': 'Retirer ces références de la carte ?',
  'cleanup.done': { one: '{count} référence à une ressource manquante supprimée', other: '{count} références à des ressources manquantes supprimées' },
  'cleanup.found': 'Trouvé : {found}, qui pointent vers des images qui n\'existent plus.',
  'cleanup.noMapData': 'Impossible d\'accéder aux données de la carte',
  'cleanup.nothingMissing': 'Aucune ressource manquante trouvée',
  'cleanup.title': 'Nettoyer les ressources manquantes',
  'cleanup.tokens': { one: '{count} jeton', other: '{count} jetons' },
};
