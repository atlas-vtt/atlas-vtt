import { useCallback, useEffect, useMemo, useState } from 'react';
import type { App } from 'obsidian';
import { useExperimentalFeature } from '../../../../react/hooks/useExperimentalFeature';
import { SettingsService } from '../../../../services/SettingsService';
import { roleChoicesFor } from '../../../../statblocks/editor/create/collectionRoles';
import type { RoleChoice } from '../../../../statblocks/editor/create/roleChoices';
import { useTemplateLibrary } from '../../../../statblocks/library/useTemplateLibrary';
import { runInBackground } from '../../../../utils/backgroundTask';
import { createTokenStatblocks, type SavedToken } from './tokenStatblocks';

export interface StatblockRow {
  /** Shown: tokens are created (not edited) and the statblock editor is switched on. */
  offered: boolean;
  /** The roles of the collection the tokens go to. */
  choices: readonly RoleChoice[];
  /** The role every new token's statblock gets; null for none. */
  roleId: string | null;
  setRoleId: (roleId: string | null) => void;
  /** After a save: a linked statblock for each new token that has none, and a notice naming them. */
  createFor: (tokens: readonly SavedToken[]) => void;
}

/**
 * The token creator's Statblocks row (§7.3, M6): a role of the collection,
 * or none. Behind the `statblockEditor` switch; while it is off the row is
 * not offered and saving makes no statblock.
 */
export function useStatblockRow(app: App | null | undefined, collectionId: string, creatingTokens: boolean): StatblockRow {
  const editorOn = useExperimentalFeature('statblockEditor', app ? SettingsService.forApp(app) : undefined);
  const offered = Boolean(app) && editorOn && creatingTokens;
  // The choices name the roles' templates, which the library reads.
  const library = useTemplateLibrary(offered && app ? app : null);
  const choices = useMemo(() => (offered && app ? roleChoicesFor(app, collectionId) : []), [offered, app, collectionId, library]);
  const [roleId, setRoleId] = useState<string | null>(null);

  // Another collection has other roles: a role it lacks is no choice there.
  useEffect(() => {
    if (roleId !== null && !choices.some((choice) => choice.roleId === roleId)) setRoleId(null);
  }, [choices, roleId]);

  const createFor = useCallback((tokens: readonly SavedToken[]): void => {
    if (!offered || !app || roleId === null || tokens.length === 0) return;
    runInBackground(createTokenStatblocks(app, tokens, collectionId, roleId), 'Creating the statblocks of new tokens', "Couldn't create the statblocks.");
  }, [offered, app, collectionId, roleId]);

  const chosen = offered ? roleId : null;
  return useMemo(() => ({ offered, choices, roleId: chosen, setRoleId, createFor }), [offered, choices, chosen, createFor]);
}
