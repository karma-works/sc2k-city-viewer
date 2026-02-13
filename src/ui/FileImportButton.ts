// UI button for file import

import { FileImport } from '../components/FileImport.js';
import type { FileLoadHandler, ErrorHandler } from '../types/index.js';

export interface ImportButtonOptions {
  container: HTMLElement;
  buttonText?: string;
  buttonClass?: string;
  onFileLoaded: FileLoadHandler;
  onError?: ErrorHandler;
}

export function createImportButton(options: ImportButtonOptions): {
  button: HTMLButtonElement;
  fileImport: FileImport;
} {
  const { container, buttonText = 'Import SC2 City', buttonClass = 'import-button', onFileLoaded, onError } = options;
  
  const fileImport = new FileImport(onFileLoaded, onError);
  
  const button = document.createElement('button');
  button.textContent = buttonText;
  button.className = buttonClass;
  button.addEventListener('click', () => fileImport.open());
  
  container.appendChild(button);
  
  return { button, fileImport };
}

export function styleImportButton(button: HTMLButtonElement): void {
  button.style.cssText = `
    position: absolute;
    top: 10px;
    left: 10px;
    z-index: 1000;
    padding: 10px 20px;
    background: rgba(0, 0, 0, 0.7);
    color: white;
    border: 1px solid #555;
    border-radius: 4px;
    cursor: pointer;
    font-family: Verdana, sans-serif;
    font-size: 14px;
  `;
  
  button.addEventListener('mouseenter', () => {
    button.style.background = 'rgba(0, 0, 0, 0.9)';
  });
  
  button.addEventListener('mouseleave', () => {
    button.style.background = 'rgba(0, 0, 0, 0.7)';
  });
}
