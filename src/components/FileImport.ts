// FileImport component using HTML5 FileReader API

import type { FileLoadHandler, ErrorHandler } from '../types/index.js';

export class FileImport {
  private fileInput: HTMLInputElement;
  private onFileLoaded: FileLoadHandler;
  private onError?: ErrorHandler;

  constructor(onFileLoaded: FileLoadHandler, onError?: ErrorHandler) {
    this.onFileLoaded = onFileLoaded;
    this.onError = onError;
    
    this.fileInput = document.createElement('input');
    this.fileInput.type = 'file';
    this.fileInput.accept = '.sc2,.SC2';
    this.fileInput.style.display = 'none';
    document.body.appendChild(this.fileInput);
    
    this.fileInput.addEventListener('change', this.handleFileSelect.bind(this));
  }

  open(): void {
    this.fileInput.value = '';
    this.fileInput.click();
  }

  private handleFileSelect(event: Event): void {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    
    if (!file) return;
    
    if (!file.name.toLowerCase().endsWith('.sc2')) {
      this.onError?.(new Error('Please select a .sc2 file'));
      return;
    }
    
    const reader = new FileReader();
    
    reader.onload = (e: ProgressEvent<FileReader>) => {
      const result = e.target?.result;
      if (result instanceof ArrayBuffer) {
        const bytes = new Uint8Array(result);
        this.onFileLoaded(bytes, file.name);
      } else {
        this.onError?.(new Error('Failed to read file as ArrayBuffer'));
      }
    };
    
    reader.onerror = () => {
      this.onError?.(new Error('FileReader error occurred'));
    };
    
    reader.readAsArrayBuffer(file);
  }

  destroy(): void {
    this.fileInput.remove();
  }
}
