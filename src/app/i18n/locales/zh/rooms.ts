import type { Translation } from '../../types';

export const rooms: Translation = {
  'rooms.carve': '挖掘',
  'rooms.fill': '填回',
  'rooms.door': '门',
  'rooms.rectangle': '矩形',
  'rooms.points': '逐点',
  'rooms.lasso': '套索',
  'rooms.brush': '画笔',
  'rooms.brushSize': '画笔大小',
  'rooms.carveTip': '从岩石中挖出一个房间：它的边缘会变成墙，碰到的房间会与它连通。按住 Alt 改为填回',
  'rooms.fillTip': '把岩石填回去：其中的墙会消失，被切入的房间会在那里砌上墙。按住 Alt 改为挖掘',
  'rooms.rectangleTip': '矩形。按住 Shift 让角吸附到网格',
  'rooms.pointsTip': '逐点绘制，再次点击第一个点闭合。按住 Shift 让点吸附到网格',
  'rooms.doorHint': '拖过一个开口。按住 Alt 做成密门。点击门的标记可以开门或关门。',
};
