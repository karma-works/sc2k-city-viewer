import type { MapCell, Tile } from './types/index.js';
import type { Graphics, Coordinates } from './Graphics.js';

export interface UIConfig {
  graphics: Graphics;
  tiles: () => (Tile | undefined)[];
  mapRotation: number;
  layerOffset: number;
}

export class UI {
  public cameraOffsetX: number = 0;
  public cameraOffsetY: number = 0;
  public cursorX: number = -1;
  public cursorY: number = -1;
  public cursorTileX: number = -1;
  public cursorTileY: number = -1;
  public selectedTileX: number = -1;
  public selectedTileY: number = -1;

  private graphics: Graphics;
  private layerOffset: number;

  constructor(config: UIConfig) {
    this.graphics = config.graphics;
    this.layerOffset = config.layerOffset;
  }

  public setMapRotation(_rotation: number): void {
    // Map rotation handled by graphics module
  }

  public centerCameraOnClick(
    canvasWidth: number,
    canvasHeight: number,
    onUpdateCanvasSize: () => void
  ): void {
    const centerX = canvasWidth / 2;
    const centerY = canvasHeight / 2;

    const cursorOffsetX = this.cameraOffsetX - Math.floor(this.cursorX - centerX);
    const cursorOffsetY = this.cameraOffsetY - Math.floor(this.cursorY - centerY);

    this.cameraOffsetX = cursorOffsetX;
    this.cameraOffsetY = cursorOffsetY;

    onUpdateCanvasSize();
  }

  public moveCamera(direction: 'up' | 'down' | 'left' | 'right', onUpdateCanvasSize: () => void): void {
    const moveOffset = 40;

    switch (direction) {
      case 'up':
        this.cameraOffsetY += moveOffset;
        break;
      case 'down':
        this.cameraOffsetY -= moveOffset;
        break;
      case 'left':
        this.cameraOffsetX += moveOffset;
        break;
      case 'right':
        this.cameraOffsetX -= moveOffset;
        break;
    }

    onUpdateCanvasSize();
  }

  public selectionBox(
    _tX: number,
    _tY: number,
    cell: MapCell & { coordinates?: Coordinates; water_level?: string; water?: number },
    lineColor: string = 'rgba(255,255,0,.75)',
    _width: number = 2,
    fillColor: string = 'rgba(0,0,0,0)'
  ): void {
    if (!this.graphics.isCellInsideClipBoundary(cell as MapCell & { coordinates?: Coordinates })) {
      return;
    }

    if (!cell.coordinates) return;

    const offsetX = cell.coordinates.top.x;
    const tile = this.graphics.getTile(cell.tiles.terrain ?? 0);

    if (!tile || !tile.slopes) return;

    let offsetY: number;
    const hasSlope = tile.slopes.top === 1 || tile.slopes.right === 1 || 
                     tile.slopes.bottom === 1 || tile.slopes.left === 1;

    if (hasSlope) {
      offsetY = cell.water === 1 
        ? cell.coordinates.top.y 
        : cell.coordinates.top.y - this.layerOffset;
    } else {
      offsetY = cell.water === 1 
        ? cell.coordinates.top.y + this.layerOffset 
        : cell.coordinates.top.y;
    }

    const context = this.graphics.getInterfaceContext();
    if (context) {
      this.graphics.drawVectorTile(
        tile.id,
        fillColor,
        lineColor,
        'rgba(0,0,0,0)',
        offsetX,
        offsetY,
        context
      );
    }
  }
}
