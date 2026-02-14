# Doubling Asset Resolution - Engine Changes Required

This document outlines the changes needed to the game engine if all visual assets are doubled in resolution (e.g., from 64x64 tiles to 128x128 tiles).

## Current Asset Dimensions

| Property | Current Value | Location |
|----------|---------------|----------|
| Tile width | 64px | `src/Graphics.ts:37` |
| Tile height | 32px | `src/Graphics.ts:36` |
| Layer offset (elevation) | 24px | `src/Graphics.ts:38` |
| Vector tile cache | 128x128px | `src/Graphics.ts:483-484` |
| Tilemap images | 4 PNG files | `public/images/tilemap/tilemap_[0-3].png` |
| Tilemap definition | JSON sprite atlas | `public/images/tilemap/tilemap.json` |

## Required Changes

### 1. Core Tile Dimensions (`src/Graphics.ts`)

Update the hardcoded tile dimensions at lines 36-38:

```typescript
// Before
public tileHeight: number = 32;
public tileWidth: number = 64;
public layerOffset: number = 24;

// After
public tileHeight: number = 64;
public tileWidth: number = 128;
public layerOffset: number = 48;
```

### 2. Vector Tile Cache (`src/Graphics.ts`)

Update the cache canvas dimensions at lines 483-484:

```typescript
// Before
cacheContext.canvas.width = 128;
cacheContext.canvas.height = 128;

// After
cacheContext.canvas.width = 256;
cacheContext.canvas.height = 256;
```

### 3. Tilemap Definition (`public/images/tilemap/tilemap.json`)

The tilemap JSON contains sprite coordinates for each tile. All values must be doubled:

```json
// Before
{
  "tile_123": { "x": 64, "y": 128, "w": 64, "h": 64, "t": 0 }
}

// After
{
  "tile_123": { "x": 128, "y": 256, "w": 128, "h": 128, "t": 0 }
}
```

This can be automated with a script to iterate through all entries and multiply each coordinate by 2.

### 4. Tilemap Images

Replace `tilemap_0.png` through `tilemap_3.png` with the higher resolution versions. The engine loads these dynamically based on filename, so no code changes required.

## Optional Adjustments

### Clip Boundaries (`src/Graphics.ts:44-49`)

The clip boundary offsets may need adjustment for proper tile culling:

```typescript
public clipOffset: ClipOffset = {
  top: 50,      // May need to double to 100
  right: -100,  // May need to double to -200
  bottom: -200, // May need to double to -400
  left: -100    // May need to double to -200
};
```

Test rendering at map edges to determine if adjustments are needed.

### Camera Movement (`src/UI.ts:51`)

The camera step size could be doubled for consistent perceived movement speed:

```typescript
// Before
const moveOffset = 40;

// After
const moveOffset = 80;
```

## No Changes Required

The following components work with dynamic dimensions and require no modification:

- **Canvas initialization**: Uses full viewport dimensions, no hardcoded values
- **Drawing logic**: Uses `tilemap.w` and `tilemap.h` from JSON, automatically adapts
- **Coordinate calculations**: Derive from `tileWidth`/`tileHeight` constants
- **Origin calculation**: Scales based on tile dimensions

## Alternative: Scale Factor Approach

The engine has an existing but unused `scale` property (`src/Graphics.ts:39`) and `setScale()` method (`src/Graphics.ts:231-238`). To support multiple resolutions, consider:

1. Replace hardcoded dimensions with scale-relative calculations
2. Store base dimensions (e.g., `baseTileWidth = 64`)
3. Compute actual dimensions: `tileWidth = baseTileWidth * scale`
4. Allow runtime resolution switching

```typescript
// Proposed refactor
private baseTileWidth: number = 64;
private baseTileHeight: number = 32;
private baseLayerOffset: number = 24;
private scale: number = 1;

public get tileWidth(): number { return this.baseTileWidth * this.scale; }
public get tileHeight(): number { return this.baseTileHeight * this.scale; }
public get layerOffset(): number { return this.baseLayerOffset * this.scale; }
```

This would enable both 1x and 2x asset packs to work with a single codebase.

## Summary Checklist

- [ ] Update `tileHeight`, `tileWidth`, `layerOffset` in `src/Graphics.ts`
- [ ] Update vector tile cache dimensions in `src/Graphics.ts`
- [ ] Regenerate `tilemap.json` with doubled coordinates
- [ ] Replace tilemap PNG images with 2x versions
- [ ] Test clip boundaries and adjust if needed
- [ ] Consider camera movement speed adjustment
