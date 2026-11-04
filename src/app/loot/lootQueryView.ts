import {
  BasesView,
  Component,
  MarkdownRenderer,
  requireApiVersion,
  stringifyYaml,
  type App,
  type Plugin,
  type QueryController,
} from 'obsidian';
import { LOOT_QUERY_VIEW } from './lootBaseQuery';
import { roleProperties, type LootQueryEntry, type LootQuerySnapshot } from './lootItem';
import { t } from '../i18n';

/** What a running query hears from the view Obsidian made for it. */
export interface LootQueryListener {
  onSnapshot: (snapshot: LootQuerySnapshot) => void;
  /** Obsidian made no view for the query: Bases is off, or was turned off and on since Atlas registered its view. */
  onUnavailable: () => void;
}

interface QueryRoute {
  onSnapshot: LootQueryListener['onSnapshot'];
  /** Called when Obsidian creates the view for the query. */
  onAttach: () => void;
}

const HOST_ATTRIBUTE = 'data-atlas-loot-query';
/**
 * How long Obsidian may take to create the view once the code block has
 * rendered. It creates it right away while Bases is on; without Bases the
 * block stays plain code and no view ever comes.
 */
export const LOOT_VIEW_GRACE_MS = 3000;

/** Running queries by the id on their host element. */
const routes = new Map<string, QueryRoute>();
let basesAvailable = false;

function textOf(value: { toString(): string } | null): string | undefined {
  const text = value?.toString().trim();
  return text && text !== 'null' ? text : undefined;
}

/** The running query a view instance belongs to, by the host Atlas rendered it into. */
function routeOf(containerEl: HTMLElement): QueryRoute | undefined {
  const host = containerEl.closest(`[${HOST_ATTRIBUTE}]`);
  return routes.get(host?.getAttribute(HOST_ATTRIBUTE) ?? '');
}

let owner: Plugin | null = null;

/**
 * Registers Atlas's Bases view with the plugin. Bases may not be on yet when
 * Obsidian starts, so a failed attempt is retried whenever loot needs Bases
 * (`lootBasesAvailable`).
 */
export function registerLootQueryView(plugin: Plugin): void {
  owner = plugin;
  basesAvailable = false;
  tryRegister();
}

/**
 * Whether Atlas's Bases view is registered: Obsidian 1.10 or later with the
 * Bases core plugin on. Registers it now if Bases has come on since.
 */
export function lootBasesAvailable(): boolean {
  return tryRegister();
}

function tryRegister(): boolean {
  if (basesAvailable || !owner) return basesAvailable;
  // Declared behind the version check: `BasesView` is undefined before Obsidian 1.10.
  if (requireApiVersion('1.10.0')) {
    /**
     * The view Atlas renders off screen to read a base view's results. In a
     * base someone opens themselves it only explains what it is for.
     */
    class LootQueryView extends BasesView {
      type = LOOT_QUERY_VIEW;
      private readonly route: QueryRoute | undefined;

      constructor(controller: QueryController, containerEl: HTMLElement) {
        super(controller);
        this.route = routeOf(containerEl);
        this.route?.onAttach();
        if (!this.route) {
          containerEl.createDiv({
            cls: 'atlas-loot-query-note',
            text: t('loot.query.note'),
          });
        }
      }

      onDataUpdated(): void {
        if (!this.route) return;
        const order = this.config.getOrder();
        // The view's columns, and the properties the roller reads by name wherever the view shows them.
        const roles = Object.values(roleProperties([...order, ...this.allProperties]));
        const read = [...new Set([...order, ...roles])];
        const entries: LootQueryEntry[] = this.data.data.map((entry) => {
          const values: Record<string, string> = {};
          for (const id of read) {
            const text = textOf(entry.getValue(id));
            if (text) values[id] = text;
          }
          return { path: entry.file.path, name: entry.file.basename, values };
        });
        const displayNames = Object.fromEntries(read.map((id) => [id, this.config.getDisplayName(id)]));
        this.route.onSnapshot({ entries, order, displayNames });
      }
    }

    basesAvailable = owner.registerBasesView(LOOT_QUERY_VIEW, {
      name: t('loot.query.name'),
      icon: 'coins',
      factory: (controller, containerEl) => new LootQueryView(controller, containerEl),
    });
  }
  return basesAvailable;
}

/**
 * One view of a base, run by Obsidian for Atlas: the view is rendered off
 * screen with Atlas's view type, and every result Obsidian computes for it,
 * now and after each change in the vault, is passed on.
 */
export class LootBaseQuery {
  private readonly id = crypto.randomUUID();
  private host: HTMLElement | null = null;
  private component: Component | null = null;
  private attached = false;
  private graceTimer: number | null = null;

  /**
   * @param config A base config with one view of Atlas's type (`lootQueryConfig`).
   * @param sourcePath The base file, against which the query's links resolve.
   */
  constructor(
    private readonly app: App,
    private readonly config: Record<string, unknown>,
    private readonly sourcePath: string,
    private readonly listener: LootQueryListener,
  ) {}

  async start(): Promise<void> {
    this.stop();
    routes.set(this.id, { onSnapshot: this.listener.onSnapshot, onAttach: () => { this.attached = true; } });
    const host = document.body.createDiv({
      cls: 'atlas-loot-query-host',
      attr: { [HOST_ATTRIBUTE]: this.id, 'aria-hidden': 'true' },
    });
    const component = new Component();
    this.host = host;
    this.component = component;
    component.load();
    await MarkdownRenderer.render(this.app, `\`\`\`base\n${stringifyYaml(this.config)}\`\`\``, host, this.sourcePath, component);
    if (this.attached || this.host !== host) return;
    this.graceTimer = window.setTimeout(() => {
      this.graceTimer = null;
      if (!this.attached) this.listener.onUnavailable();
    }, LOOT_VIEW_GRACE_MS);
  }

  stop(): void {
    if (this.graceTimer !== null) window.clearTimeout(this.graceTimer);
    this.graceTimer = null;
    this.attached = false;
    routes.delete(this.id);
    this.component?.unload();
    this.component = null;
    this.host?.remove();
    this.host = null;
  }
}
