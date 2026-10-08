import type { RemoteSceneInput } from '../../src/api/types/remoteViews';
import { createDefaultInitiativeState } from '../../src/app/types/initiativeTypes';
import type { TextElement, TokenEntity } from '../../src/app/types';

export function remoteToken(id: string, fields: Partial<TokenEntity> = {}): TokenEntity {
  return { kind: 'token', id, x: 100, y: 100, size: 1, imagePath: '', ...fields } as TokenEntity;
}

export function remoteText(id: string, text: string): TextElement {
  return { kind: 'text', id, x: 10, y: 10, text, fontSize: 16, fontFamily: 'sans-serif', color: '#ffffff' };
}

/** A scene as an extension feeds it: a 1000 × 800 map without its image yet, one token, one text. */
export function remoteScene(fields: Partial<RemoteSceneInput> = {}): RemoteSceneInput {
  return {
    background: { url: null, width: 1000, height: 800 },
    grid: { enabled: true, visible: true, type: 'square', size: 70, offsetX: 0, offsetY: 0, opacity: 0.5 },
    objects: { tokens: { t1: remoteToken('t1') }, texts: { x1: remoteText('x1', 'Tavern') }, drawings: {}, fog: {} },
    tokenImages: {},
    widgets: { settings: { widgets: {}, globalVisible: true, position: 'top', scale: 1 }, values: {} },
    initiative: createDefaultInitiativeState(),
    ...fields,
  };
}
