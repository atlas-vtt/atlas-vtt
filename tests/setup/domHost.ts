import { installDomHost } from '../../src/app/host/dom';

// The browser test runtime has ordinary DOM APIs, without plugin augmentation.
installDomHost({
  createCanvas(doc = document, size) {
    const canvas = doc.adoptNode(document.createElement('canvas'));
    if (size) { canvas.width = size.width; canvas.height = size.height; }
    return canvas;
  },
  createDiv(parent, cls) {
    const div = parent.ownerDocument.createElement('div');
    div.className = cls;
    parent.appendChild(div);
    return div;
  },
  ownerWindow(node) {
    const doc = node.ownerDocument ?? (node as Document);
    return doc.defaultView ?? window;
  },
  activeDocument: () => document,
});
