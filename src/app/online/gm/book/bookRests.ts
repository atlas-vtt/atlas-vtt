import { isRestId, parseBookRestMessage, type BookRestPick } from '../../protocol/index.ts';
import type { PickRequest } from '../../../recovery/restOffer';
import type { ArmedCards } from '../armedCards.ts';
import { CharacterRests, restAllies } from './characterRests.ts';
import type { PlayedCharacter } from './characters.ts';
import type { RestAlly, RestGate } from './restGate.ts';
import { RestRequests, type RestCard } from './restRequests.ts';
import type { DrawnStatblock } from './statblockSheet.ts';

/** What a character without a name is called on its request's card. */
const UNNAMED = 'Unnamed character';

/** What the books' rests ask of the books and the table. */
export interface BookRestsHost {
  readonly rests: Pick<RestGate, 'offers' | 'check' | 'take'>;
  readonly cards: ArmedCards;
  randomId(): string;
  /** Answers a request, to its player alone. */
  answer(player: string, request: string, outcome: 'done' | 'declined' | 'refused'): void;
  /** The character a player plays now, or null. */
  character(player: string): PlayedCharacter | null;
  /** Every character played at the table now. */
  played(): readonly PlayedCharacter[];
  /** Whether a player is connected and within their rate of writes into their book. */
  mayWrite(player: string): boolean;
  /** The player is sent their statblock again, whatever it reads. */
  resend(player: string): void;
  /** The requests' cards changed. */
  changed(): void;
}

/**
 * Rests at a running table: the recovery buttons on each player's own character's statblock
 * (`CharacterRests`), and the requests they send (`book-rest`), which wait for the GM as cards
 * (`RestRequests`). A request is taken only from a connected player within their rate, for the
 * character they play now, by the id this table gave it, and an action for another character only
 * for one played at the table now, by the id this table gave that one; anything else is refused at
 * once, except past the player's rate, which is answered with nothing. Who may be helped is read
 * again when the request is checked and when the GM approves it.
 */
export class BookRests {
  private readonly sheets: CharacterRests;
  private readonly requests: RestRequests;

  constructor(private readonly host: BookRestsHost) {
    this.sheets = new CharacterRests({ randomId: () => host.randomId(), offers: (path, character) => host.rests.offers(path, character) });
    this.requests = new RestRequests({
      check: (path, character, request) => host.rests.check(path, character, request, this.alliesOf(character)),
      take: (path, character, request) => host.rests.take(path, character, request, this.alliesOf(character)),
      plays: (player, character) => host.character(player)?.key === character,
      answer: (player, answer) => host.answer(player, answer.request, answer.outcome),
      rested: (player, character) => {
        this.sheets.forget(character);
        host.resend(player);
      },
      changed: () => host.changed(),
    }, host.cards);
  }

  /** The statblock a character's player is sent, with the character's buttons where it has any. */
  withRest(character: PlayedCharacter | null, drawn: DrawnStatblock | undefined): DrawnStatblock | undefined {
    return this.sheets.withRest(character, drawn, character === null ? [] : restAllies(character, this.host.played()));
  }

  /** The requests waiting for the GM, as cards. */
  cards(): readonly RestCard[] {
    return this.requests.view();
  }

  approve(key: string): void {
    this.requests.approve(key);
  }

  decline(key: string): void {
    this.requests.decline(key);
  }

  /** A player's rest request: waits for the GM, or is refused at once; one past the player's rate of writes gets no answer. */
  receive(from: string, body: Record<string, unknown>): void {
    // Checked first, so a flood of requests, readable or not, draws no answers.
    if (!this.host.mayWrite(from)) return;
    const message = parseBookRestMessage(body);
    if (message === null) {
      // A request the page named can be refused; one it did not name cannot be answered.
      if (isRestId(body.request)) this.host.answer(from, body.request, 'refused');
      return;
    }
    const character = this.host.character(from);
    const key = this.sheets.characterOf(message.character);
    const path = character?.statblockPath ?? null;
    const picks = character === null ? null : this.picksOf(character, message.picks ?? []);
    const asked = character !== null && key === character.key && path !== null && picks !== null && this.requests.ask({
      player: from, request: message.request, character: key, characterId: message.character, name: character.sheet.name || UNNAMED, path,
      ask: { button: message.button, spends: message.spends, ...(picks.length > 0 && { picks }) },
    });
    if (!asked) this.host.answer(from, message.request, 'refused');
  }

  /** The other characters at the table now, as Atlas is asked to reach them for a rest of `character`. */
  private alliesOf(character: string): RestAlly[] {
    const resting = this.host.played().find((each) => each.key === character);
    if (resting === undefined) return [];
    return restAllies(resting, this.host.played()).flatMap((ally) => (ally.statblockPath === null ? [] : [{ character: ally.key, path: ally.statblockPath }]));
  }

  /** A request's picks with each ally named by its book key; null where one names a character not played at the table now. */
  private picksOf(character: PlayedCharacter, picks: readonly BookRestPick[]): PickRequest[] | null {
    const allies = new Set(restAllies(character, this.host.played()).map((ally) => ally.key));
    const named: PickRequest[] = [];
    for (const pick of picks) {
      const ally = pick.for === null ? null : this.sheets.characterOf(pick.for);
      if (ally === undefined || (ally !== null && !allies.has(ally))) return null;
      named.push({ choice: pick.choice, action: pick.action, for: ally, spends: pick.spends });
    }
    return named;
  }

  /** A note may read otherwise (every note for null): what characters offer is read again. */
  changed(): void {
    this.sheets.forget();
  }

  /** A player left the table: their requests go, unanswered. */
  playerLeft(player: string): void {
    this.requests.playerLeft(player);
  }

  /** The table is over: every request goes, unanswered. */
  stop(): void {
    this.requests.dispose();
  }
}
