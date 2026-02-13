// Drag and drop file handler

import type { FileLoadHandler, ErrorHandler } from '../types/index.js';

export class DragDropHandler {
  private onDrop: FileLoadHandler;
  private onError?: ErrorHandler;
  private dropZone: HTMLElement | null = null;

  constructor(onDrop: FileLoadHandler, onError?: ErrorHandler, dropZone?: HTMLElement) {
    this.onDrop = onDrop;
    this.onError = onError;
    this.dropZone = dropZone || document.body;
    this.setupListeners();
  }

  private setupListeners(): void {
    if (!this.dropZone) return;
    
    this.dropZone.addEventListener('dragover', this.handleDragOver.bind(this));
    this.dropZone.addEventListener('drop', this.handleDrop.bind(this));
    this.dropZone.addEventListener('dragenter', this.handleDragEnter.bind(this));
    this.dropZone.addEventListener('dragleave', this.handleDragLeave.bind(this));
  }

  private handleDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
  }

  private handleDragEnter(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.dropZone?.classList.add('drag-over');
  }

  private handleDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.dropZone?.classList.remove('drag-over');
  }

  private handleDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.dropZone?.classList.remove('drag-over');
    
    const files = event.dataTransfer?.files;
    if (!files || files.length === 0) return;
    
    const file = files[0];
    
    if (!file.name.toLowerCase().endsWith('.sc2')) {
      this.onError?.(new Error('Please drop a .sc2 file'));
      return;
    }
    
    const reader = new FileReader();
    
    reader.onload = (e: ProgressEvent<FileReader>) => {
      const result = e.target?.result;
      if (result instanceof ArrayBuffer) {
        const bytes = new Uint8Array(result);
        this.onDrop(bytes, file.name);
      }
    };
    
    reader.onerror = () => {
      this.onError?.(new Error('Failed to read dropped file'));
    };
    
    reader.readAsArrayBuffer(file);
  }

  destroy(): void {
    if (!this.dropZone) return;
    this.dropZone.removeEventListener('dragover', this.handleDragOver.bind(this));
    this.dropZone.removeEventListener('drop', this.handleDrop.bind(this));
    this.dropZone.removeEventListener('dragenter', this.handleDragEnter.bind(this));
    this.dropZone.removeEventListener('dragleave', this.handleDragLeave.bind(this));
  }
}
