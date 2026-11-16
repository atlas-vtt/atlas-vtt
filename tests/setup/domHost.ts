import { installDomHost } from '../../src/app/host/dom';

// jsdom's Blob has no `arrayBuffer`, which every browser Atlas runs in has.
if (typeof Blob !== 'undefined' && typeof Blob.prototype.arrayBuffer !== 'function' && typeof FileReader !== 'undefined') {
  Blob.prototype.arrayBuffer = function arrayBuffer(this: Blob): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error ?? new Error('The Blob could not be read.'));
      reader.readAsArrayBuffer(this);
    });
  };
}

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
  createVideo(doc) {
    return doc.adoptNode(document.createElement('video'));
  },
  ownerWindow(node) {
    const doc = node.ownerDocument ?? (node as Document);
    return doc.defaultView ?? window;
  },
  activeDocument: () => document,
});
