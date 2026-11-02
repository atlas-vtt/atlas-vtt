import { DEFAULT_TOKEN_SETTINGS } from '../../storeFactory';
import type { CollectionSettings } from '../../types/collectionSettingsTypes';
import { dropUnknownConditionsFromJson } from '../collectionConditionCleanup';
import { showNewSceneBarsInJson } from '../../resources/sceneVisibility';
import { collectionIdOfPath } from '../assetPaths';
import { dropSceneLinksFromJson } from '../sceneLinks';
import { dropWidgetsFromJson } from '../sceneWidgetFiles';

/** New content for a file, or null when it stays as it is. */
export type TextRewrite = (content: string) => string | null;

export interface SceneAdoption {
  map: TextRewrite;
  snapshot: TextRewrite;
}

/** A file that is not valid JSON is left as it is rather than failing the whole transfer. */
export function unlessUnreadable(rewrite: TextRewrite): TextRewrite {
  return (content) => {
    try {
      return rewrite(content);
    } catch {
      return null;
    }
  };
}

/** Applies the rewrites one after another; null when none changed the content. */
function inOrder(...rewrites: TextRewrite[]): TextRewrite {
  return (content) => {
    const result = rewrites.reduce((current, rewrite) => rewrite(current) ?? current, content);
    return result === content ? null : result;
  };
}

/**
 * How a scene that joins a collection takes on its rules, as if it had been
 * created there: its tokens lose the conditions the collection does not define,
 * it loses the widgets of its old collection and its pins to scenes of other
 * collections (in the map and in its snapshots; the new collection's widgets
 * come from its library when the scene loads), and the map shows the bars a new
 * scene of the collection shows. Tokens show the new collection's resources
 * without a rewrite, since those are defined by the collection. Run it after the
 * scene's paths follow the transfer, so links to scenes that came along are kept.
 */
export function sceneAdoption(collectionId: string, settings: CollectionSettings): SceneAdoption {
  const defined = new Set(settings.conditions.map((condition) => condition.id));
  const library = settings.widgets ?? {};
  const conditions = unlessUnreadable((content) => dropUnknownConditionsFromJson(content, defined));
  const widgets = unlessUnreadable((content) => dropWidgetsFromJson(content, (id) => !library[id]));
  const links = unlessUnreadable((content) => dropSceneLinksFromJson(content, (mapPath) => collectionIdOfPath(mapPath) === collectionId));
  const bars = unlessUnreadable((content) => showNewSceneBarsInJson(content, settings.defaultWidgets, DEFAULT_TOKEN_SETTINGS));
  return {
    map: inOrder(conditions, widgets, links, bars),
    snapshot: inOrder(conditions, widgets, links),
  };
}
