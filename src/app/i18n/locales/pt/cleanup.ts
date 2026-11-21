import type { Translation } from '../../types';

export const cleanup: Translation = {
  'cleanup.backgrounds': { one: '{count} fundo de mapa', other: '{count} fundos de mapa' },
  'cleanup.roofs': { one: '{count} telhado', other: '{count} telhados' },
  'cleanup.confirm': 'Remover estas referências do mapa?',
  'cleanup.done': { one: '{count} referência a asset ausente removida', other: '{count} referências a assets ausentes removidas' },
  'cleanup.found': 'Foram encontradas referências a imagens que não existem mais: {found}.',
  'cleanup.noMapData': 'Não foi possível acessar os dados do mapa',
  'cleanup.nothingMissing': 'Nenhum asset ausente encontrado',
  'cleanup.title': 'Limpar assets ausentes',
  'cleanup.tokens': { one: '{count} token', other: '{count} tokens' },
};
