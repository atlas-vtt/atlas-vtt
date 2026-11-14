/**
 * The kept measurements the GM points at: the one whose handle the pointer is over, and the one
 * whose popover is open. Those that are areas mark the tokens in them (`show`), told only when
 * the two are others than last time.
 */
export class PointedMeasures {
  private hovered: string | null = null;
  private shown: { readonly hovered: string | null; readonly opened: string | null } = { hovered: null, opened: null };

  constructor(private readonly show: (ids: ReadonlySet<string>) => void) {}

  /** The handle under the pointer is `hovered`'s, or none's; `opened` is the measurement whose popover is open. */
  hover(hovered: string | null, opened: string | null): void {
    this.hovered = hovered;
    this.follow(opened);
  }

  /** The popover is `opened`'s now, or closed. */
  follow(opened: string | null): void {
    const { hovered } = this;
    if (opened === this.shown.opened && hovered === this.shown.hovered) return;
    this.shown = { hovered, opened };
    this.show(new Set([hovered, opened].filter((id): id is string => id !== null)));
  }
}
