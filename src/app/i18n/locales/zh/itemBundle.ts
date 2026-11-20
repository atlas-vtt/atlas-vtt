import type { Translation } from '../../types';

export const itemBundle: Translation = {
  'itemBundle.notItem': '此文件不是 Atlas 导出的文件。',
  'itemBundle.tooNew': '此文件由更新版本的 Atlas 导出。请先更新 Atlas 再导入。',
  'itemBundle.damaged': '此文件已损坏。',
  'itemBundle.unsafe': '此文件包含 Atlas 不会写入的文件：{path}',
  'itemBundle.builtIn': 'Atlas 内置的内容每个仓库都已具备，因此不会分享。',
  'itemBundle.missing': '它已不在你的仓库中。',
  'itemBundle.unreadable': '无法读取此模板。',
  'itemBundle.exported': '已将 {name} 保存为 {file}。',
  'itemBundle.exportFailed': '导出失败：{reason}',
};
