// Main OpenSC2K web application entry point

import { Data } from './Data.js';
import { FileImport } from './components/FileImport.js';
import { DragDropHandler } from './ui/DragDropHandler.js';
import { createImportButton, styleImportButton } from './ui/FileImportButton.js';
import { 
  detectCapabilities, 
  validateCapabilities, 
  showFallbackMessage 
} from './utils/featureDetection.js';
import type { GameConfig, BrowserCapabilities } from './types/index.js';

export class OpenSC2K {
  private _config: GameConfig;
  private data: Data;
  private _fileImport: FileImport | null = null;
  private capabilities: BrowserCapabilities;
  private container: HTMLElement;
  
  public mapRotation: number = 0;
  public waterLevel: number = 4;
  public rotationModifier: number = 0;
  public corners: string[] = ['1000', '0100', '0010', '0001'];
  
  constructor(config: GameConfig) {
    this._config = config;
    this.capabilities = detectCapabilities();
    
    if (config.container) {
      if (typeof config.container === 'string') {
        const el = document.getElementById(config.container);
        if (!el) throw new Error(`Container element not found: ${config.container}`);
        this.container = el;
      } else {
        this.container = config.container;
      }
    } else {
      this.container = document.body;
    }
    
    this.data = new Data();
  }
  
  public async init(): Promise<void> {
    if (!validateCapabilities(this.capabilities)) {
      showFallbackMessage(this.capabilities);
      return;
    }
    
    console.log('Initializing OpenSC2K Web...');
    
    try {
      await this.data.init();
      this.data.loadTiles();
      
      const mapInfo = this.data.loadMap();
      if (mapInfo) {
        this.waterLevel = mapInfo.waterLevel;
        this.mapRotation = mapInfo.rotation;
      }
      
      this.setupUI();
      console.log('OpenSC2K initialized successfully');
      
    } catch (error) {
      console.error('Failed to initialize OpenSC2K:', error);
      throw error;
    }
  }
  
  private setupUI(): void {
    const { button, fileImport } = createImportButton({
      container: this.container,
      buttonText: 'Import SC2 City',
      onFileLoaded: (data, filename) => this.handleFileLoaded(data, filename),
      onError: (error) => this.handleError(error)
    });
    
    this._fileImport = fileImport;
    styleImportButton(button);
    
    new DragDropHandler(
      (data, filename) => this.handleFileLoaded(data, filename),
      (error) => this.handleError(error),
      this.container
    );
  }
  
  private handleFileLoaded(data: Uint8Array, filename: string): void {
    console.log(`File loaded: ${filename} (${data.length} bytes)`);
    // TODO: Parse SC2 file and update data
  }
  
  private handleError(error: Error): void {
    console.error('Error:', error.message);
    alert(`Error: ${error.message}`);
  }
  
  public getData(): Data {
    return this.data;
  }
}

// Auto-initialize when DOM is ready
if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    const app = new OpenSC2K({
      width: window.innerWidth,
      height: window.innerHeight
    });
    
    app.init().catch(console.error);
    
    (window as any).OpenSC2K = app;
  });
}
