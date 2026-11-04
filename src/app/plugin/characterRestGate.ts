import type { App } from 'obsidian';
import { t } from '../i18n';
import type { CheckedRest, RestAlly, RestGate } from '../online/gm/book/restGate.ts';
import { restPicksText, restRulesText } from '../online/gm/book/restRules.ts';
import { quietRoll } from '../online/gm/quietRoll.ts';
import { characterOf } from '../characters/playerCharacters';
import { characterRest, type CharacterRest } from '../recovery/characterRest';
import { AssetService } from '../services/AssetService';
import type { RecoveryButton } from '../recovery/recoveryTypes';
import { onRested } from '../recovery/restEvents';
import { checkRest, restOffers, type RestRequest } from '../recovery/restOffer';
import { restPlan } from '../recovery/restPlan';
import type { RestChoices, RestRoller } from '../recovery/restTypes';
import type { AllyRests } from '../recovery/restWrites';
import { takeRest } from '../recovery/takeRest';
import { diceSetOfCollection } from '../services/diceSets/collectionDiceSets';
import { templateDiceSet } from '../statblocks/resolve/templateDiceSet';
import { showNotice } from '../ui/notice';
import { randomHex } from '../utils/randomHex';

/** Whether the library token `character` (the one a token at the table was placed from) is a form of the character `rest` is. */
function isFormOf(app: App, rest: CharacterRest, character: string): boolean {
  const tokens = AssetService.getInstance(app).loadedTokenAssets();
  const record = tokens.find((asset) => asset.id === character);
  return record !== undefined && characterOf(record, tokens)?.id === rest.asset.id;
}

/** The player character `character` (its library token's id, any of its forms) whose statblock is the note at `path`, with buttons; null for any other. */
function restOf(app: App, path: string, character: string): CharacterRest | null {
  const rest = characterRest(app, path);
  return rest !== null && isFormOf(app, rest, character) && rest.buttons.length > 0 ? rest : null;
}

/**
 * The other characters at the table Atlas reaches as player characters, as a rest finds them by id:
 * each the player character whose statblock its note is, read as the note panel reads it.
 */
function allyRests(app: App, allies: readonly RestAlly[], resting: string): { reach: AllyRests; ids: Set<string> } {
  const found = new Map<string, CharacterRest>();
  for (const ally of allies) {
    if (found.has(ally.character)) continue;
    const rest = characterRest(app, ally.path);
    // Another form of the resting character is no ally: it is the one resting
    if (rest !== null && rest.asset.id !== resting && isFormOf(app, rest, ally.character)) found.set(ally.character, rest);
  }
  // A pick names an ally by the token played, a rest writes it by the character it is: either finds it
  const byCharacter = new Map([...found.values()].map((rest) => [rest.asset.id, rest]));
  return { reach: (id) => found.get(id) ?? byCharacter.get(id) ?? null, ids: new Set(found.keys()) };
}

interface Checked {
  readonly button: RecoveryButton;
  readonly choices: RestChoices;
  readonly allies: AllyRests;
}

/** The request checked against what the character offers now, actions for others only for `allies`: the button it takes, the choices it makes and the allies it reaches, or null. */
function checked(app: App, rest: CharacterRest, request: RestRequest, allies: readonly RestAlly[]): Checked | null {
  const reached = allyRests(app, allies, rest.asset.id);
  const fit = checkRest(restOffers(rest.buttons, rest.character), request, reached.ids);
  const button = fit === null ? undefined : rest.buttons.find((each) => each.id === fit.button.id);
  return fit === null || button === undefined ? null : { button, choices: fit.choices, allies: reached.reach };
}

/**
 * Rolls a rest's formulas on the dice of the character's statblock (its template's set, else its
 * collection's), quietly: the rest's log entry shows the rolls, no throw is on anyone's screen.
 */
function quietRoller(app: App, rest: CharacterRest): RestRoller {
  const dice = templateDiceSet(app, rest.notePath) ?? diceSetOfCollection(app, rest.asset.collection);
  return (formula) => {
    const roll = quietRoll(formula, dice, randomHex(12), Date.now());
    return roll === null ? null : { formula, total: roll.total };
  };
}

/**
 * The recovery buttons of the characters players play, as Atlas holds them: a character is read
 * from its note and its tokens as the note panel reads it (`characterRest`), a request is checked
 * against the buttons it offers now, and an approved rest is taken through the same engine as the
 * GM's own press, so it is announced to whoever follows the GM's rests (the table's log).
 */
export function characterRestGate(app: App): RestGate {
  return {
    offers: (path, character) => {
      const rest = restOf(app, path, character);
      return rest === null ? null : restOffers(rest.buttons, rest.character);
    },
    check: (path, character, request, allies): CheckedRest | null => {
      const rest = restOf(app, path, character);
      const fit = rest === null ? null : checked(app, rest, request, allies);
      if (rest === null || fit === null) return null;
      const plan = restPlan(fit.button, rest.character, fit.choices.picks, (id) => fit.allies(id)?.character ?? null);
      return {
        button: fit.button.name,
        picks: restPicksText(fit.button, fit.choices.picks, (id) => fit.allies(id)?.asset.name ?? id),
        rules: restRulesText(plan, fit.choices, rest.asset.id),
      };
    },
    take: async (path, character, request, allies) => {
      const rest = restOf(app, path, character);
      const fit = rest === null ? null : checked(app, rest, request, allies);
      if (rest === null || fit === null) return 'refused';
      const taken = await takeRest(app, rest, fit.button.id, fit.choices, quietRoller(app, rest), undefined, fit.allies);
      // The rest went through but its counters did not: the GM is told, as the note panel tells them.
      if (taken?.problem) showNotice(`${taken.summary.text}\n${t('rest.failed', { problem: taken.problem })}`);
      return taken === null ? 'refused' : 'done';
    },
    onRested: (listener) => onRested(app, listener),
  };
}
