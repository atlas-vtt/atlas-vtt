import type { Translation } from '../../types';
import { account } from './account';
import { align } from './align';
import { am } from './am';
import { armarium } from './armarium';
import { armariumFindings } from './armariumFindings';
import { armariumListing } from './armariumListing';
import { armariumShare } from './armariumShare';
import { armariumMusic } from './armariumMusic';
import { armariumUpload } from './armariumUpload';
import { assetGrid } from './assetGrid';
import { atlasLinks } from './atlasLinks';
import { audio } from './audio';
import { bundle } from './bundle';
import { campaign } from './campaign';
import { changelog } from './changelog';
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
import { creatureFilter } from './creatureFilter';
import { csm } from './csm';
import { dashboard } from './dashboard';
import { deviceFiles } from './deviceFiles';
import { dice } from './dice';
import { diceLab } from './diceLab';
import { diceRoll } from './diceRoll';
import { diceSettings } from './diceSettings';
import { docs } from './docs';
import { draw } from './draw';
import { dungeon } from './dungeon';
import { dungeonProp } from './dungeonProp';
import { dungeonScene } from './dungeonScene';
import { editToken } from './editToken';
import { encounter } from './encounter';
import { experimental } from './experimental';
import { exportDialog } from './exportDialog';
import { filters } from './filters';
import { fog } from './fog';
import { glass } from './glass';
import { graphics } from './graphics';
import { grid } from './grid';
import { gridModal } from './gridModal';
import { hex } from './hex';
import { history } from './history';
import { hotkey } from './hotkey';
import { image } from './image';
import { importReview } from './importReview';
import { initRules } from './initRules';
import { initiative } from './initiative';
import { issue } from './issue';
import { itemBundle } from './itemBundle';
import { itemReview } from './itemReview';
import { laser } from './laser';
import { remote } from './remote';
import { downloads } from './downloads';
import { levels } from './levels';
import { light } from './light';
import { link } from './link';
import { loot } from './loot';
import { lpv } from './lpv';
import { map } from './map';
import { mapFeature } from './mapFeature';
import { mapIcon } from './mapIcon';
import { mapPreview } from './mapPreview';
import { measure } from './measure';
import { menu } from './menu';
import { migration } from './migration';
import { names } from './names';
import { notice } from './notice';
import { online } from './online';
import { openings } from './openings';
import { palette } from './palette';
import { picker } from './picker';
import { pin } from './pin';
import { pinMenu } from './pinMenu';
import { player } from './player';
import { playerBar } from './playerBar';
import { playerInit } from './playerInit';
import { present } from './present';
import { preview } from './preview';
import { quest } from './quest';
import { recovery } from './recovery';
import { recoveryEditor } from './recoveryEditor';
import { resource } from './resource';
import { rest } from './rest';
import { review } from './review';
import { rooms } from './rooms';
import { sbCandidate } from './sbCandidate';
import { sbImport } from './sbImport';
import { sbToken } from './sbToken';
import { sceneLight } from './sceneLight';
import { search } from './search';
import { selection } from './selection';
import { senses } from './senses';
import { settings } from './settings';
import { siteFrame } from './siteFrame';
import { snapshots } from './snapshots';
import { sort } from './sort';
import { statblock } from './statblock';
import { statblockEditor } from './statblockEditor';
import { switcher } from './switcher';
import { table } from './table';
import { tableTv } from './tableTv';
import { tables } from './tables';
import { tabletDiag } from './tabletDiag';
import { tabs } from './tabs';
import { templateEditor } from './templateEditor';
import { timer } from './timer';
import { token } from './token';
import { tokens } from './tokens';
import { toolbar } from './toolbar';
import { toolbarEdit } from './toolbarEdit';
import { tour } from './tour';
import { appearance } from './appearance';
import { transfer } from './transfer';
import { uvtt } from './uvtt';
import { uvttFloors } from './uvttFloors';
import { validation } from './validation';
import { vaultImages } from './vaultImages';
import { videoMap } from './videoMap';
import { view } from './view';
import { vision } from './vision';
import { wall } from './wall';
import { widgets } from './widgets';

export const pt: Translation = {
  'index.unreadable': 'O Atlas VTT não conseguiu ler o índice de assets ({path}) e o deixou intacto. Reinicie o Obsidian para tentar de novo.',
  'index.rebuilding': 'O Atlas VTT não conseguiu ler o índice de assets e está reconstruindo-o a partir dos arquivos das suas coleções. O arquivo ilegível foi guardado como {path}.',
  'index.folderMoved': 'A pasta do Atlas foi movida para “{path}”. O Atlas só encontra a biblioteca dele em “{folder}”, na raiz do cofre: mova a pasta de volta para lá e seus mapas, cenas e tokens voltam.',
  ...account,
  ...align,
  ...am,
  ...armarium,
  ...armariumFindings,
  ...armariumListing,
  ...armariumShare,
  ...armariumMusic,
  ...armariumUpload,
  ...assetGrid,
  ...atlasLinks,
  ...audio,
  ...bundle,
  ...campaign,
  ...changelog,
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
  ...creatureFilter,
  ...csm,
  ...dashboard,
  ...deviceFiles,
  ...dice,
  ...diceLab,
  ...diceRoll,
  ...diceSettings,
  ...docs,
  ...draw,
  ...dungeon,
  ...dungeonProp,
  ...dungeonScene,
  ...editToken,
  ...encounter,
  ...experimental,
  ...exportDialog,
  ...filters,
  ...fog,
  ...glass,
  ...graphics,
  ...grid,
  ...gridModal,
  ...hex,
  ...history,
  ...hotkey,
  ...image,
  ...importReview,
  ...initRules,
  ...initiative,
  ...issue,
  ...itemBundle,
  ...itemReview,
  ...laser,
  ...downloads,
  ...levels,
  ...light,
  ...link,
  ...loot,
  ...lpv,
  ...map,
  ...mapFeature,
  ...mapIcon,
  ...mapPreview,
  ...measure,
  ...menu,
  ...migration,
  ...names,
  ...notice,
  ...online,
  ...openings,
  ...palette,
  ...picker,
  ...pin,
  ...pinMenu,
  ...player,
  ...playerBar,
  ...playerInit,
  ...present,
  ...preview,
  ...quest,
  ...recovery,
  ...recoveryEditor,
  ...resource,
  ...rest,
  ...review,
  ...rooms,
  ...sbCandidate,
  ...sbImport,
  ...sbToken,
  ...sceneLight,
  ...search,
  ...selection,
  ...senses,
  ...settings,
  ...siteFrame,
  ...snapshots,
  ...sort,
  ...statblock,
  ...statblockEditor,
  ...switcher,
  ...table,
  ...tableTv,
  ...tables,
  ...tabletDiag,
  ...tabs,
  ...templateEditor,
  ...timer,
  ...token,
  ...tokens,
  ...toolbar,
  ...toolbarEdit,
  ...tour,
  ...appearance,
  ...transfer,
  ...uvtt,
  ...uvttFloors,
  ...validation,
  ...vaultImages,
  ...videoMap,
  ...view,
  ...vision,
  ...wall,
  ...widgets,
  ...remote,
};
