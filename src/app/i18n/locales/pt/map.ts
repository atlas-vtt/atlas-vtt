import type { Translation } from '../../types';

export const map: Translation = {
  'map.loading': 'Carregando mapa…',
  'map.readFailed': 'O Atlas VTT não conseguiu ler {file} ({reason}). Uma cópia foi guardada em {backup}.',
  'map.untitled': 'Mapa sem título',
  'map.loadingShort': 'Carregando mapa…',
  'map.clearing': 'Limpando dados anteriores…',
  'map.loadingImage': 'Carregando imagem do mapa…',
  'map.processing': 'Processando mapa · {percent}%',
  'map.restoring': 'Restaurando dados do mapa…',
  'map.loadingTokens': 'Carregando tokens e alfinetes…',
  'map.alignGrid': 'Alinhar a grade',
  'map.detectingGrid': 'Detectando grade…',
  'map.loadingNTokens': { one: 'Carregando {count} token…', other: 'Carregando {count} tokens…' },
  'map.finalizing': 'Finalizando…',
  'map.noGridFound': 'Nenhuma grade foi encontrada neste mapa, então nenhuma é mostrada.',
  'map.openFailed': 'O Atlas VTT não conseguiu abrir a cena {name} ({reason}).',
  'map.syncLeavesOutFiles': 'O Obsidian Sync deixa de fora as cenas e mapas do Atlas neste dispositivo. Para levá-los, ative "Sincronizar todos os outros tipos" em Configurações → Sincronização em cada dispositivo.',
  'map.imageUnshown': 'O Atlas VTT não conseguiu mostrar a imagem do mapa {file}. {reason}',
  'map.videoTooLarge': 'O mapa animado {file} tem {width} × {height} px, mais do que este dispositivo consegue reproduzir ({side} px por lado). Ele mostra o primeiro quadro.',
  'map.videoUnplayable': 'O mapa animado {file} não pode ser reproduzido aqui, então mostra o primeiro quadro. {reason}',
};
