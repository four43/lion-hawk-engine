// A document whose canvases record their 2D calls (Node has no canvas): enough for render/snapshot.js.
export function fakeDoc() {
  const canvases = [];
  return {
    canvases,
    createElement(tag) {
      const c = { tag, width: 0, height: 0, image: null, ops: [], getContext: () => ctx, toDataURL: () => `data:image/png;fake,${c.width}x${c.height}` };
      const ctx = {
        createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
        putImageData: (img, x, y) => { c.image = img; c.ops.push(['put', x, y]); },
        drawImage: (src, x, y) => c.ops.push(['draw', src, x, y]),
        fillRect: (x, y, w, h) => c.ops.push(['fill', x, y, w, h]),
        set globalCompositeOperation(v) { c.ops.push(['op', v]); },
        set fillStyle(v) { c.ops.push(['style', v]); },
      };
      canvases.push(c); return c;
    },
  };
}
