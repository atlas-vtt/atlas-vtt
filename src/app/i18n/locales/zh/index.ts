import type { Translation } from '../../types';
import { align } from './align';
import { atlasLinks } from './atlasLinks';
import { am } from './am';
import { assetGrid } from './assetGrid';
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
import { palette } from './palette';
import { picker } from './picker';
import { settings } from './settings';
import { snapshots } from './snapshots';
import { statblock } from './statblock';
import { switcher } from './switcher';
import { tabs } from './tabs';
import { timer } from './timer';
import { tokens } from './tokens';
import { transfer } from './transfer';
import { view } from './view';
import { widgets } from './widgets';
import { sbImport } from './sbImport';
import { filters } from './filters';
import { search } from './search';
import { sort } from './sort';
import { toolbar } from './toolbar';
import { hotkey } from './hotkey';
import { pin } from './pin';
import { laser } from './laser';
import { audio } from './audio';
import { editToken } from './editToken';
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
import { account } from './account';
import { armarium } from './armarium';
import { armariumFindings } from './armariumFindings';
import { armariumListing } from './armariumListing';
import { armariumShare } from './armariumShare';
import { armariumUpload } from './armariumUpload';
import { campaign } from './campaign';
import { deviceFiles } from './deviceFiles';
import { diceLab } from './diceLab';
import { diceRoll } from './diceRoll';
import { diceSettings } from './diceSettings';
import { docs } from './docs';
import { draw } from './draw';
import { dungeon } from './dungeon';
import { dungeonProp } from './dungeonProp';
import { dungeonScene } from './dungeonScene';
import { experimental } from './experimental';
import { fog } from './fog';
import { glass } from './glass';
import { graphics } from './graphics';
import { initRules } from './initRules';
import { levels } from './levels';
import { mapFeature } from './mapFeature';
import { measure } from './measure';
import { online } from './online';
import { openings } from './openings';
import { playerBar } from './playerBar';
import { quest } from './quest';
import { recoveryEditor } from './recoveryEditor';
import { rest } from './rest';
import { rooms } from './rooms';
import { selection } from './selection';
import { senses } from './senses';
import { siteFrame } from './siteFrame';
import { statblockEditor } from './statblockEditor';
import { table } from './table';
import { tableTv } from './tableTv';
import { tables } from './tables';
import { tabletDiag } from './tabletDiag';
import { templateEditor } from './templateEditor';
import { toolbarEdit } from './toolbarEdit';
import { uvtt } from './uvtt';
import { uvttFloors } from './uvttFloors';
import { vaultImages } from './vaultImages';
import { videoMap } from './videoMap';

/** Simplified Chinese. Missing keys fall back to English. */
export const zh: Translation = {
  ...align,
  ...atlasLinks,
  ...am,
  ...assetGrid,
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
  ...palette,
  ...picker,
  ...settings,
  ...snapshots,
  ...statblock,
  ...switcher,
  ...tabs,
  ...timer,
  ...tokens,
  ...transfer,
  ...view,
  ...widgets,
  ...sbImport,
  ...filters,
  ...search,
  ...sort,
  ...toolbar,
  ...hotkey,
  ...pin,
  ...laser,
  ...audio,
  ...editToken,
  ...hex,
  ...light,
  ...mapIcon,
  ...pinMenu,
  ...resource,
  ...token,
  ...image,
  'index.unreadable': 'Atlas VTT 无法读取素材索引（{path}），因此没有改动它。请重启 Obsidian 再试。',
  'index.rebuilding': 'Atlas VTT 无法读取素材索引，正在根据合集文件重建。无法读取的文件已保留为 {path}。',
  'index.folderMoved': 'Atlas 文件夹已移到「{path}」。Atlas 只在仓库顶层的「{folder}」中查找素材库：把文件夹移回那里，你的地图、场景和指示物就都回来了。',
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
  ...account,
  ...armarium,
  ...armariumFindings,
  ...armariumListing,
  ...armariumShare,
  ...armariumUpload,
  ...campaign,
  ...deviceFiles,
  ...diceLab,
  ...diceRoll,
  ...diceSettings,
  ...docs,
  ...draw,
  ...dungeon,
  ...dungeonProp,
  ...dungeonScene,
  ...experimental,
  ...fog,
  ...glass,
  ...graphics,
  ...initRules,
  ...levels,
  ...mapFeature,
  ...measure,
  ...online,
  ...openings,
  ...playerBar,
  ...quest,
  ...recoveryEditor,
  ...rest,
  ...rooms,
  ...selection,
  ...senses,
  ...siteFrame,
  ...statblockEditor,
  ...table,
  ...tableTv,
  ...tables,
  ...tabletDiag,
  ...templateEditor,
  ...toolbarEdit,
  ...uvtt,
  ...uvttFloors,
  ...vaultImages,
  ...videoMap,
};
