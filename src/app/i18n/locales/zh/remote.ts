import type { Translation } from '../../types';

export const remote: Translation = {
  'remote.heading': 'Stream Deck',
  'remote.plugin': 'Atlas 的 Stream Deck 插件',
  'remote.pluginHint': '在 Elgato 的 Stream Deck 应用中安装它（Linux 上用 OpenDeck），然后在下方开启控制并配对。',
  'remote.pluginGet': '获取插件',
  'remote.enable': '用 Stream Deck 控制 Atlas',
  'remote.enableHint': '允许 Atlas 的 Stream Deck 插件，或你在这台电脑上配对的其他程序，播放氛围和调节音量、主持战斗、展示地图和图片以及掷骰。Atlas 只在这台电脑上监听（127.0.0.1，端口 {port}）；不会有任何内容离开它。',
  'remote.paired': '已配对的控制器',
  'remote.pairedWith': '{client}，配对于 {date}。',
  'remote.notPaired': '暂无。在 Atlas 运行时，于 Stream Deck 的插件设置中按“与 Atlas 配对”。',
  'remote.revoke': '撤销',
  'remote.revoked': '在重新配对之前，Stream Deck 无法再控制 Atlas。',
  'remote.pairTitle': '允许 {client} 控制 Atlas 吗？',
  'remote.pairMessage': '这台电脑上的一个程序请求在 Atlas 中播放氛围和调节音量、主持战斗、展示地图和图片以及掷骰。',
  'remote.pairHint': '仅当你刚在 Stream Deck 上按下“配对”时才允许。你可以随时在 设置 → Stream Deck 中撤销。',
  'remote.allow': '允许',
  'remote.portTaken': 'Atlas 无法监听 Stream Deck：端口 {port} 已被其他程序占用。',
  'remote.rollsShown': '玩家现在能看到你的掷骰。',
  'remote.rollsHidden': '你的掷骰现在对玩家隐藏。',
};
