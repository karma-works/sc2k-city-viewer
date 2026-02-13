// Core type definitions for OpenSC2K

// Game Configuration
export interface GameConfig {
  width: number;
  height: number;
  container?: string | HTMLElement;
  cityUrl?: string;
}

// Browser Capabilities
export interface BrowserCapabilities {
  fileReader: boolean;
  webAssembly: boolean;
  fetch: boolean;
  canvas: boolean;
}

// Tile Definition
export interface Tile {
  id: number;
  name: string;
  description: string;
  type: string;
  size: number;
  frames: number;
  width?: number;
  height?: number;
  image: HTMLImageElement[];
  slopes: SlopeData | null;
  polygon: PolygonData | null;
  lines: LineData | null;
  rotate_0: number | null;
  rotate_1: number | null;
  rotate_2: number | null;
  rotate_3: number | null;
  flip_h: number | null;
  flip_alt_tile: number | null;
}

export interface SlopeData {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
}

export interface PolygonData {
  points?: number[][];
  color?: string;
}

export interface LineData {
  lines?: number[][];
  color?: string;
}

export interface MapCell {
  x: number;
  y: number;
  z: number;
  cornerSlope: number;
  water_level: string;
  terrainHeight: number;
  tiles: MapCellTiles;
}

export interface MapCellTiles {
  terrain: number | null;
  building: number | null;
  zone: number | null;
  network: number | null;
}

export interface CityData {
  id: number;
  name: string;
  rotation: number;
  water_level: number;
}

export interface Camera {
  x: number;
  y: number;
  zoom: number;
  rotation: 0 | 90 | 180 | 270;
}

export interface SC2Segment {
  type: string;
  size: number;
  offset: number;
  data: Uint8Array;
}

export type FileLoadHandler = (data: Uint8Array, filename: string) => void;
export type ErrorHandler = (error: Error) => void;

export interface TilemapEntry {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TilemapDefinition {
  [key: string]: TilemapEntry;
}

export interface QueryResult {
  columns: string[];
  values: any[][];
}

export interface ClipBoundary {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface ClipOffset {
  top: number;
  right: number;
  bottom: number;
  left: number;
}
