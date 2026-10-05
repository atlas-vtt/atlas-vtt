import type { DomHost } from '../../host/dom';

/** Resolve ownership for each call so detached windows keep their own DOM resources. */
export const pluginDomHost: DomHost = {
  createCanvas(doc, size) {
    const canvas = size ? createEl('canvas', { attr: size }) : createEl('canvas');
    return doc ? doc.adoptNode(canvas) : canvas;
  },
  createDiv: (parent, cls) => parent.createDiv({ cls }),
  ownerWindow: node => node.win,
  activeDocument: () => activeDocument,
};
