import type { Translation } from '../../types';

export const dice: Translation = {
  'dice.formulaError.syntax': '用 +、−、* 或 / 连接骰子和数字，例如 2d6+3 或 4d6kh3。骰子面数须为 2–1,000，数字最多 4 位。',
  'dice.formulaError.length': '骰子公式最多 100 个字符。',
  'dice.formulaError.terms': '骰子公式最多 20 项。',
  'dice.formulaError.dice': '爆炸之前，一次公式最多掷 100 颗骰子。',
  'dice.formulaError.faces': '骰子面数须在 2 到 1,000 之间。',
  'dice.clearHistory': '清空记录',
  'dice.clearSelection': '清除选择',
  'dice.closeHint': '关闭（Enter 或 Esc）',
  'dice.details': '详情',
  'dice.log': '骰子记录',
  'dice.noRolls': '还没有投掷',
  'dice.pin': '固定面板',
  'dice.rollAgain': '再掷一次',
  'dice.unknown': '未知',
  'dice.unpin': '取消固定',
  'dice.player': '玩家',
  'dice.rollFormula': '投掷 {formula}',
  'dice.showRollsToPlayers': '向玩家显示我的投掷',
  'dice.showRollsToPlayersHint': '你的投掷也会出现在玩家窗口里。',
};
