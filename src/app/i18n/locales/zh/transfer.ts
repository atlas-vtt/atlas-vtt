import type { Translation } from '../../types';

export const transfer: Translation = {
  'transfer.andScenes': { other: '{what}以及 {count} 个链接的场景' },
  'transfer.copied': '已把{what}复制到{target}',
  'transfer.copy.withScenes': { other: '连同 {count} 个链接的场景一起复制' },
  'transfer.copy.withoutLinks': '复制但不保留链接',
  'transfer.copyFailed': '无法复制{what}：{error}',
  'transfer.linked.copy': { other: '{subject}链接到此合集的另外 {count} 个场景：{names}。' },
  'transfer.linked.move': { other: '{subject}与此合集的另外 {count} 个场景互相链接：{names}。' },
  'transfer.linked.rule': '场景只能链接到同一合集中的场景。把链接的场景一起带到{target}以保留链接，或移除链接。',
  'transfer.linked.title': '链接的场景',
  'transfer.move.withScenes': { other: '连同 {count} 个链接的场景一起移动' },
  'transfer.move.withoutLinks': '移动但不保留链接',
  'transfer.moveFailed': '无法移动{what}：{error}',
  'transfer.moved': '已把{what}移动到{target}',
  'transfer.selection': '所选内容',
};
