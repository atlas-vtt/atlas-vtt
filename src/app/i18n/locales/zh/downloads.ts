import type { Translation } from '../../types';

export const downloads: Translation = {
  'downloads.title': '下载',
  'downloads.buttonActive': '下载，{percent}%',
  'downloads.queued': '排队中',
  'downloads.percent': '{percent}%',
  'downloads.cancelled': '已取消',
  'downloads.failed': '下载失败',
  'downloads.done': '已完成 · {size}',
  'downloads.amount': '{done} / {total}',
  'downloads.left': '剩余 {time}',
  'downloads.cancel': '取消',
  'downloads.retry': '重试',
  'downloads.show': '显示',
  'downloads.clear': '清除已完成',
  'downloads.reason.unavailable': '服务器不可用',
  'downloads.reason.damaged': '下载文件已损坏',
  'downloads.reason.folder': '文件夹不可用',
  'downloads.reason.disk': '无法保存',
  'downloads.reason.connection': '无网络连接',
  'downloads.finishedOne': '{title} 已下载',
  'downloads.finishedMany': { other: '{count} 个下载已完成' },
};
