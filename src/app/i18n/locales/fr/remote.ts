import type { Translation } from '../../types';

export const remote: Translation = {
  'remote.heading': 'Stream Deck',
  'remote.plugin': 'Plugin Atlas pour Stream Deck',
  'remote.pluginHint': 'Installez-le dans l\'application Stream Deck d\'Elgato, ou dans OpenDeck sous Linux, puis activez le contrôle ci-dessous et associez-le.',
  'remote.pluginGet': 'Obtenir le plugin',
  'remote.enable': 'Contrôler Atlas depuis un Stream Deck',
  'remote.enableHint': 'Permet au plugin Atlas pour Stream Deck, ou à un autre programme de cet ordinateur que vous associez, de lancer des ambiances et de changer les niveaux, de mener le combat, de présenter la carte, de montrer des images et de lancer des dés. Atlas n\'écoute que sur cet ordinateur (127.0.0.1, port {port}) ; rien n\'en sort.',
  'remote.paired': 'Contrôleur associé',
  'remote.pairedWith': '{client}, associé le {date}.',
  'remote.notPaired': 'Aucun pour l\'instant. Appuyez sur Associer avec Atlas dans les réglages du plugin sur votre Stream Deck pendant qu\'Atlas tourne.',
  'remote.revoke': 'Révoquer',
  'remote.revoked': 'Le Stream Deck ne peut plus contrôler Atlas tant qu\'il n\'est pas associé à nouveau.',
  'remote.pairTitle': 'Autoriser {client} à contrôler Atlas ?',
  'remote.pairMessage': 'Un programme de cet ordinateur demande à lancer des ambiances et changer les niveaux, mener le combat, présenter la carte, montrer des images et lancer des dés dans Atlas.',
  'remote.pairHint': 'N\'autorisez que si vous venez d\'appuyer sur Associer sur votre Stream Deck. Vous pouvez révoquer à tout moment dans Réglages → Stream Deck.',
  'remote.allow': 'Autoriser',
  'remote.portTaken': 'Atlas n\'a pas pu écouter le Stream Deck : le port {port} est utilisé par un autre programme.',
  'remote.rollsShown': 'Les joueurs voient maintenant vos jets.',
  'remote.rollsHidden': 'Vos jets sont maintenant cachés aux joueurs.',
};
