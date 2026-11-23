import type { Translation } from '../../types';

export const remote: Translation = {
  'remote.heading': 'Stream Deck',
  'remote.plugin': 'Плагин Atlas для Stream Deck',
  'remote.pluginHint': 'Установите его в приложение Stream Deck от Elgato или в OpenDeck на Linux, затем включите управление ниже и выполните сопряжение.',
  'remote.pluginGet': 'Скачать плагин',
  'remote.enable': 'Управлять Atlas со Stream Deck',
  'remote.enableHint': 'Позволяет плагину Atlas для Stream Deck или другой сопряжённой программе на этом компьютере включать настроения и менять громкость, вести бой, показывать карту и изображения и бросать кости. Atlas слушает только на этом компьютере (127.0.0.1, порт {port}); ничего не покидает его.',
  'remote.paired': 'Сопряжённый контроллер',
  'remote.pairedWith': '{client}, сопряжён {date}.',
  'remote.notPaired': 'Пока нет. Нажмите «Сопряжение с Atlas» в настройках плагина на Stream Deck, пока Atlas запущен.',
  'remote.revoke': 'Отозвать',
  'remote.revoked': 'Stream Deck не сможет управлять Atlas, пока его снова не сопрягут.',
  'remote.pairTitle': 'Разрешить {client} управлять Atlas?',
  'remote.pairMessage': 'Программа на этом компьютере просит включать настроения и менять громкость, вести бой, показывать карту и изображения и бросать кости в Atlas.',
  'remote.pairHint': 'Разрешайте, только если вы только что нажали «Сопряжение» на Stream Deck. Отозвать можно в любой момент в Настройки → Stream Deck.',
  'remote.allow': 'Разрешить',
  'remote.portTaken': 'Atlas не смог слушать Stream Deck: порт {port} занят другой программой.',
  'remote.rollsShown': 'Теперь игроки видят ваши броски.',
  'remote.rollsHidden': 'Теперь ваши броски скрыты от игроков.',
};
