import '@testing-library/jest-dom/vitest';

// Polyfill global mocks for JSDOM
if (typeof window !== 'undefined') {
  window.HTMLMediaElement.prototype.play = () => Promise.resolve();
  window.HTMLMediaElement.prototype.pause = () => {};

  // Mock HTMLCanvasElement.prototype.getContext
  (HTMLCanvasElement.prototype as unknown as HTMLCanvasElement).getContext = () => {
    return {
      clearRect: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      stroke: () => {},
      arc: () => {},
      fill: () => {},
      save: () => {},
      restore: () => {},
      closePath: () => {},
      rect: () => {},
      roundRect: () => {},
      measureText: (text: string) => ({ width: text.length * 8 }),
      fillText: () => {},
    } as unknown as CanvasRenderingContext2D;
  };
}
