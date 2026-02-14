import { Data } from './Data.js';
import { Graphics, type Coordinates } from './Graphics.js';
import { Events } from './Events.js';
import { UI } from './UI.js';
import { Debug } from './Debug.js';
import { SC2Importer } from './Import.js';
import { FileImport } from './components/FileImport.js';
import { DragDropHandler } from './ui/DragDropHandler.js';
import { createImportButton, styleImportButton } from './ui/FileImportButton.js';
import {
  detectCapabilities,
  validateCapabilities,
  showFallbackMessage
} from './utils/featureDetection.js';
import type { GameConfig, BrowserCapabilities, MapCell } from './types/index.js';

type ExtendedMapCell = MapCell & {
  coordinates?: Coordinates;
  corners?: string;
  rotate?: string;
  water_level?: string;
  water?: number;
  original_x?: number;
  original_y?: number;
};

export class OpenSC2K {
  private data: Data;
  private graphics: Graphics;
  private events: Events | null = null;
  private ui: UI | null = null;
  private debug: Debug | null = null;
  private importer: SC2Importer;
  private fileImport: FileImport | null = null;
  private capabilities: BrowserCapabilities;
  private container: HTMLElement;

  public mapRotation: number = 0;
  public waterLevel: number = 4;
  public rotationModifier: number = 0;
  public corners: string[] = ['1000', '0100', '0010', '0001'];

  public maxMapSize: number = 128;
  public tilesX: number = 128;
  public tilesY: number = 128;
  public layerOffset: number = 24;

  private originX: { value: number } = { value: 0 };
  private originY: { value: number } = { value: 0 };

  private animationFrameId: number | null = null;

  constructor(config: GameConfig) {
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
    this.graphics = new Graphics();
    this.importer = new SC2Importer();
  }

  public async init(): Promise<void> {
    if (!validateCapabilities(this.capabilities)) {
      showFallbackMessage(this.capabilities);
      return;
    }

    console.log('Initializing SC2K City Viewer...');

    try {
      await this.data.init();
      this.data.loadTiles();

      const mapInfo = this.data.loadMap();
      if (mapInfo) {
        this.waterLevel = mapInfo.waterLevel;
        this.mapRotation = mapInfo.rotation;
      }

      this.graphics.setTiles(this.data.tiles);
      this.graphics.setMapRotation(this.mapRotation);
      this.graphics.setWaterLevel(this.waterLevel);
      this.graphics.setCityRotation(this.data.cityRotation);

      this.graphics.createRenderingCanvas();

      this.ui = new UI({
        graphics: this.graphics,
        tiles: () => this.data.tiles,
        mapRotation: this.mapRotation,
        layerOffset: this.layerOffset
      });

      this.debug = new Debug({
        graphics: this.graphics,
        tiles: () => this.data.tiles,
        mapRotation: this.mapRotation,
        cityRotation: this.data.cityRotation,
        corners: this.corners,
        waterLevel: this.waterLevel,
        layerOffset: this.layerOffset
      });

      this.events = new Events({
        onRotateLeft: () => this.rotateMap('left'),
        onRotateRight: () => this.rotateMap('right'),
        onOpenFile: () => this.openFileImport(),
        onClear: () => this.clearData(),
        onMoveCamera: (direction) => this.moveCamera(direction),
        onSetDrawFrame: () => this.graphics.setDrawFrame(),
        onUpdateCanvasSize: () => this.updateCanvasSize()
      });

      this.events.register();

      this.setupUI();
      this.graphics.startAnimationFrames();
      this.startGame();

      console.log('SC2K City Viewer initialized successfully');

    } catch (error) {
      console.error('Failed to initialize SC2K City Viewer:', error);
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

    this.fileImport = fileImport;
    styleImportButton(button);

    new DragDropHandler(
      (data, filename) => this.handleFileLoaded(data, filename),
      (error) => this.handleError(error),
      this.container
    );
  }

  private handleFileLoaded(data: Uint8Array, filename: string): void {
    console.log(`File loaded: ${filename} (${data.length} bytes)`);

    if (!this.importer.isSimCity2000SaveFile(data)) {
      this.handleError(new Error('File is not a valid SimCity 2000 SC2 Save File'));
      return;
    }

    try {
      this.importer.importToData(this.data, data);
      this.graphics.setTiles(this.data.tiles);
      this.graphics.setCityRotation(this.data.cityRotation);
      this.graphics.setWaterLevel(this.data.waterLevel);
      this.waterLevel = this.data.waterLevel;

      if (this.debug) {
        this.debug.setCityRotation(this.data.cityRotation);
      }

      this.updateCanvasSize();
      console.log(`City "${this.data.cityName}" imported successfully`);
    } catch (error) {
      this.handleError(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private handleError(error: Error): void {
    console.error('Error:', error.message);
    alert(`Error: ${error.message}`);
  }

  private openFileImport(): void {
    if (this.fileImport) {
      this.fileImport.open();
    }
  }

  private clearData(): void {
    this.data.close();
  }

  private moveCamera(direction: 'up' | 'down' | 'left' | 'right'): void {
    if (this.ui) {
      this.ui.moveCamera(direction, () => this.updateCanvasSize());
    }
  }

  private updateCanvasSize(): void {
    if (!this.data.cityLoaded) return;

    this.graphics.updateCanvasSize(
      this.tilesX,
      this.tilesY,
      this.data.map as (MapCell | undefined)[][],
      this.ui?.cameraOffsetX ?? 0,
      this.ui?.cameraOffsetY ?? 0,
      this.originX,
      this.originY
    );
  }

  private startGame(): void {
    this.updateCanvasSize();
    this.gameLoop();
  }

  private gameLoop(): void {
    this.game();
    this.animationFrameId = requestAnimationFrame(() => this.gameLoop());
  }

  private game(): void {
    if (!this.debug || !this.ui) return;

    this.debug.begin();
    this.graphics.clearCanvas();

    if (!this.graphics.ready) {
      this.graphics.loadingMessage();
      this.debug.end();
      return;
    }

    for (let tY = 0; tY < this.tilesY; tY++) {
      for (let tX = this.tilesX - 1; tX >= 0; tX--) {
        const cell = this.getMapCell(tX, tY);
        if (!cell) continue;

        this.drawTerrainEdge(cell);
        this.drawTerrainTile(cell);
        this.drawZoneTile(cell);
        this.drawNetworkTile(cell);
        this.drawBuildingTile(cell);

        this.debug.drawDebugLayer(cell as MapCell & { coordinates?: Coordinates });
      }
    }

    if (this.isCursorOnMap()) {
      this.ui.selectionBox(
        this.ui.cursorTileX,
        this.ui.cursorTileY,
        this.getMapCell(this.ui.cursorTileX, this.ui.cursorTileY) as ExtendedMapCell
      );
    }

    this.debug.main();
    this.debug.end();

    this.graphics.loopEnd();
  }

  private getMapCell(xT: number, yT: number): ExtendedMapCell | null {
    const cell = this.data.map[xT]?.[yT];
    return cell ? cell as ExtendedMapCell : null;
  }

  private drawTerrainTile(cell: ExtendedMapCell): void {
    if (!cell.tiles.terrain || cell.tiles.terrain === 0) return;

    let tileId = cell.tiles.terrain;
    let topOffset = 0;

    if ((cell.water_level === 'submerged' || cell.water_level === 'shore') &&
        cell.z < this.waterLevel && !this.debug?.hideWater) {
      topOffset = (this.waterLevel - cell.z) * this.graphics.layerOffset;
    }

    if (cell.water_level === 'submerged' && !this.debug?.hideWater) {
      tileId = 270;
    }

    if ((cell.water_level === 'shore' || cell.water_level === 'surface') && !this.debug?.hideWater) {
      tileId = cell.tiles.terrain + 14;
    }

    if (cell.water_level === 'waterfall' && cell.tiles.building !== 198 && !this.debug?.hideWater) {
      tileId = 284;
    }

    if (this.debug?.hideWater) {
      if (cell.water_level === 'surface') {
        tileId = 256;
      } else if (cell.water_level === 'waterfall') {
        tileId = 269;
      }
    }

    if (!this.debug?.hideTerrain) {
      this.graphics.drawTile(tileId, cell, topOffset);
    }

    this.debug?.terrain(cell as MapCell & { coordinates?: Coordinates; water_level?: string });
  }

  private drawZoneTile(cell: ExtendedMapCell): void {
    if (!cell.tiles.zone || cell.tiles.zone === 0) return;

    if (!this.debug?.hideZones) {
      this.graphics.drawTile(cell.tiles.zone, cell);
    }
  }

  private drawNetworkTile(cell: ExtendedMapCell): void {
    if (!cell.tiles.building || cell.tiles.building === 0 ||
        cell.tiles.building < 14 || cell.tiles.building > 108) {
      return;
    }

    let topOffset = 0;
    const tile = this.graphics.getTile(cell.tiles.building);

    if ((cell.water_level === 'submerged' || cell.water_level === 'shore') &&
        cell.z < this.waterLevel) {
      topOffset = (this.waterLevel - cell.z) * this.graphics.layerOffset;
    }

    if (cell.tiles.terrain === 269) {
      topOffset += this.graphics.layerOffset;
    }

    let keyTile = false;
    const corners = cell.corners ?? '';

    if ((this.mapRotation === 0 && corners[0] === '1') ||
        (this.mapRotation === 1 && corners[2] === '1') ||
        (this.mapRotation === 2 && corners[3] === '1') ||
        (this.mapRotation === 3 && corners[1] === '1') ||
        (tile?.size === 1)) {
      keyTile = true;
    }

    if (keyTile && !this.debug?.hideNetworks) {
      this.graphics.drawTile(cell.tiles.building, cell, topOffset);
    }
  }

  private drawBuildingTile(cell: ExtendedMapCell): void {
    if (!cell.tiles.building || cell.tiles.building === 0 ||
        (cell.tiles.building > 14 && cell.tiles.building < 108)) {
      return;
    }

    let topOffset = 0;

    if ((cell.water_level === 'submerged' || cell.water_level === 'shore') &&
        cell.z < this.waterLevel) {
      topOffset = (this.waterLevel - cell.z) * this.graphics.layerOffset;
    }

    const tile = this.graphics.getTile(cell.tiles.building);
    if (!tile) return;

    let keyTile = false;
    const corners = cell.corners ?? '';

    if (corners === this.corners[this.mapRotation]) {
      keyTile = true;
    }

    if (tile.size === 1) {
      keyTile = true;
    }

    const context = this.graphics.getPrimaryContext();
    if (this.debug?.lowerBuildingOpacity && context) {
      context.globalAlpha = 0.6;
    }

    if (keyTile && !this.debug?.hideBuildings) {
      this.graphics.drawTile(cell.tiles.building, cell, topOffset);
    }

    if (this.debug?.lowerBuildingOpacity && context) {
      context.globalAlpha = 1;
    }

    this.debug?.building(cell as MapCell & { coordinates?: Coordinates; corners?: string; rotate?: string });
  }

  private drawTerrainEdge(cell: ExtendedMapCell): void {
    if (this.debug?.hideTerrainEdge) return;

    if (cell.x !== 0 && cell.y !== this.tilesY - 1) return;

    let tile = 269;
    let topOffset = 0;

    for (let i = cell.z; i > 0; i--) {
      topOffset = -this.graphics.layerOffset * i;
      this.graphics.drawTile(tile, cell, topOffset);
    }

    if ((cell.water_level === 'submerged' || cell.water_level === 'shore') &&
        !this.debug?.hideWater) {
      tile = 284;
      for (let i = this.waterLevel; i > 0; i--) {
        topOffset = -(this.graphics.layerOffset * i) +
                     (this.graphics.layerOffset * this.waterLevel);

        if (i > cell.z) {
          this.graphics.drawTile(tile, cell, topOffset);
        }
      }
    }
  }

  private isCursorOnMap(): boolean {
    if (!this.ui) return false;
    return (
      this.ui.cursorTileX >= 0 && this.ui.cursorTileX < this.tilesX &&
      this.ui.cursorTileY >= 0 && this.ui.cursorTileY < this.tilesY &&
      this.graphics.isInsideClipBoundary(this.ui.cursorX, this.ui.cursorY)
    );
  }

  private rotateMap(direction: 'left' | 'right'): void {
    if (!this.data.cityLoaded) return;

    const rotatedMap: (MapCell | undefined)[][] = [];

    let newX: number;
    let newY: number;

    if (direction === 'left') {
      newX = 0;
      newY = this.maxMapSize - 1;
    } else {
      newX = this.maxMapSize - 1;
      newY = 0;
    }

    for (let mX = 0; mX < this.maxMapSize; mX++) {
      for (let mY = 0; mY < this.maxMapSize; mY++) {
        if (!rotatedMap[newY]) rotatedMap[newY] = [];
        if (!rotatedMap[newX]) rotatedMap[newX] = [];

        const sourceCell = this.data.map[mX]?.[mY];
        if (sourceCell) {
          const rotatedCell = { ...sourceCell, x: newY, y: newX };
          rotatedMap[newY][newX] = rotatedCell;
        }

        const buildingTile = this.graphics.getTile(sourceCell?.tiles.building ?? 0);
        const extCell = sourceCell as ExtendedMapCell;
        if (buildingTile?.flip_h === 'Y') {
          extCell.rotate = extCell.rotate === 'Y' ? 'N' : 'Y';
        }

        if (direction === 'left') {
          newY--;
          if (newY < 0) newY = this.maxMapSize - 1;
        } else {
          newY++;
          if (newY >= this.maxMapSize) newY = 0;
        }
      }

      if (direction === 'left') {
        newX++;
        if (newX >= this.maxMapSize) newX = 0;
      } else {
        newX--;
        if (newX < 0) newX = this.maxMapSize - 1;
      }
    }

    for (let i = 0; i < this.data.map.length; i++) {
      this.data.map[i] = rotatedMap[i] ?? [];
    }

    if (direction === 'left') {
      this.mapRotation++;
      if (this.mapRotation > 3) this.mapRotation = 0;
    } else {
      this.mapRotation--;
      if (this.mapRotation < 0) this.mapRotation = 3;
    }

    this.graphics.setMapRotation(this.mapRotation);
    this.ui?.setMapRotation(this.mapRotation);
    this.debug?.setMapRotation(this.mapRotation);

    this.updateCanvasSize();
  }

  public getData(): Data {
    return this.data;
  }

  public destroy(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.data.close();
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    const app = new OpenSC2K({
      width: window.innerWidth,
      height: window.innerHeight
    });

    app.init().catch(console.error);

    (window as unknown as { OpenSC2K: OpenSC2K }).OpenSC2K = app;
  });
}
