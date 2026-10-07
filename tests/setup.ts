import { vi } from 'vitest';

// jsdom does not implement media queries; expose the browser API used by Plyr.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn((media: string) => ({
    matches: false, media, onchange: null, addListener: vi.fn(), removeListener: vi.fn(),
    addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
  })),
});
