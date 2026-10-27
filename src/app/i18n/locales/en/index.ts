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
import { campaign } from './campaign';
import { quest } from './quest';
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
import { initRules } from './initRules';
import { loot } from './loot';
import { tables } from './tables';
import { lpv } from './lpv';
import { map } from './map';
import { mapFeature } from './mapFeature';
import { menu } from './menu';
import { notice } from './notice';
import { palette } from './palette';
import { picker } from './picker';
import { settings } from './settings';
import { snapshots } from './snapshots';
import { levels } from './levels';
import { openings } from './openings';
import { statblock } from './statblock';
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
import { dungeon } from './dungeon';
import { dungeonProp } from './dungeonProp';
import { dungeonScene } from './dungeonScene';
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
import { recoveryEditor } from './recoveryEditor';
import { rest } from './rest';
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
import { videoMap } from './videoMap';
import { uvttFloors } from './uvttFloors';
import { uvtt } from './uvtt';

/** English, the source language: every key exists here, and other languages translate a subset of it. */
export const en = {
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
  ...campaign,
  ...quest,
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
  ...initRules,
  ...loot,
  ...tables,
  ...lpv,
  ...map,
  ...mapFeature,
  ...menu,
  ...notice,
  ...palette,
  ...picker,
  ...settings,
  ...snapshots,
  ...levels,
  ...openings,
  ...statblock,
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
  ...dungeon,
  ...dungeonProp,
  ...dungeonScene,
  ...editToken,
  ...hex,
  ...light,
  ...mapIcon,
  ...pinMenu,
  ...resource,
  ...token,
  ...image,
  'index.unreadable': 'Atlas VTT could not read its asset index ({path}) and left it untouched. Restart Obsidian to try again.',
  'index.rebuilding': 'Atlas VTT could not read its asset index and is rebuilding it from your collection files. The unreadable file was kept as {path}.',
  ...link,
  ...mapPreview,
  ...names,
  ...player,
  ...playerInit,
  ...present,
  ...preview,
  ...recovery,
  ...recoveryEditor,
  ...rest,
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
  ...videoMap,
  ...uvttFloors,
  ...uvtt,
} as const;
