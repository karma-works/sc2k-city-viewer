import type { Tile, MapCell, TilemapDefinition, TilemapEntry, ClipBoundary, ClipOffset } from './types/index.js';

export interface Coordinates {
  top: { x: number; y: number };
  right: { x: number; y: number };
  bottom: { x: number; y: number };
  left: { x: number; y: number };
  center: { x: number; y: number };
  polygon: { x: number; y: number }[];
}

export interface GraphicsConfig {
  tileWidth: number;
  tileHeight: number;
  layerOffset: number;
}

export class Graphics {
  private primaryCanvas: HTMLCanvasElement | null = null;
  private primaryContext: CanvasRenderingContext2D | null = null;
  private interfaceCanvas: HTMLCanvasElement | null = null;
  private interfaceContext: CanvasRenderingContext2D | null = null;
  private scaledInterfaceContext: CanvasRenderingContext2D | null = null;

  private tilemap: TilemapDefinition = {};
  private tilemapImages: Record<string, HTMLCanvasElement> = {};
  private totalTilemaps: number = 4;
  private loadedTilemaps: number = 0;
  public ready: boolean = false;

  public drawFrame: boolean = true;
  private animationFrame: number = 0;
  private animationFrameRate: number = 500;
  private maxAnimationFrames: number = 512;

  public tileHeight: number = 32;
  public tileWidth: number = 64;
  public layerOffset: number = 24;

  private scale: number = 1;

  private vectorTileCache: Record<string, HTMLCanvasElement> = {};

  public clipOffset: ClipOffset = {
    top: 50,
    right: -100,
    bottom: -200,
    left: -100
  };

  public clipBoundary: ClipBoundary = {
    top: 0,
    right: 0,
    bottom: 0,
    left: 0
  };

  private tiles: (Tile | undefined)[] = [];
  private mapRotation: number = 0;
  public waterLevel: number = 4;
  private cityRotation: number | null = null;
  private clipOffsetDebug: number = 0;

  constructor(config?: Partial<GraphicsConfig>) {
    if (config) {
      this.tileWidth = config.tileWidth ?? this.tileWidth;
      this.tileHeight = config.tileHeight ?? this.tileHeight;
      this.layerOffset = config.layerOffset ?? this.layerOffset;
    }
  }

  public setTiles(tiles: (Tile | undefined)[]): void {
    this.tiles = tiles;
  }

  public setMapRotation(rotation: number): void {
    this.mapRotation = rotation;
  }

  public setWaterLevel(level: number): void {
    this.waterLevel = level;
  }

  public setCityRotation(rotation: number | null): void {
    this.cityRotation = rotation;
  }

  public setClipOffsetDebug(offset: number): void {
    this.clipOffsetDebug = offset;
  }

  public createRenderingCanvas(): void {
    const primaryCanvasEl = document.getElementById('primaryCanvas') as HTMLCanvasElement;
    const interfaceCanvasEl = document.getElementById('interfaceCanvas') as HTMLCanvasElement;

    if (!primaryCanvasEl || !interfaceCanvasEl) {
      throw new Error('Canvas elements not found');
    }

    this.primaryCanvas = primaryCanvasEl;
    this.primaryContext = primaryCanvasEl.getContext('2d');
    this.interfaceCanvas = interfaceCanvasEl;
    this.interfaceContext = interfaceCanvasEl.getContext('2d');
    this.scaledInterfaceContext = interfaceCanvasEl.getContext('2d');

    if (!this.primaryContext || !this.interfaceContext || !this.scaledInterfaceContext) {
      throw new Error('Failed to get canvas contexts');
    }

    const width = document.documentElement.clientWidth;
    const height = document.documentElement.clientHeight;

    this.primaryContext.canvas.width = width;
    this.primaryContext.canvas.height = height;
    this.interfaceContext.canvas.width = width;
    this.interfaceContext.canvas.height = height;
    this.scaledInterfaceContext.canvas.width = width;
    this.scaledInterfaceContext.canvas.height = height;

    this.primaryContext.imageSmoothingEnabled = false;
    this.interfaceContext.imageSmoothingEnabled = false;
    this.scaledInterfaceContext.imageSmoothingEnabled = false;

    this.loadTilemaps();
  }

  public loadingMessage(): void {
    if (!this.interfaceContext) return;
    this.interfaceContext.font = '24px Verdana';
    this.interfaceContext.fillStyle = 'rgba(255, 255, 255, 1)';
    this.interfaceContext.textAlign = 'center';
    this.interfaceContext.fillText(
      'Loading resources..',
      document.documentElement.clientWidth / 2,
      document.documentElement.clientHeight / 2
    );
    this.interfaceContext.textAlign = 'left';
  }

  private checkLoad(): void {
    this.ready = this.totalTilemaps === this.loadedTilemaps;
    if (this.ready) {
      console.log('Tilemaps Loaded');
    }
  }

  private async loadTilemaps(): Promise<void> {
    console.log('Loading Tilemaps..');

    try {
      const response = await fetch('/images/tilemap/tilemap.json');
      this.tilemap = await response.json();
    } catch (error) {
      console.error('Failed to load tilemap.json:', error);
      return;
    }

    for (let i = 0; i < this.totalTilemaps; i++) {
      const img = new Image();
      img.src = `images/tilemap/tilemap_${i}.png`;
      img.setAttribute('tilemap_id', String(i));
      img.onload = (): void => {
        const tilemapId = img.getAttribute('tilemap_id');
        if (!tilemapId) return;
        
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const context = canvas.getContext('2d');
        if (context) {
          context.drawImage(img, 0, 0);
          this.tilemapImages[tilemapId] = canvas;
        }
        this.loadedTilemaps++;
        console.log(` - tilemap_${tilemapId}.png loaded`);
        this.checkLoad();
      };
      img.onerror = (): void => {
        console.error(`Failed to load tilemap_${i}.png`);
      };
    }
  }

  public updateCanvasSize(
    tilesX: number,
    tilesY: number,
    map: (MapCell | undefined)[][],
    cameraOffsetX: number,
    cameraOffsetY: number,
    originX: { value: number },
    originY: { value: number }
  ): void {
    this.drawFrame = true;

    const width = document.documentElement.clientWidth;
    const height = document.documentElement.clientHeight;

    if (this.primaryCanvas) {
      this.primaryCanvas.width = width;
      this.primaryCanvas.height = height;
    }
    if (this.interfaceCanvas) {
      this.interfaceCanvas.width = width;
      this.interfaceCanvas.height = height;
    }

    originX.value = (width / 2 - tilesX * this.tileWidth / 2) + cameraOffsetX;
    originY.value = (height / 2) + cameraOffsetY;

    for (let tX = tilesX - 1; tX >= 0; tX--) {
      for (let tY = 0; tY < tilesY; tY++) {
        const cell = map[tX]?.[tY];
        if (cell) {
          (cell as MapCell & { coordinates?: Coordinates }).coordinates = this.getCoordinates(
            cell,
            originX.value,
            originY.value
          );
        }
      }
    }

    this.clipBoundary = {
      top: 0 + (this.clipOffset.top + this.clipOffsetDebug),
      right: width - (this.clipOffset.right + this.clipOffsetDebug),
      bottom: height - (this.clipOffset.bottom + this.clipOffsetDebug),
      left: 0 + (this.clipOffset.left + this.clipOffsetDebug)
    };
  }

  public setScale(scale: number): void {
    this.scale = scale;
    if (this.primaryContext) {
      this.primaryContext.scale(this.scale, this.scale);
    }
    if (this.scaledInterfaceContext) {
      this.scaledInterfaceContext.scale(this.scale, this.scale);
    }
  }

  public getCoordinates(cell: MapCell, originX: number, originY: number): Coordinates {
    const cellWidth = 1;

    const offX = cell.x * this.tileWidth / 2 + cell.y * this.tileWidth / 2 + originX;
    const offY = cell.y * this.tileHeight / 2 - cell.x * this.tileHeight / 2 + originY;

    const adjustedY = cell.z > 1
      ? offY - (this.layerOffset * cell.z) + this.layerOffset
      : offY;

    const topX = offX + this.tileWidth / 2;
    const topY = adjustedY + this.tileHeight - (this.tileHeight * cellWidth);

    const rightX = offX + (this.tileWidth / 2) + ((this.tileWidth / 2) * cellWidth);
    const rightY = adjustedY + this.tileHeight - ((this.tileHeight / 2) * cellWidth);

    const bottomX = offX + this.tileWidth / 2;
    const bottomY = adjustedY + this.tileHeight;

    const leftX = offX + (this.tileWidth / 2) - ((this.tileWidth / 2) * cellWidth);
    const leftY = adjustedY + this.tileHeight - ((this.tileHeight / 2) * cellWidth);

    const centerX = leftX + ((rightX - leftX) / 2);
    const centerY = topY - ((topY - bottomY) / 2);

    const polygon = [
      { x: topX, y: topY },
      { x: rightX, y: rightY },
      { x: rightX, y: rightY + this.layerOffset },
      { x: bottomX, y: bottomY + this.layerOffset },
      { x: leftX, y: leftY + this.layerOffset },
      { x: leftX, y: leftY },
      { x: topX, y: topY }
    ];

    return {
      top: { x: topX, y: topY },
      right: { x: rightX, y: rightY },
      bottom: { x: bottomX, y: bottomY },
      left: { x: leftX, y: leftY },
      center: { x: centerX, y: centerY },
      polygon
    };
  }

  public startAnimationFrames(): void {
    this.animationFrameLoop();
  }

  private animationFrameLoop(): void {
    this.animationFrame--;
    if (this.animationFrame < 0) {
      this.animationFrame = this.maxAnimationFrames;
    }
    this.drawFrame = true;
    setTimeout(() => this.animationFrameLoop(), this.animationFrameRate);
  }

  public loopEnd(): void {
    this.drawFrame = false;
  }

  public setDrawFrame(): void {
    this.drawFrame = true;
  }

  public clearCanvas(): void {
    const width = document.documentElement.clientWidth;
    const height = document.documentElement.clientHeight;

    if (this.interfaceContext) {
      this.interfaceContext.clearRect(0, 0, width, height);
    }
    if (this.scaledInterfaceContext) {
      this.scaledInterfaceContext.clearRect(0, 0, width, height);
    }
    if (this.drawFrame && this.primaryContext) {
      this.primaryContext.clearRect(0, 0, width, height);
    }
  }

  public isCellInsideClipBoundary(cell: MapCell & { coordinates?: Coordinates }): boolean {
    if (!cell.coordinates) return false;
    const { center } = cell.coordinates;
    return center.x >= this.clipBoundary.left &&
           center.x <= this.clipBoundary.right &&
           center.y >= this.clipBoundary.top &&
           center.y <= this.clipBoundary.bottom;
  }

  public isInsideClipBoundary(x: number, y: number): boolean {
    return x >= this.clipBoundary.left - (this.tileHeight * 4) &&
           x <= this.clipBoundary.right + (this.tileHeight * 3) &&
           y >= this.clipBoundary.top - this.tileWidth &&
           y <= this.clipBoundary.bottom + (this.tileWidth * 3);
  }

  private flipTile(tile: Tile, cell: MapCell & { rotate?: string }): boolean {
    if (tile.id > 110) return false;
    
    const flipH = tile.flip_h;
    if (flipH === null || flipH === 'N') return false;

    if (this.cityRotation === null) return false;

    const rotations = [0, 2];
    const rotations2 = [1, 3];

    if (rotations.includes(this.mapRotation)) {
      return cell.rotate !== 'Y';
    }
    if (rotations2.includes(this.mapRotation)) {
      return cell.rotate !== 'Y';
    }

    return false;
  }

  private getFrame(tile: Tile): number {
    if (tile.frames === 0) return 0;
    return this.animationFrame - Math.floor(this.animationFrame / tile.frames) * tile.frames;
  }

  public getTile(tileId: number, cell: (MapCell & { rotate?: string }) | null = null): Tile | undefined {
    let tile = this.tiles[tileId];
    if (!tile) return undefined;

    let rotation = this.mapRotation;

    if (tile.flip_alt_tile !== null && cell !== null) {
      const rotations = [0, 2];
      const rotations2 = [1, 3];
      const flip = this.flipTile(tile, cell);

      if (rotations.includes(rotation) && flip) {
        rotation = rotation < 3 ? rotation + 1 : 0;
      } else if (rotations2.includes(rotation) && !flip) {
        rotation = rotation < 3 ? rotation + 1 : 0;
      } else if (rotations2.includes(rotation) && flip) {
        rotation = rotation < 3 ? rotation + 1 : 0;
      }
    }

    switch (rotation) {
      case 0:
        tile = this.tiles[tile.rotate_0 ?? tileId] ?? tile;
        break;
      case 1:
        tile = this.tiles[tile.rotate_1 ?? tileId] ?? tile;
        break;
      case 2:
        tile = this.tiles[tile.rotate_2 ?? tileId] ?? tile;
        break;
      case 3:
        tile = this.tiles[tile.rotate_3 ?? tileId] ?? tile;
        break;
    }

    return tile;
  }

  public drawTile(
    tileId: number,
    cell: MapCell & { coordinates?: Coordinates; rotate?: string },
    topOffset: number = 0,
    heightMap: boolean = false
  ): void {
    if (!this.drawFrame || !this.primaryContext) return;

    if (!cell.coordinates) return;

    const x = cell.coordinates.bottom.x;
    const y = cell.coordinates.bottom.y;

    if (!this.isInsideClipBoundary(x, y)) return;

    const tile = this.getTile(tileId, cell);
    if (!tile) return;

    let tilemapId: string = String(tile.id);

    const hideAnimatedTiles = false;
    if (hideAnimatedTiles && tile.frames > 0) return;

    if (this.flipTile(tile, cell) && !heightMap) {
      tilemapId = tilemapId + '_H';
    }

    const frame = this.getFrame(tile);

    const waterLevel = (cell as MapCell & { water_level?: string }).water_level;
    if (heightMap && waterLevel === 'dry') {
      tilemapId = tilemapId + '_VT_' + cell.z;
    } else if (heightMap && waterLevel) {
      tilemapId = tilemapId + '_VW_' + cell.z;
    } else {
      tilemapId = tilemapId + '_' + frame;
    }

    const tilemap = this.tilemap[tilemapId] as TilemapEntry | undefined;
    if (!tilemap) return;

    const drawX = Math.floor(x - tilemap.w / 2);
    const drawY = Math.floor(y - tilemap.h - topOffset);

    const tilemapImage = this.tilemapImages[tilemap.t];
    if (tilemapImage) {
      this.primaryContext.drawImage(
        tilemapImage,
        tilemap.x, tilemap.y, tilemap.w, tilemap.h,
        drawX, drawY, tilemap.w, tilemap.h
      );
    }
  }

  public drawVectorTile(
    tileId: number,
    fillColor: string,
    strokeColor: string,
    innerStrokeColor: string,
    offsetX: number,
    offsetY: number,
    renderingArea?: CanvasRenderingContext2D
  ): void {
    const context = renderingArea ?? this.interfaceContext;
    if (!context) return;

    const cacheId = tileId + fillColor + strokeColor + innerStrokeColor;

    const cachedImage = this.vectorTileCache[cacheId];
    if (cachedImage) {
      context.drawImage(cachedImage, offsetX - 64, offsetY - 64);
      return;
    }

    const tile = this.tiles[tileId];
    if (!tile) return;

    const cacheCanvas = document.createElement('canvas');
    const cacheContext = cacheCanvas.getContext('2d');
    if (!cacheContext) return;

    cacheContext.canvas.width = 128;
    cacheContext.canvas.height = 128;

    if (tile.polygon) {
      this.drawPoly(tile.polygon.points ?? [], fillColor, strokeColor, 64, 64, 2, cacheContext);
    }

    if (tile.lines) {
      this.drawLines(tile.lines.lines ?? [], innerStrokeColor, 64, 64, cacheContext);
    }

    this.vectorTileCache[cacheId] = cacheCanvas;
    context.drawImage(cacheCanvas, offsetX - 64, offsetY - 64);
  }

  public distanceBetweenPoints(x1: number, y1: number, x2: number, y2: number): number {
    return Math.sqrt((x1 - x2) * (x1 - x2) + (y1 - y2) * (y1 - y2));
  }

  public isPointInPolygon(x: number, y: number, polygon: { x: number; y: number }[]): boolean {
    const p = { x, y };
    let isInside = false;

    let minX = polygon[0].x;
    let maxX = polygon[0].x;
    let minY = polygon[0].y;
    let maxY = polygon[0].y;

    for (let n = 1; n < polygon.length; n++) {
      const q = polygon[n];
      minX = Math.min(q.x, minX);
      maxX = Math.max(q.x, maxX);
      minY = Math.min(q.y, minY);
      maxY = Math.max(q.y, maxY);
    }

    if (p.x < minX || p.x > maxX || p.y < minY || p.y > maxY) {
      return false;
    }

    let i = 0;
    let j = polygon.length - 1;
    for (; i < polygon.length; j = i++) {
      if (
        (polygon[i].y > p.y) !== (polygon[j].y > p.y) &&
        p.x < (polygon[j].x - polygon[i].x) * (p.y - polygon[i].y) / (polygon[j].y - polygon[i].y) + polygon[i].x
      ) {
        isInside = !isInside;
      }
    }

    return isInside;
  }

  public drawPoly(
    polygon: { x: number; y: number }[],
    fillColor?: string,
    strokeColor?: string,
    offsetX?: number,
    offsetY?: number,
    width?: number,
    renderingArea?: CanvasRenderingContext2D
  ): void {
    if (!polygon || polygon.length === 0) return;

    const context = renderingArea ?? this.interfaceContext;
    if (!context) return;

    const fill = fillColor ?? 'rgba(255, 0, 0, .25)';
    const stroke = strokeColor ?? 'rgba(255, 0, 0, .9)';
    const lineWidth = width ?? 1;
    const offX = offsetX ?? 0;
    const offY = offsetY ?? 0;

    context.fillStyle = fill;
    context.strokeStyle = stroke;
    context.lineWidth = lineWidth;
    context.beginPath();
    context.moveTo(Math.floor(polygon[0].x + offX), Math.floor(polygon[0].y + offY));

    for (let i = 1; i < polygon.length; i++) {
      context.lineTo(Math.floor(polygon[i].x + offX), Math.floor(polygon[i].y + offY));
    }

    context.stroke();
    context.fill();
    context.closePath();
  }

  public drawLine(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    color?: string,
    width?: number,
    renderingArea?: CanvasRenderingContext2D
  ): void {
    const context = renderingArea ?? this.interfaceContext;
    if (!context) return;

    context.strokeStyle = color ?? 'white';
    context.lineWidth = width ?? 1;
    context.beginPath();
    context.moveTo(Math.floor(x1), Math.floor(y1));
    context.lineTo(Math.floor(x2), Math.floor(y2));
    context.stroke();
    context.closePath();
  }

  public drawLines(
    lines: { x1: number; y1: number; x2: number; y2: number }[],
    strokeColor?: string,
    offsetX?: number,
    offsetY?: number,
    renderingArea?: CanvasRenderingContext2D
  ): void {
    if (!lines || lines.length === 0) return;

    const context = renderingArea ?? this.interfaceContext;
    if (!context) return;

    const stroke = strokeColor ?? 'rgba(255, 0, 0, .9)';
    const width = 1;
    const offX = offsetX ?? 0;
    const offY = offsetY ?? 0;

    for (const line of lines) {
      this.drawLine(
        line.x1 + offX,
        line.y1 + offY,
        line.x2 + offX,
        line.y2 + offY,
        stroke,
        width,
        context
      );
    }
  }

  public getPrimaryContext(): CanvasRenderingContext2D | null {
    return this.primaryContext;
  }

  public getInterfaceContext(): CanvasRenderingContext2D | null {
    return this.interfaceContext;
  }
}
