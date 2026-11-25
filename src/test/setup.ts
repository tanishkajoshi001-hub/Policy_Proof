import '@testing-library/jest-dom';

// Polyfill global mocks for JSDOM
if (typeof window !== 'undefined') {
  window.HTMLMediaElement.prototype.play = () => Promise.resolve();
  window.HTMLMediaElement.prototype.pause = () => {};

  // Mock HTMLCanvasElement.prototype.getContext
  (HTMLCanvasElement.prototype as any).getContext = () => {
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
    } as unknown as CanvasRenderingContext2D;
  };
}
