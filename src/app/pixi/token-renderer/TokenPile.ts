import { pilePlaces } from '../../stores/tokenStacking';
import type { TokenEntity } from '../../types';

/** The places of the viewed level's tokens in the pile (`pilePlaces`), worked out again only when a token comes, goes or changes layer. */
export class TokenPile {
  private places: ReadonlyMap<string, number> = new Map();
  private ids: string[] = [];
  private layers: number[] = [];

  /** Takes the tokens as they are now; true when a token came, went or changed layer since the last call. */
  update(tokens: Readonly<Record<string, TokenEntity>>): boolean {
    const list = Object.values(tokens);
    if (list.length === this.ids.length && list.every((token, i) => token.id === this.ids[i] && (token.layer ?? 0) === this.layers[i])) return false;
    this.ids = list.map((token) => token.id);
    this.layers = list.map((token) => token.layer ?? 0);
    this.places = pilePlaces(tokens);
    return true;
  }

  placeOf(id: string): number {
    return this.places.get(id) ?? 0;
  }
}
