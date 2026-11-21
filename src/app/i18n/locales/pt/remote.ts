import type { Translation } from '../../types';

export const remote: Translation = {
  'remote.heading': 'Stream Deck',
  'remote.plugin': 'Plugin do Atlas para Stream Deck',
  'remote.pluginHint': 'Instale-o no app Stream Deck da Elgato, ou no OpenDeck no Linux; depois ative o controle abaixo e emparelhe-o.',
  'remote.pluginGet': 'Obter o plugin',
  'remote.enable': 'Controlar o som por um Stream Deck',
  'remote.enableHint': 'Permite que o plugin do Atlas para Stream Deck, ou outro programa deste computador que você emparelhar, toque ambientações, pare, pause, pule faixas e mude níveis. O Atlas escuta só neste computador (127.0.0.1, porta {port}); nada sai dele.',
  'remote.paired': 'Controle emparelhado',
  'remote.pairedWith': '{client}, emparelhado em {date}.',
  'remote.notPaired': 'Nenhum ainda. Pressione Emparelhar com o Atlas nas configurações do plugin no seu Stream Deck com o Atlas aberto.',
  'remote.revoke': 'Revogar',
  'remote.revoked': 'O Stream Deck não pode mais controlar o som até ser emparelhado de novo.',
  'remote.pairTitle': 'Permitir que {client} controle o som?',
  'remote.pairMessage': 'Um programa deste computador pede para tocar ambientações, parar, pausar, pular faixas e mudar níveis no Atlas.',
  'remote.pairHint': 'Permita só se você acabou de pressionar Emparelhar no seu Stream Deck. Você pode revogar a qualquer momento em Configurações → Stream Deck.',
  'remote.allow': 'Permitir',
  'remote.portTaken': 'O Atlas não conseguiu escutar o Stream Deck: a porta {port} está em uso por outro programa.',
};
