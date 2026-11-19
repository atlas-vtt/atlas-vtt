import type { Translation } from '../../types';

export const notice: Translation = {
  'notice.dashboardOpenFailed': '打开仪表盘时出错',
  'notice.openImageFirst': '请先打开一个图片文件',
  'notice.measuresFull': '一张地图最多保留 {count} 个测量。删除一个才能再保留一个。',
  'notice.drawingsFull': '一张地图最多容纳 {count} 个绘图。擦掉一些才能继续画。',
  'notice.textsFull': '一张地图最多容纳 {count} 段文字。删除一段才能再添加。',
  'notice.drawingCutFull': '这个绘图不能再切分了。请整个擦除。',
  'notice.drawingsLeftOut': '这张地图有超过 {count} 个绘图，只显示前 {count} 个。',
  'notice.textsLeftOut': '这张地图有超过 {count} 段文字，只显示前 {count} 段。',
  'notice.restartForAtlas': '旧版 Atlas 仍在运行。请重启 Obsidian 以加载新版。',
  'notice.systemTooOld': '此设备的系统版本太旧，无法运行 Atlas。',
};
