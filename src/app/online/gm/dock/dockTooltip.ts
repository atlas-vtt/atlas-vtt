/** Hovering this long shows the tooltip, as Atlas's toolbar tooltips do. */
const HOVER_DELAY_MS = 300;

let nextId = 0;

/**
 * The button's tooltip, in Atlas's tooltip look (`.tooltip-content`). It shows after a hover or at
 * once for keyboard focus, and hides at once on any key, press, wheel or context menu. It never
 * takes a key: Escape goes on to whoever uses it, as with the toolbar editor's card.
 */
export class DockTooltip {
  private readonly el: HTMLElement;
  private readonly label: HTMLElement;
  private readonly trigger: HTMLElement;
  private timer: number | null = null;
  private enabled = true;
  private readonly cleanups: (() => void)[] = [];

  /** `cls`: a class of its own, which places it; `multiline`: an explanation rather than a name, which wraps. */
  constructor(parent: HTMLElement, trigger: HTMLElement, options: { readonly cls?: string; readonly multiline?: boolean } = {}) {
    this.trigger = trigger;
    const id = `atlas-online-tooltip-${++nextId}`;
    this.el = parent.createDiv({ cls: ['tooltip-content', 'atlas-online-tooltip', ...(options.cls === undefined ? [] : [options.cls])], attr: { id, role: 'tooltip' } });
    this.el.hidden = true;
    this.label = this.el.createDiv({ cls: 'tooltip-inner' }).createSpan({ cls: options.multiline === true ? 'tooltip-label tooltip-label--multiline' : 'tooltip-label' });
    trigger.setAttribute('aria-describedby', id);
    const on = <K extends keyof HTMLElementEventMap>(target: HTMLElement, type: K, run: (event: HTMLElementEventMap[K]) => void): void => {
      target.addEventListener(type, run);
      this.cleanups.push(() => target.removeEventListener(type, run));
    };
    on(trigger, 'pointerenter', (event) => {
      if (event.pointerType !== 'touch') this.later();
    });
    on(trigger, 'pointerleave', () => this.hide());
    on(trigger, 'focus', () => {
      if (trigger.matches(':focus-visible')) this.show();
    });
    on(trigger, 'blur', () => this.hide());
    const win = trigger.win;
    const hide = (): void => this.hide();
    for (const type of ['keydown', 'pointerdown', 'wheel', 'contextmenu'] as const) {
      win.addEventListener(type, hide, true);
      this.cleanups.push(() => win.removeEventListener(type, hide, true));
    }
  }

  setText(text: string): void {
    if (this.label.textContent !== text) this.label.setText(text);
  }

  /** No tooltip while the control is open: the menu or panel stands where it would show. */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.hide();
  }

  dispose(): void {
    this.hide();
    for (const cleanup of this.cleanups.splice(0)) cleanup();
    this.trigger.removeAttribute('aria-describedby');
    this.el.remove();
  }

  private later(): void {
    this.clearTimer();
    this.timer = this.trigger.win.setTimeout(() => this.show(), HOVER_DELAY_MS);
  }

  private show(): void {
    this.clearTimer();
    if (this.enabled) this.el.hidden = false;
  }

  private hide(): void {
    this.clearTimer();
    this.el.hidden = true;
  }

  private clearTimer(): void {
    if (this.timer !== null) this.trigger.win.clearTimeout(this.timer);
    this.timer = null;
  }
}
