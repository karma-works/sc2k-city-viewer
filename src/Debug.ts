import type { MapCell, Tile } from './types/index.js';
import type { Graphics, Coordinates } from './Graphics.js';

export interface DebugState {
  hideTerrain: boolean;
  hideZones: boolean;
  hideNetworks: boolean;
  hideBuildings: boolean;
  hideWater: boolean;
  hideTerrainEdge: boolean;
  hideAnimatedTiles: boolean;
  showTileCoordinates: boolean;
  showHeightMap: boolean;
  showClipBounds: boolean;
  showBuildingCorners: boolean;
  showZoneOverlay: boolean;
  showNetworkOverlay: boolean;
  showTileCount: boolean;
  lowerBuildingOpacity: boolean;
  showSelectedTileInfo: boolean;
  showOverlayInfo: boolean;
  showStatsPanel: boolean;
  clipOffset: number;
}

export interface DebugConfig {
  graphics: Graphics;
  tiles: () => (Tile | undefined)[];
  mapRotation: number;
  cityRotation: number | null;
  corners: string[];
  waterLevel: number;
  layerOffset: number;
}

export class Debug implements DebugState {
  public enabled: boolean = true;

  public hideTerrain: boolean = false;
  public hideZones: boolean = false;
  public hideNetworks: boolean = false;
  public hideBuildings: boolean = false;
  public hideWater: boolean = false;
  public hideTerrainEdge: boolean = false;
  public hideAnimatedTiles: boolean = false;

  public showTileCoordinates: boolean = false;
  public showHeightMap: boolean = false;
  public showClipBounds: boolean = false;

  public showBuildingCorners: boolean = false;
  public showZoneOverlay: boolean = false;
  public showNetworkOverlay: boolean = false;
  public showTileCount: boolean = false;
  public lowerBuildingOpacity: boolean = false;

  public showSelectedTileInfo: boolean = true;
  public showOverlayInfo: boolean = true;
  public showStatsPanel: boolean = false;

  public clipOffset: number = 0;
  public tileCount: number = 0;

  private beginTime: number = performance.now();
  private previousTime: number = performance.now();
  private frames: number = 0;
  private frameCount: number = 0;
  public fps: number = 0;
  public msPerFrame: number = 0;

  private graphics: Graphics;
  private mapRotation: number;
  private cityRotation: number | null;
  private corners: string[];

  constructor(config: DebugConfig) {
    this.graphics = config.graphics;
    this.mapRotation = config.mapRotation;
    this.cityRotation = config.cityRotation;
    this.corners = config.corners;
  }

  public setMapRotation(rotation: number): void {
    this.mapRotation = rotation;
  }

  public setCityRotation(rotation: number | null): void {
    this.cityRotation = rotation;
  }

  public main(): void {
    if (!this.enabled) return;
    this.drawClipBounds();
    this.debugOverlay();
    this.showFrameStats();
  }

  public begin(): void {
    this.beginTime = performance.now();
    this.tileCount = 0;
  }

  public end(): number {
    const time = performance.now();
    this.frames++;

    if (time > this.previousTime + 1000) {
      this.msPerFrame = Math.round(time - this.beginTime);
      this.fps = Math.round((this.frames * 1000) / (time - this.previousTime));
      this.previousTime = time;
      this.frameCount += this.frames;
      this.frames = 0;
    }

    return time;
  }

  private showFrameStats(): void {
    const context = this.graphics.getInterfaceContext();
    if (!context) return;

    const width = 170;
    const height = 30;
    const canvas = context.canvas;
    const x = canvas.width - width;
    const y = canvas.height - height;

    this.graphics.drawPoly(
      [
        { x: 0, y: 0 },
        { x: width, y: 0 },
        { x: width, y: height },
        { x: 0, y: height },
        { x: 0, y: 0 }
      ],
      'rgba(0,0,0,.5)',
      'rgba(255,255,255,.7)',
      x + 10,
      y + 10
    );

    context.font = '10px Verdana';
    context.fillStyle = 'rgba(255,255,255,1)';
    context.fillText(`${this.msPerFrame} m/s per frame (${this.fps} FPS)`, x + 20, y + 24);
  }

  public terrain(cell: MapCell & { coordinates?: Coordinates; water_level?: string }): void {
    if (!this.enabled) return;
    this.heightMap(cell);
    this.cellCoordinates(cell);
  }

  public building(cell: MapCell & { coordinates?: Coordinates; corners?: string; rotate?: string }): void {
    if (!this.enabled) return;
    this.buildingCorners(cell);
  }

  private buildingCorners(cell: MapCell & { coordinates?: Coordinates; corners?: string }): void {
    if (!this.showBuildingCorners) return;
    if (!cell.coordinates) return;

    if (cell.tiles.building === null || cell.tiles.building === 0) return;

    const tile = this.graphics.getTile(cell.tiles.building);
    if (!tile) return;

    if (tile.size === 1) return;

    let textStyle = 'rgba(255,255,255,.75)';
    let tileType = '';

    const cellCorners = (cell as MapCell & { corners?: string }).corners;

    if (cellCorners === this.corners[0]) {
      tileType = 'C0 TR';
    } else if (cellCorners === this.corners[1]) {
      tileType = 'C1 BL';
    } else if (cellCorners === this.corners[2]) {
      tileType = 'C2 BR';
    } else if (cellCorners === this.corners[3]) {
      tileType = 'C3 TL';
    } else {
      textStyle = 'rgba(0,0,0,0)';
    }

    if (cellCorners === this.corners[this.mapRotation]) {
      tileType = tileType + ' K';
    }

    const context = this.graphics.getInterfaceContext();
    if (!context) return;

    context.font = '8px Verdana';
    context.fillStyle = textStyle;
    context.fillText(tileType, cell.coordinates.center.x - 16, cell.coordinates.center.y + 3);
  }

  public heightMap(cell: MapCell & { coordinates?: Coordinates; water_level?: string }): void {
    if (!this.showHeightMap) return;
    if (!cell.coordinates) return;

    if (cell.tiles.terrain === null || cell.tiles.terrain === 0 || 
        cell.tiles.terrain < 256 || cell.tiles.terrain > 268) {
      return;
    }

    const tile = cell.tiles.terrain;
    let topOffset = 0;

    if (tile === 256) {
      topOffset = 0 - this.graphics.tileHeight;
    } else {
      topOffset = 0 - (this.graphics.layerOffset / 3);
    }

    this.graphics.drawTile(tile, cell as MapCell & { coordinates?: Coordinates }, topOffset, true);
  }

  private cellCoordinates(cell: MapCell & { coordinates?: Coordinates }): void {
    if (!this.showTileCoordinates) return;
    if (!cell.coordinates) return;

    const context = this.graphics.getInterfaceContext();
    if (!context) return;

    context.font = '8px Verdana';
    context.fillStyle = 'rgba(255, 255, 255, .5)';
    context.fillText(
      `${cell.x}, ${cell.y}, ${cell.z}`,
      cell.coordinates.center.x - 16,
      cell.coordinates.center.y + 3
    );
  }

  public drawDebugLayer(cell: MapCell & { coordinates?: Coordinates }): void {
    if (!this.showTileCount) return;
    if (!cell.coordinates) return;

    this.tileCount++;

    const context = this.graphics.getInterfaceContext();
    if (!context) return;

    context.font = '8px Verdana';
    context.fillStyle = 'rgba(255, 255, 255, .5)';
    context.fillText(
      String(this.tileCount),
      cell.coordinates.center.x - 10,
      cell.coordinates.center.y + 3
    );
  }

  public toggleClipBoundDebug(): void {
    this.showClipBounds = !this.showClipBounds;
    this.clipOffset = this.showClipBounds ? 400 : 0;
    this.graphics.setClipOffsetDebug(this.clipOffset);
  }

  private drawClipBounds(): void {
    if (!this.showClipBounds) return;

    const clipBoundary = this.graphics.clipBoundary;
    const polygon = [
      { x: clipBoundary.top, y: clipBoundary.top },
      { x: clipBoundary.right, y: clipBoundary.top },
      { x: clipBoundary.right, y: clipBoundary.bottom },
      { x: clipBoundary.top, y: clipBoundary.bottom },
      { x: clipBoundary.top, y: clipBoundary.top }
    ];

    this.graphics.drawPoly(polygon, 'rgba(0, 0, 0, 0)', 'rgba(255, 0, 0, .9)', 0, 0, 3);
  }

  private debugOverlay(): void {
    if (!this.showOverlayInfo) return;

    const context = this.graphics.getInterfaceContext();
    if (!context) return;

    const width = 280;
    const height = 100;

    this.graphics.drawPoly(
      [
        { x: 0, y: 0 },
        { x: width, y: 0 },
        { x: width, y: height },
        { x: 0, y: height },
        { x: 0, y: 0 }
      ],
      'rgba(0,0,0,.4)',
      'rgba(255,255,255,.7)',
      10,
      10
    );

    context.font = '10px Verdana';
    context.fillStyle = 'rgba(255,255,255,.9)';

    let line = 25;
    context.fillText(`map rotation: ${this.mapRotation}`, 20, line);
    line += 15;
    context.fillText(`city rotation: ${this.cityRotation}`, 20, line);
    line += 15;
  }
}
