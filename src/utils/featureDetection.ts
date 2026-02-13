// Browser feature detection for OpenSC2K

import type { BrowserCapabilities } from '../types/index.js';

export function detectCapabilities(): BrowserCapabilities {
  return {
    fileReader: typeof FileReader !== 'undefined',
    webAssembly: typeof WebAssembly !== 'undefined',
    fetch: typeof fetch !== 'undefined',
    canvas: !!document.createElement('canvas').getContext('2d')
  };
}

export function validateCapabilities(caps: BrowserCapabilities): boolean {
  return caps.fileReader && caps.webAssembly && caps.fetch && caps.canvas;
}

export function getMissingFeatures(caps: BrowserCapabilities): string[] {
  const missing: string[] = [];
  
  if (!caps.fileReader) missing.push('File reading (FileReader API)');
  if (!caps.webAssembly) missing.push('WebAssembly (for database)');
  if (!caps.fetch) missing.push('Network requests (Fetch API)');
  if (!caps.canvas) missing.push('Canvas rendering');
  
  return missing;
}

export function showFallbackMessage(caps: BrowserCapabilities): void {
  const missing = getMissingFeatures(caps);
  
  if (missing.length === 0) return;
  
  const message = 
    'Your browser does not support required features:\n\n' +
    missing.map(m => `  • ${m}`).join('\n') +
    '\n\nPlease use a modern browser:\n' +
    '  • Chrome 57+\n' +
    '  • Firefox 52+\n' +
    '  • Safari 11+\n' +
    '  • Edge 79+';
  
  alert(message);
}
