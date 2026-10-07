/** Atlas's own record types, as plain data (type-only; nothing here runs). */
export type { BaseToken, Character, DrawingStroke, NotePin, TextElement, Token, TokenEntity } from '../../app/types';
export type { LightSource, LightZone } from '../../app/types/lightingTypes';
export type { TokenSettings } from '../../app/types/tokenSettingsTypes';
export type { WallSegment } from '../../app/types/wallTypes';
export type { FogBrushStroke, FogLassoFill, FogOperation, FogRectangleFill } from '../../app/types/fogTypes';
export type { GridState } from '../../app/types/gridTypes';
export type { InitiativeEntry, InitiativeState } from '../../app/types/initiativeTypes';
export type { InitiativeRules } from '../../app/types/initiativeRulesTypes';
export type { SceneLighting } from '../../app/types/lightingTypes';
export type { AnyWidget, ClockWidget, CounterWidget, TimerWidget, WidgetSettings } from '../../app/types/widgetTypes';
export type { CollectionGridDefaults, ConditionDefinition } from '../../app/types/collectionSettingsTypes';
export type { DiceRules } from '../../app/types/diceRulesTypes';
export type { DiceRollResult, DiceSelection } from '../../app/tools/diceRolling';
export type { MeasurementSettings } from '../../app/grid/measurementFormat';
export type { ResourceDefinition, ResourceHolder, ResourceValue } from '../../app/resources/resourceTypes';
export type { LightLevel } from '../../app/types/senseTypes';

/** The vault path of the scene's background image; null without one. */
export type BackgroundState = string | null;

/** Widget values by widget id. */
export type WidgetValues = Readonly<Record<string, number>>;
