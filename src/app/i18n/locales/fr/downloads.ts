import type { Translation } from '../../types';

export const downloads: Translation = {
  'downloads.title': 'Téléchargements',
  'downloads.buttonActive': 'Téléchargements, {percent} %',
  'downloads.queued': 'En attente',
  'downloads.percent': '{percent} %',
  'downloads.cancelled': 'Annulé',
  'downloads.failed': 'Échec du téléchargement',
  'downloads.done': 'Terminé · {size}',
  'downloads.amount': '{done} sur {total}',
  'downloads.left': 'reste {time}',
  'downloads.cancel': 'Annuler',
  'downloads.retry': 'Réessayer',
  'downloads.show': 'Afficher',
  'downloads.clear': 'Effacer les terminés',
  'downloads.reason.unavailable': 'Serveur indisponible',
  'downloads.reason.damaged': 'Téléchargement endommagé',
  'downloads.reason.folder': 'Dossier indisponible',
  'downloads.reason.disk': 'Enregistrement impossible',
  'downloads.reason.connection': 'Pas de connexion',
  'downloads.finishedOne': '{title} téléchargé',
  'downloads.finishedMany': { one: '{count} téléchargement terminé', other: '{count} téléchargements terminés' },
};
