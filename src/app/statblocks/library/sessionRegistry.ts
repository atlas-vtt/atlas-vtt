/**
 * The open template sessions of each app: one core per template id, counted
 * by the handles views hold, in any window. Nothing is written when the last
 * holder lets go: the core and its unsaved draft are dropped. A view that
 * closes with unsaved changes keeps its hold until the user chose to save.
 */

import type { App } from 'obsidian';
import type { StatblockTemplate, TemplateId } from '../model/templateTypes';
import { SessionCore, type RoleOnSave } from './sessionCore';

interface OpenSession {
  core: SessionCore;
  holders: number;
}

const registries = new WeakMap<App, Map<TemplateId, OpenSession>>();

function registryOf(app: App): Map<TemplateId, OpenSession> {
  let registry = registries.get(app);
  if (!registry) {
    registry = new Map();
    registries.set(app, registry);
  }
  return registry;
}

/**
 * The session core of a template, made on first use; null when the library
 * knows no template by this id and no unsaved template of the editor has it.
 */
export function acquireSessionCore(app: App, id: TemplateId): SessionCore | null {
  const registry = registryOf(app);
  const open = registry.get(id);
  if (open) {
    open.holders += 1;
    return open.core;
  }
  const core = SessionCore.create(app, id);
  if (core) registry.set(id, { core, holders: 1 });
  return core;
}

/** The core of a new template that has no file yet, held once; it lives as long as someone holds it. */
export function acquireUnsavedCore(app: App, template: StatblockTemplate, name: string, role: RoleOnSave | null, body: string): SessionCore {
  const core = SessionCore.unsaved(app, template, name, role, body);
  registryOf(app).set(core.id, { core, holders: 1 });
  return core;
}

/** Whether a session of this id is open (an unsaved template's id is known nowhere else). */
export function isSessionOpen(app: App, id: TemplateId): boolean {
  return registries.get(app)?.has(id) ?? false;
}

/** How many handles hold the core; 0 once it is gone. */
export function holdersOf(app: App, core: SessionCore): number {
  const open = registries.get(app)?.get(core.id);
  return open?.core === core ? open.holders : 0;
}

/** A holder lets go; after the last one the core and its draft are dropped. */
export function releaseSessionCore(app: App, core: SessionCore): void {
  const registry = registryOf(app);
  const open = registry.get(core.id);
  if (!open || open.core !== core || open.holders === 0) return;
  open.holders -= 1;
  if (open.holders > 0) return;
  registry.delete(core.id);
  core.dispose();
}

/** The plugin unloads: every session is let go, unsaved drafts with them. */
export function releaseTemplateSessions(app: App): void {
  const open = [...(registries.get(app)?.values() ?? [])];
  registries.delete(app);
  for (const { core } of open) core.dispose();
}
