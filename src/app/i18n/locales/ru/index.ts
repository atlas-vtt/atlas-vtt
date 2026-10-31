import type { Translation } from '../../types';
import { align } from './align';
import { atlasLinks } from './atlasLinks';
import { am } from './am';
import { bundle } from './bundle';
import { cleanup } from './cleanup';
import { clock } from './clock';
import { color } from './color';
import { command } from './command';
import { common } from './common';
import { conflict } from './conflict';
import { contents } from './contents';
import { count } from './count';
import { counter } from './counter';
import { cover } from './cover';
import { creator } from './creator';
import { csm } from './csm';
import { dashboard } from './dashboard';
import { dice } from './dice';
import { diceLab } from './diceLab';
import { diceRoll } from './diceRoll';
import { diceSettings } from './diceSettings';
import { exportDialog } from './exportDialog';
import { grid } from './grid';
import { gridModal } from './gridModal';
import { history } from './history';
import { importReview } from './importReview';
import { initiative } from './initiative';
import { loot } from './loot';
import { lpv } from './lpv';
import { map } from './map';
import { menu } from './menu';
import { notice } from './notice';
import { online } from './online';
import { palette } from './palette';
import { picker } from './picker';
import { settings } from './settings';
import { snapshots } from './snapshots';
import { statblock } from './statblock';
import { statblockEditor } from './statblockEditor';
import { switcher } from './switcher';
import { tabs } from './tabs';
import { timer } from './timer';
import { tokens } from './tokens';
import { transfer } from './transfer';
import { view } from './view';
import { widgets } from './widgets';
import { sbImport } from './sbImport';
import { vaultImages } from './vaultImages';
import { filters } from './filters';
import { search } from './search';
import { senses } from './senses';
import { sort } from './sort';
import { toolbar } from './toolbar';
import { toolbarEdit } from './toolbarEdit';
import { hotkey } from './hotkey';
import { pin } from './pin';
import { laser } from './laser';
import { text } from './text';
import { audio } from './audio';
import { drawing } from './drawing';
import { editToken } from './editToken';
import { templateEditor } from './templateEditor';
import { tables } from './tables';
import { campaign } from './campaign';
import { quest } from './quest';
import { rest } from './rest';
import { initRules } from './initRules';
import { recoveryEditor } from './recoveryEditor';
import { hex } from './hex';
import { light } from './light';
import { mapIcon } from './mapIcon';
import { pinMenu } from './pinMenu';
import { resource } from './resource';
import { token } from './token';
import { image } from './image';
import { link } from './link';
import { mapPreview } from './mapPreview';
import { names } from './names';
import { player } from './player';
import { playerInit } from './playerInit';
import { present } from './present';
import { preview } from './preview';
import { recovery } from './recovery';
import { review } from './review';
import { sbCandidate } from './sbCandidate';
import { sbToken } from './sbToken';
import { validation } from './validation';
import { issue } from './issue';
import { changelog } from './changelog';
import { tour } from './tour';
import { creatureFilter } from './creatureFilter';
import { encounter } from './encounter';
import { migration } from './migration';
import { wall } from './wall';
import { sceneLight } from './sceneLight';
import { vision } from './vision';
import { dungeon } from './dungeon';
import { dungeonProp } from './dungeonProp';
import { dungeonScene } from './dungeonScene';
import { levels } from './levels';
import { mapFeature } from './mapFeature';
import { openings } from './openings';
import { uvtt } from './uvtt';
import { uvttFloors } from './uvttFloors';
import { videoMap } from './videoMap';

export const ru: Translation = {
  ...align,
  ...atlasLinks,
  ...am,
  ...bundle,
  ...cleanup,
  ...clock,
  ...color,
  ...command,
  ...common,
  ...conflict,
  ...contents,
  ...count,
  ...counter,
  ...cover,
  ...creator,
  ...csm,
  ...dashboard,
  ...dice,
  ...diceLab,
  ...diceRoll,
  ...diceSettings,
  ...exportDialog,
  ...grid,
  ...gridModal,
  ...history,
  ...importReview,
  ...initiative,
  ...loot,
  ...lpv,
  ...map,
  ...menu,
  ...notice,
  ...online,
  ...palette,
  ...picker,
  ...settings,
  ...snapshots,
  ...statblock,
  ...statblockEditor,
  ...switcher,
  ...tabs,
  ...timer,
  ...tokens,
  ...transfer,
  ...view,
  ...widgets,
  ...sbImport,
  ...vaultImages,
  ...filters,
  ...search,
  ...senses,
  ...sort,
  ...toolbar,
  ...toolbarEdit,
  ...hotkey,
  ...pin,
  ...laser,
  ...text,
  ...audio,
  ...drawing,
  ...editToken,
  ...hex,
  ...light,
  ...mapIcon,
  ...pinMenu,
  ...resource,
  ...token,
  ...image,
  'index.unreadable': 'Atlas VTT не смог прочитать индекс ресурсов ({path}) и не стал его менять. Перезапустите Obsidian, чтобы попробовать снова.',
  'index.rebuilding': 'Atlas VTT не смог прочитать индекс ресурсов и восстанавливает его по файлам коллекций. Нечитаемый файл сохранён как {path}.',
  ...link,
  ...mapPreview,
  ...names,
  ...player,
  ...playerInit,
  ...present,
  ...preview,
  ...recovery,
  ...review,
  ...sbCandidate,
  ...sbToken,
  ...validation,
  ...issue,
  ...changelog,
  ...tour,
  ...creatureFilter,
  ...encounter,
  ...migration,
  ...wall,
  ...sceneLight,
  ...vision,
  ...templateEditor,
  ...tables,
  ...campaign,
  ...quest,
  ...rest,
  ...initRules,
  ...recoveryEditor,
  ...dungeon,
  ...dungeonProp,
  ...dungeonScene,
  ...levels,
  ...mapFeature,
  ...openings,
  ...uvtt,
  ...uvttFloors,
  ...videoMap,
};
