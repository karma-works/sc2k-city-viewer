# OpenSC2K Web Migration Plan

## Executive Summary

This document outlines the plan to convert OpenSC2K from an Electron desktop application to a pure web-based solution that can be embedded in web pages.

## Current Architecture Analysis

### Electron Dependencies Identified

1. **Main Process (main.js)**
   - `electron` module - Creates desktop window
   - `path` module - File path resolution
   - `url` module - URL formatting
   - BrowserWindow - Desktop window management
   - App lifecycle management

2. **Game Core (js/game.js)**
   - `require('electron').remote` - Access to Electron APIs
   - `require('fs')` - File system access for tilemap.json

3. **Data Layer (js/data.js)**
   - `better-sqlite3` - SQLite database for tiles and city data
   - File system database access (`./db/database.db`)

4. **Import Module (js/import.js)**
   - `game.app.dialog.showOpenDialog` - File picker dialog
   - `game.fs.readFile` - Read .sc2 save files

5. **Graphics Module (js/graphics.js)**
   - `game.fs.readFileSync` - Synchronous file read for tilemap.json
   - `__dirname` - Electron-specific directory reference

### Browser Compatibility

**What Already Works in Browser:**
- HTML5 Canvas API (all rendering)
- JavaScript game logic
- Image loading via `new Image()`
- JSON parsing
- ArrayBuffer and typed arrays for .sc2 file parsing
- RequestAnimationFrame for game loop

**What Needs Replacement:**
- Node.js `fs` module → Fetch API or File API
- SQLite database → IndexedDB or in-memory structures
- File dialogs → HTML file input elements
- Electron app lifecycle → Standard browser events

## Migration Strategy

### Phase 0: TypeScript Migration

Before beginning the web migration, convert the entire codebase from JavaScript to strict TypeScript. This will provide type safety, better IDE support, and catch potential bugs during the migration process.

#### 0.1 Configure TypeScript

**tsconfig.json:**
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "node",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "sourceMap": true,
    "declaration": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "strictBindCallApply": true,
    "strictPropertyInitialization": true,
    "noImplicitThis": true,
    "alwaysStrict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

#### 0.2 Rename Files and Add Types

**File Renaming:**
- `js/game.js` → `src/game.ts`
- `js/graphics.js` → `src/graphics.ts`
- `js/data.js` → `src/data.ts`
- `js/import.js` → `src/import.ts`
- `js/events.js` → `src/events.ts`
- `js/ui.js` → `src/ui.ts`
- `js/util.js` → `src/util.ts`
- `js/tiles.js` → `src/tiles.ts`
- `js/debug.js` → `src/debug.ts`

#### 0.3 Define Core Types

**src/types/index.ts:**
```typescript
// Game state types
export interface GameConfig {
  width: number;
  height: number;
  container?: string | HTMLElement;
  cityUrl?: string;
}

export interface Tile {
  id: number;
  name: string;
  color: string;
  category: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CityMap {
  width: number;
  height: number;
  tiles: number[][];
  data?: Uint8Array;
}

export interface CityData {
  name: string;
  size: number;
  population: number;
  funds: number;
  date: string;
  map: CityMap;
}

export interface Camera {
  x: number;
  y: number;
  zoom: number;
  rotation: 0 | 90 | 180 | 270;
}

export interface SC2File {
  header: string;
  version: number;
  segments: SC2Segment[];
}

export interface SC2Segment {
  type: string;
  size: number;
  offset: number;
  data: Uint8Array;
}

// Event types
export type KeyHandler = (event: KeyboardEvent) => void;
export type FileHandler = (data: Uint8Array, filename: string) => void;
export type ErrorHandler = (error: Error) => void;
```

#### 0.4 Add Type Annotations to Core Files

**src/game.ts:**
```typescript
import { GameConfig, Tile, CityData, Camera } from './types';
import { Graphics } from './graphics';
import { Data } from './data';
import { Import } from './import';
import { Events } from './events';

export class Game {
  private graphics: Graphics;
  private data: Data;
  private import: Import;
  private events: Events;
  private config: GameConfig;
  private isWeb: boolean;
  
  constructor(config: GameConfig) {
    this.config = config;
    this.isWeb = true;
  }
  
  public async init(): Promise<void> {
    // Initialize modules
  }
  
  public start(): void {
    // Start game loop
  }
}
```

**src/data.ts:**
```typescript
import { Tile, CityData } from './types';

export class Data {
  private tiles: Map<number, Tile>;
  private cities: Map<number, CityData>;
  private currentCityId: number | null;
  
  constructor() {
    this.tiles = new Map();
    this.cities = new Map();
    this.currentCityId = null;
  }
  
  public async loadTiles(): Promise<void> {
    // Load from JSON
  }
  
  public getTile(id: number): Tile | undefined {
    return this.tiles.get(id);
  }
  
  public getCity(id: number): CityData | undefined {
    return this.cities.get(id);
  }
}
```

#### 0.5 Update Package Scripts

**package.json:**
```json
{
  "scripts": {
    "build": "tsc",
    "build:watch": "tsc --watch",
    "typecheck": "tsc --noEmit",
    "dev": "concurrently \"tsc --watch\" \"bun serve\"",
    "test": "bun test"
  }
}
```

#### 0.6 Benefits of TypeScript Migration

**During Web Migration:**
- Catch undefined variables from removed Electron APIs
- Type-safe module imports (no silent failures)
- IDE autocomplete for browser APIs (fetch, FileReader, etc.)
- Detect missing properties when switching data sources

**Long-term Benefits:**
- Self-documenting code with explicit types
- Refactoring support (rename symbols, extract functions)
- Catch bugs at compile time rather than runtime
- Better code reviews with type information visible

### Phase 1: Remove Electron Dependencies

#### 1.1 Replace File System Access

**Current:**
```javascript
// js/graphics.js:114
var tilemapJson = game.fs.readFileSync(__dirname + '/images/tilemap/tilemap.json');
this.tilemap = JSON.parse(tilemapJson);
```

**Migration:**
```javascript
// Use fetch API for web
fetch('images/tilemap/tilemap.json')
  .then(response => response.json())
  .then(data => {
    this.tilemap = data;
  });
```

#### 1.2 Replace File Import Dialog

**Current:**
```javascript
// js/import.js:83
game.app.dialog.showOpenDialog((fileNames) => {
  game.fs.readFile(fileNames[0], (err, data) => {
    // parse file
  });
});
```

**Migration:**
```html
<!-- Add to index.html -->
<input type="file" id="sc2FileInput" accept=".sc2" style="display:none">
<button onclick="document.getElementById('sc2FileInput').click()">Import City</button>
```

```javascript
// js/import.js
openFile: function() {
  document.getElementById('sc2FileInput').addEventListener('change', (event) => {
    const file = event.target.files[0];
    const reader = new FileReader();
    reader.onload = (e) => {
      const bytes = new Uint8Array(e.target.result);
      this.parse(bytes);
    };
    reader.readAsArrayBuffer(file);
  });
}
```

#### 1.3 Remove Electron-Specific Initialization

**Current:**
```javascript
// js/game.js:21
init: function() {
  this.app = require('electron').remote;
  this.fs = require('fs');
  // ...
}
```

**Migration:**
```javascript
// js/game.js
init: function() {
  // Remove Electron dependencies
  // Use feature detection for web compatibility
  this.isWeb = true;
  // ...
}
```

### Phase 2: Replace SQLite with sql.js (Recommended)

Instead of rewriting the entire data layer, we'll use [sql.js](https://github.com/sql-js/sql.js) - a JavaScript SQLite database that runs in the browser via WebAssembly. This allows us to reuse the existing database schema and queries with minimal changes.

The current SQLite database stores three types of data:
1. **Tiles Definition** (read-only reference data)
2. **City Metadata** (small, per-city data)
3. **Map Data** (128x128 grid = 16,384 tiles)

#### 2.1 Using sql.js

sql.js is a WebAssembly build of SQLite that works entirely in the browser:

**Installation:**
```bash
bun install sql.js
```

**Usage:**
```typescript
// src/data.ts - Using sql.js
import initSqlJs from 'sql.js';

export class Data {
  private db: any; // Database instance
  private SQL: any; // SQL.js library
  
  public async init(): Promise<void> {
    // Load sql.js from node_modules or CDN
    const SQL = await initSqlJs({
      locateFile: (file) => `/node_modules/sql.js/dist/${file}`
    });
    this.SQL = SQL;
    
    // Load the existing database file via fetch
    const response = await fetch('/db/database.db');
    const buffer = await response.arrayBuffer();
    
    // Create database from existing SQLite file
    this.db = new SQL.Database(new Uint8Array(buffer));
  }
  
  public getTiles(): Tile[] {
    const result = this.db.exec('SELECT * FROM tiles');
    return this.parseResult(result);
  }
  
  public getCityMap(cityId: number): CityMapData {
    const result = this.db.exec(
      'SELECT * FROM map WHERE city_id = ?', [cityId]
    );
    return this.parseResult(result);
  }
}
```

**Benefits:**
- **Zero schema changes**: Keep existing SQLite schema
- **SQL queries work**: No need to rewrite queries to JavaScript/JSON
- **Type-safe with TypeScript**: Full type support for database operations
- **WebAssembly performance**: Near-native SQLite performance
- **In-memory or persistent**: Can persist via IndexedDB or localStorage

**Integration with TypeScript:**
```typescript
// src/types/sql-js.d.ts
declare module 'sql.js' {
  export default function initSqlJs(config: SqlJsConfig): Promise<SqlJsStatic>;
  
  interface SqlJsStatic {
    Database: new (data?: Uint8Array) => Database;
  }
  
  interface Database {
    exec(sql: string, params?: any[]): SqlJsResult[];
    export(): Uint8Array;
    close(): void;
  }
  
  interface SqlJsResult {
    columns: string[];
    values: any[][];
  }
}
```

**Alternative: CDN Loading (No Build Step)**
```html
<!-- index.html - Load sql.js from CDN -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/sql-wasm.js"></script>
<script>
  async function initDatabase() {
    const SQL = await initSqlJs({
      locateFile: (file) => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/${file}`
    });
    const db = new SQL.Database();
    // ... use database
  }
</script>
```

**Data Persistence Options:**

1. **Read-Only Mode** (Simplest):
   - Load database from static file on each page load
   - Changes not persisted
   - Good for city viewers

2. **Save/Export Mode**:
   - Export database to file via download
   - User can re-import later
   - Compatible with .sc2 workflow

3. **IndexedDB Persistence**:
   ```typescript
   // Save to IndexedDB
   const dbData = this.db.export();
   localStorage.setItem('opensc2k_db', 
     Array.from(dbData).join(',')
   );
   
   // Load from IndexedDB
   const saved = localStorage.getItem('opensc2k_db');
   if (saved) {
     const bytes = new Uint8Array(saved.split(',').map(Number));
     this.db = new this.SQL.Database(bytes);
   }
   ```

**Comparison with Other Options:**

| Approach | Migration Effort | Performance | Code Changes | Recommendation |
|----------|-----------------|-------------|--------------|----------------|
| **sql.js** (Recommended) | Low | High (WebAssembly) | Minimal - same queries | **Use this** |
| JSON Files | Medium | Medium | Rewrite data layer | Good for simple apps |
| IndexedDB | High | Medium | Rewrite queries to JS | For complex web apps |
| In-Memory Only | Low | High | Remove persistence | For ephemeral use |

**Recommendation:** Use **sql.js** to minimize code changes and maintain the existing database architecture while gaining full browser compatibility.

### Phase 3: Create Web-Compatible Build

#### 3.1 New Project Structure

```
opensc2k-web/
├── index.html              # Main HTML file
├── css/
│   └── styles.css          # Extract inline styles
├── js/
│   ├── game.js             # Core game (modified)
│   ├── graphics.js         # Rendering (modified)
│   ├── data.js             # Data layer (replaced)
│   ├── import.js           # File import (modified)
│   ├── events.js           # Input handling
│   ├── ui.js               # UI components
│   ├── util.js             # Utilities
│   ├── tiles.js            # Tile definitions
│   ├── debug.js            # Debug tools
│   └── extract.js          # Asset extraction
├── data/
│   ├── tiles.json          # Exported from SQLite
│   └── default_city.json   # Default city data
├── images/
│   ├── tiles/              # Tile images
│   └── tilemap/            # Tilemap images + JSON
└── cities/
    └── example.sc2         # Example city files
```

#### 3.2 Module Loading

**Current:** Uses global `game` object with script tags

**Migration Options:**

Option 1: Keep global approach (simplest migration)
```html
<script src="js/game.js"></script>
<script src="js/graphics.js"></script>
<!-- ... -->
```

Option 2: ES6 Modules (modern approach)
```javascript
// js/game.js
import { Graphics } from './graphics.js';
import { Data } from './data.js';

export class Game {
  constructor() {
    this.graphics = new Graphics();
    this.data = new Data();
  }
}
```

Option 3: Webpack/Bundler (for production)
- Bundle all JS into single file
- Handle dependencies automatically
- Minification and optimization

### Phase 4: Embedding API

Create a clean API for embedding in web pages:

```html
<!DOCTYPE html>
<html>
<head>
  <title>My SimCity Viewer</title>
  <script src="opensc2k/opensc2k.js"></script>
</head>
<body>
  <div id="sc2k-container" style="width: 800px; height: 600px;"></div>
  
  <script>
    // Initialize OpenSC2K in container
    const viewer = new OpenSC2K({
      container: 'sc2k-container',
      cityUrl: 'cities/mycity.sc2',
      width: 800,
      height: 600,
      onLoad: () => console.log('City loaded!'),
      onError: (err) => console.error('Error:', err)
    });
    
    // API methods
    viewer.rotateLeft();
    viewer.rotateRight();
    viewer.setZoom(1.5);
    viewer.centerOn(x, y);
  </script>
</body>
</html>
```

### Phase 5: Implementation Steps

#### Step 0: Migrate to TypeScript (2-3 days)
1. Set up tsconfig.json with strict settings
2. Rename all `.js` files to `.ts`
3. Define core types in `src/types/index.ts`
4. Add type annotations to all functions and variables
5. Fix TypeScript errors (missing types, unsafe operations)
6. Run typecheck to ensure no errors
7. Update build scripts for TypeScript compilation

#### Step 1: Create Web-Compatible Data Layer using sql.js (1-2 days)
1. Install sql.js: `bun install sql.js`
2. Replace `better-sqlite3` imports with sql.js
3. Create type definitions for sql.js
4. Update `data.ts` to load database via fetch and execute queries with sql.js
5. Add sql.js initialization to game startup sequence
6. Test all database queries in browser
7. Add persistence option (optional: save to localStorage/IndexedDB)

#### Step 2: Replace File System Calls (1 day)
1. Replace `fs.readFileSync` with fetch
2. Replace file dialog with HTML input
3. Update import.ts for FileReader API

#### Step 3: Remove Electron Dependencies (1 day)
1. Remove `require('electron')` calls
2. Remove `require('fs')` calls
3. Update game.init()

#### Step 4: Create Build System (1-2 days)
1. Set up simple HTTP server
2. Organize file structure
3. Test in browser

#### Step 5: Create Embedding API (2 days)
1. Design public API
2. Create initialization wrapper
3. Add configuration options

#### Step 6: Testing & Optimization (2-3 days)
1. Cross-browser testing
2. Performance optimization
3. Memory usage review

**Total Estimated Time: 10-13 days (includes TypeScript migration - sql.js reduces database migration effort)**

## Technical Considerations

### Performance

**Current Desktop Performance:**
- SQLite queries are fast
- Direct file system access
- No network overhead

**Web Performance Considerations:**
- sql.js WebAssembly file: ~1MB (one-time load, cached)
- SQLite database file: ~1-2MB per city
- Initial load: 1-2 seconds on fast connection
- Memory usage: ~50-100MB for city data (same as desktop)
- SQL queries remain fast with sql.js WebAssembly

**Optimizations:**
- Lazy load tile images
- Cache sql.js in browser (service worker or CDN)
- Cache parsed data in memory
- Use requestAnimationFrame efficiently (already implemented)
- Consider IndexedDB for database persistence across sessions

### Browser Compatibility

**Required Features:**
- HTML5 Canvas (all modern browsers)
- WebAssembly (sql.js requirement) - Chrome 57+, Firefox 52+, Safari 11+, Edge 16+
- Fetch API (IE11 needs polyfill)
- FileReader API (all modern browsers)
- ES6 (or transpile to ES5)
- TypedArrays (all modern browsers)

**Supported Browsers:**
- Chrome 57+
- Firefox 52+
- Safari 11+
- Edge 79+ (Edge 16+ for WebAssembly, 79+ for Chromium)

### Security

**Considerations:**
- No local file system access (sandboxed)
- User must explicitly select .sc2 files
- No server-side components needed
- Can run entirely client-side

## Migration Checklist

### TypeScript Migration (Phase 0)

- [ ] Create `tsconfig.json` with strict settings
- [ ] Set up `src/types/index.ts` with core type definitions
- [ ] Rename `js/*.js` → `src/*.ts`
- [ ] Add type annotations to `game.ts`
- [ ] Add type annotations to `graphics.ts`
- [ ] Add type annotations to `data.ts`
- [ ] Add type annotations to `import.ts`
- [ ] Add type annotations to `events.ts`
- [ ] Add type annotations to `ui.ts`
- [ ] Add type annotations to `util.ts`
- [ ] Add type annotations to `tiles.ts`
- [ ] Add type annotations to `debug.ts`
- [ ] Run `bun run typecheck` with zero errors
- [ ] Update `package.json` scripts for TypeScript

### Web Migration (Phases 1-5)

#### Files to Modify

- [ ] `main.js` → Remove entirely (not needed for web)
- [ ] `src/game.ts` → Remove Electron/fs dependencies
- [ ] `src/data.ts` → Replace `better-sqlite3` with sql.js (WebAssembly SQLite)
- [ ] `src/import.ts` → Replace file dialog with HTML input
- [ ] `src/graphics.ts` → Replace fs.readFileSync with fetch
- [ ] `package.json` → Remove Electron dependencies

#### Files to Create

- [ ] `src/types/index.ts` → Core type definitions
- [ ] `src/types/sql-js.d.ts` → Type definitions for sql.js
- [ ] `src/opensc2k.ts` → Public embedding API
- [ ] `css/styles.css` → Extract inline styles
- [ ] `README-WEB.md` → Web-specific documentation

#### Dependencies to Add

- [ ] `sql.js` → SQLite in browser via WebAssembly
- [ ] `@types/sql.js` → TypeScript definitions (or create custom)

### Testing Checklist

- [ ] City import via file input
- [ ] Tile rendering
- [ ] Camera controls (arrow keys, rotation)
- [ ] Zoom functionality
- [ ] Debug overlays
- [ ] Performance on large cities
- [ ] Mobile browser compatibility
- [ ] Embedding in iframe

## Example: Minimal Web Version

Here's the minimal code needed for a working web version:

```html
<!DOCTYPE html>
<html>
<head>
  <title>OpenSC2K Web</title>
  <style>
    body { margin: 0; background: #371700; overflow: hidden; }
    canvas { position: absolute; top: 0; left: 0; }
  </style>
</head>
<body>
  <input type="file" id="fileInput" accept=".sc2" style="position: absolute; z-index: 100;">
  <canvas id="primaryCanvas"></canvas>
  
  <script>
    // Minimal game object
    const game = {
      async init() {
        // Load tiles JSON
        const response = await fetch('data/tiles.json');
        this.tiles = await response.json();
        
        // Setup canvas
        this.canvas = document.getElementById('primaryCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        
        // Setup file input
        document.getElementById('fileInput').addEventListener('change', (e) => {
          const file = e.target.files[0];
          const reader = new FileReader();
          reader.onload = (event) => {
            this.loadCity(new Uint8Array(event.target.result));
          };
          reader.readAsArrayBuffer(file);
        });
        
        this.loop();
      },
      
      loadCity(bytes) {
        // Parse .sc2 file (reuse existing parser)
        // Store in memory (no SQLite)
        this.cityData = this.parseSC2(bytes);
      },
      
      loop() {
        // Game loop
        this.render();
        requestAnimationFrame(() => this.loop());
      },
      
      render() {
        // Render city
      }
    };
    
    game.init();
  </script>
</body>
</html>
```

## Conclusion

Migrating OpenSC2K to a pure web solution is feasible and involves:

1. **Converting to TypeScript** (Phase 0) - Add strict type safety before migration
2. **Replacing Node.js modules** with browser APIs (fetch, FileReader)
3. **Using sql.js** to run SQLite in the browser (no schema changes needed)
4. **Removing Electron shell** and running directly in browser
5. **Creating an embedding API** for easy integration

The core rendering engine (Canvas API) and game logic require minimal changes since they already use web-standard technologies. Using sql.js means the database layer requires only minimal modifications (swapping the Node.js SQLite binding for the WebAssembly version).

**Next Steps:**
1. **Convert to TypeScript** - Add types and strict configuration
2. **Install and configure sql.js** - Test database loading in browser
3. Begin incremental migration of modules (Electron removal)
4. Test and iterate

This migration will enable OpenSC2K to be embedded in any webpage, shared via URL, and run on any device with a modern browser.
