import type { FederatedPointerEvent } from 'pixi.js';

/** The camera as a drag moves it (`TouchNavigation`). */
export interface LookNavigation {
  begin(): void;
  pan(dx: number, dy: number): void;
  end(glide: boolean): void;
}

/**
 * A mouse or a pen on a map that is only looked at (Table mode): its drag pans, with any button,
 * and nothing of it reaches the tools, so nothing is hovered, pressed or opened.
 */
export class LookOnlyPointer {
  private id: number | null = null;
  private x = 0;
  private y = 0;

  constructor(private readonly navigation: LookNavigation) {}

  hear(event: FederatedPointerEvent): void {
    const { x, y } = event.global;
    if (event.type === 'pointerdown') {
      // A drag whose release was never heard (the looking ended under it) ends here
      if (this.id !== null) this.navigation.end(false);
      this.id = event.pointerId;
      this.navigation.begin();
    } else if (event.pointerId !== this.id) {
      return;
    } else if (event.type === 'pointermove') {
      this.navigation.pan(x - this.x, y - this.y);
    } else if (event.type === 'pointerup' || event.type === 'pointerupoutside') {
      this.id = null;
      this.navigation.end(true);
    }
    this.x = x;
    this.y = y;
  }
}
