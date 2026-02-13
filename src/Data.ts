// Data layer using sql.js (WebAssembly SQLite)

import type { Tile, MapCell, SlopeData, PolygonData, LineData } from './types/index.js';
// @ts-expect-error sql.js types are complex
import initSqlJs from 'sql.js';

interface SqlJsResult {
  Database: new (data?: ArrayLike<number> | null) => SqlJsDatabase;
}

interface SqlJsDatabase {
  run(sql: string, params?: unknown[]): SqlJsDatabase;
  exec(sql: string, params?: unknown[]): { columns?: string[]; lc?: string[]; values: unknown[][] }[];
  prepare(sql: string, params?: unknown[]): unknown;
  export(): Uint8Array;
  close(): void;
}

export class Data {
  private db: SqlJsDatabase | null = null;
  
  public cityId: number | null = null;
  public cityName: string | null = null;
  public cityRotation: number | null = null;
  public cityLoaded: boolean = false;
  public waterLevel: number = 4;
  
  public tiles: (Tile | undefined)[] = [];
  public map: (MapCell | undefined)[][] = [];

  public async init(dbUrl: string = '/db/database.db'): Promise<void> {
    console.log('Initializing sql.js...');
    
    const SQL: SqlJsResult = await initSqlJs({
      locateFile: (file: string) => `/sql-wasm-browser.wasm`
    });
    
    console.log('Loading database from:', dbUrl);
    const response = await fetch(dbUrl);
    
    if (!response.ok) {
      throw new Error(`Failed to load database: ${response.status} ${response.statusText}`);
    }
    
    const buffer = await response.arrayBuffer();
    console.log('Database buffer size:', buffer.byteLength);
    
    if (buffer.byteLength === 0) {
      throw new Error('Database file is empty');
    }
    
    this.db = new SQL.Database(new Uint8Array(buffer));
    
    if (!this.db) {
      throw new Error('Failed to create database instance');
    }
    
    const tableCheck = this.db.exec("SELECT name FROM sqlite_master WHERE type='table'");
    console.log('Tables in database:', tableCheck);
    
    console.log('Database loaded successfully');
  }

  public loadTiles(): void {
    if (!this.db) throw new Error('Database not initialized');
    
    console.log('Loading Tiles...');
    
    const result = this.db.exec('SELECT * FROM tiles ORDER BY id ASC');
    
    console.log('Query result:', result);
    
    if (result.length === 0) {
      console.warn('No tiles found in database');
      return;
    }
    
    const firstResult = result[0] as { columns?: string[]; lc?: string[]; values: unknown[][] };
    const columns = firstResult.columns || firstResult.lc;
    if (!firstResult || !columns || !firstResult.values) {
      console.error('Invalid query result structure:', firstResult);
      throw new Error('Database query returned invalid result structure');
    }
    
    const rows = firstResult.values;
    
    console.log('Columns:', columns);
    console.log('Row count:', rows.length);
    
    for (const row of rows) {
      const tile: Record<string, unknown> = {};
      columns.forEach((col: string, i: number) => {
        tile[col] = row[i];
      });
      
      this.tiles[tile.id as number] = {
        id: tile.id as number,
        name: tile.name as string,
        description: tile.description as string,
        type: tile.type as string,
        size: tile.lot_size as number,
        frames: tile.frames as number,
        width: undefined,
        height: undefined,
        image: [],
        slopes: this.parseJson(tile.slopes) as SlopeData | null,
        polygon: this.parseJson(tile.polygon) as PolygonData | null,
        lines: this.parseJson(tile.lines) as LineData | null,
        rotate_0: tile.rotate_0 as number | null,
        rotate_1: tile.rotate_1 as number | null,
        rotate_2: tile.rotate_2 as number | null,
        rotate_3: tile.rotate_3 as number | null,
        flip_h: tile.flip_h as number | null,
        flip_alt_tile: tile.flip_alt_tile as number | null
      };
    }
    
    console.log(`Tiles Loaded: ${rows.length}`);
  }

  public loadMap(maxMapSize: number = 128): { waterLevel: number; rotation: number } | null {
    if (!this.db) throw new Error('Database not initialized');
    
    const cityResult = this.db.exec(
      'SELECT * FROM city WHERE id = (SELECT MAX(id) FROM city)'
    );
    
    if (cityResult.length === 0) {
      console.warn('No city found in database');
      return null;
    }
    
    const cityColumns = cityResult[0].columns || cityResult[0].lc || [];
    const cityRow = cityResult[0].values[0];
    const city: Record<string, unknown> = {};
    cityColumns.forEach((col: string, i: number) => {
      city[col] = cityRow[i];
    });
    
    console.log(`Loading City: ${city.id}`);
    
    this.cityId = city.id as number;
    this.cityName = city.name as string;
    this.cityRotation = city.rotation as number;
    this.waterLevel = city.water_level as number;
    
    const mapResult = this.db.exec(
      'SELECT * FROM map WHERE city_id = ? AND x < ? AND y < ? ORDER BY x ASC, y ASC',
      [city.id, maxMapSize, maxMapSize]
    );
    
    if (mapResult.length === 0) {
      console.warn('No map data found');
      return null;
    }
    
    const mapColumns = mapResult[0].columns || mapResult[0].lc || [];
    const mapRows = mapResult[0].values;
    
    for (const row of mapRows) {
      const cell: Record<string, unknown> = {};
      mapColumns.forEach((col: string, i: number) => {
        cell[col] = row[i];
      });
      
      const x = cell.x as number;
      const y = cell.y as number;
      
      if (!this.map[x]) {
        this.map[x] = [];
      }
      
      this.map[x][y] = {
        x,
        y,
        z: cell.z as number,
        cornerSlope: (cell.building_corners as number) || 0,
        water_level: (cell.water_level as string) || 'normal',
        terrainHeight: cell.z as number,
        tiles: {
          terrain: cell.terrain_tile_id as number | null,
          building: cell.building_tile_id as number | null,
          zone: cell.zone_tile_id as number | null,
          network: cell.underground_tile_id as number | null
        }
      };
    }
    
    this.cityLoaded = true;
    console.log(`City Loaded: ${mapRows.length} cells`);
    
    return {
      waterLevel: this.waterLevel,
      rotation: this.cityRotation || 0
    };
  }

  private parseJson(value: unknown): unknown {
    if (!value) return null;
    if (typeof value === 'object') return value;
    try {
      return JSON.parse(value as string);
    } catch {
      return null;
    }
  }

  public close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}
