import type { Translation } from '../../types';

export const map: Translation = {
  'map.loading': '正在加载地图…',
  'map.readFailed': 'Atlas VTT 无法读取 {file}（{reason}）。副本保存在 {backup}。',
  'map.untitled': '未命名地图',
  'map.loadingShort': '正在加载地图…',
  'map.clearing': '正在清除先前的数据…',
  'map.loadingImage': '正在加载地图图片…',
  'map.restoring': '正在恢复地图数据…',
  'map.loadingTokens': '正在加载指示物和图钉…',
  'map.alignGrid': '对齐网格',
  'map.detectingGrid': '正在识别网格…',
  'map.loadingNTokens': { other: '正在加载 {count} 个指示物…' },
  'map.finalizing': '正在完成…',
  'map.noGridFound': '这张地图上没有找到网格，因此不显示网格。',
  'map.openFailed': 'Atlas VTT 无法打开场景 {name}（{reason}）。',
  'map.syncLeavesOutFiles': 'Obsidian Sync 在此设备上不会同步 Atlas 的场景和地图。请在每台设备的“设置 → 同步”中开启“同步所有其他类型文件”。',
  'map.imageUnshown': 'Atlas VTT 无法显示地图图片 {file}。{reason}',
  'map.processing': '正在处理地图 · {percent}%',
  'map.videoTooLarge': '动态地图 {file} 是 {width} × {height} 像素，超过了此设备能播放的大小（单边 {side} 像素），因此只显示第一帧。',
  'map.videoUnplayable': '动态地图 {file} 无法在这里播放，因此只显示第一帧。{reason}',
};
