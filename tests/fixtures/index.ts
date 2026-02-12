/**
 * Test fixtures for OpenSC2K
 * Contains mock data for testing parsers and game logic
 */

// Minimal valid SC2 file header (FORM + SC2K)
export const VALID_SC2_HEADER = new Uint8Array([
  0x46, 0x4F, 0x52, 0x4D, // "FORM"
  0x00, 0x00, 0x00, 0x00, // size (placeholder)
  0x53, 0x43, 0x44, 0x48, // "SCDH" (SimCity 2000 header)
]);

// Invalid SC2 file (wrong header)
export const INVALID_SC2_HEADER = new Uint8Array([
  0x49, 0x4E, 0x56, 0x41, // "INVA" (invalid)
  0x00, 0x00, 0x00, 0x00,
  0x4C, 0x49, 0x44, 0x21, // "LID!"
]);

// Sample tile data structure
export const MOCK_TILES = [
  {
    id: 256,
    name: "Grass",
    type: "terrain",
    description: "Basic grass terrain",
    lot_size: "1x1",
    frames: 0,
    slopes: null,
    polygon: null,
    lines: null,
    rotate_0: 256,
    rotate_1: 256,
    rotate_2: 256,
    rotate_3: 256,
    flip_h: "N",
    flip_alt_tile: "N"
  },
  {
    id: 270,
    name: "Water",
    type: "terrain",
    description: "Submerged water",
    lot_size: "1x1",
    frames: 4,
    slopes: null,
    polygon: null,
    lines: null,
    rotate_0: 270,
    rotate_1: 270,
    rotate_2: 270,
    rotate_3: 270,
    flip_h: "N",
    flip_alt_tile: "N"
  },
  {
    id: 291,
    name: "Residential Zone",
    type: "zone",
    description: "Residential zoning",
    lot_size: "1x1",
    frames: 0,
    slopes: null,
    polygon: null,
    lines: null,
    rotate_0: 291,
    rotate_1: 291,
    rotate_2: 291,
    rotate_3: 291,
    flip_h: "N",
    flip_alt_tile: "N"
  }
];

// Mock map cell data
export const MOCK_MAP_CELL = {
  x: 10,
  y: 20,
  z: 5,
  original_x: 10,
  original_y: 20,
  tiles: {
    terrain: 256,
    building: 0,
    zone: 291,
    underground: 0
  },
  water_level: "dry",
  corners: "1000",
  rotate: "N",
  coordinates: {
    top: { x: 100, y: 200 },
    right: { x: 132, y: 216 },
    bottom: { x: 100, y: 232 },
    left: { x: 68, y: 216 },
    center: { x: 100, y: 216 },
    polygon: [
      { x: 100, y: 200 },
      { x: 132, y: 216 },
      { x: 132, y: 240 },
      { x: 100, y: 256 },
      { x: 68, y: 240 },
      { x: 68, y: 216 },
      { x: 100, y: 200 }
    ]
  }
};

// Mock city data
export const MOCK_CITY_DATA = {
  id: 1,
  name: "Test City",
  tiles_x: 128,
  tiles_y: 128,
  rotation: 0,
  water_level: 4,
  year_founded: 1900,
  days_elapsed: 0,
  money: 20000,
  population: 0
};

// XTER segment test data - terrain information
export const XTER_SEGMENT_DATA = new Uint8Array([
  0x00, // flat ground (slope 0)
  0x01, // slope type 1
  0x02, // slope type 2
  0x40, // surface water
  0x3E, // waterfall
]);

// XZON segment test data - zone information
export const XZON_SEGMENT_DATA = new Uint8Array([
  0x00, // no zone
  0x01, // residential zone
  0x10, // commercial zone
  0x20, // industrial zone
]);

// XBLD segment test data - building information
export const XBLD_SEGMENT_DATA = new Uint8Array([
  0x00, // no building
  0x01, // building ID 1
  0x0E, // building ID 14 (network)
  0x6C, // building ID 108
]);

// ALTM segment test data - altitude information
export const ALTM_SEGMENT_DATA = new Uint8Array([
  0x00, 0x00, // altitude 0
  0x01, 0x00, // altitude 1
  0x0A, 0x00, // altitude 10
  0x1E, 0x00, // altitude 30 (max)
]);

// CNAM segment test data - city name
export const CNAM_SEGMENT_DATA = new Uint8Array([
  0x09, // length (9 chars)
  0x54, 0x65, 0x73, 0x74, 0x43, 0x69, 0x74, 0x79, 0x21, // "TestCity!"
]);

// MISC segment test data - miscellaneous data (32 bytes minimum)
export const MISC_SEGMENT_DATA = (() => {
  const data = new Uint8Array(3652); // Large enough buffer for all MISC data (0x0E40 + 4 bytes)
  const view = new DataView(data.buffer);
  view.setUint32(0x0008, 0); // rotation
  view.setUint32(0x000c, 1900); // year founded
  view.setUint32(0x0010, 0); // days elapsed
  view.setUint32(0x0014, 20000); // money
  view.setUint32(0x0050, 0); // population
  view.setUint32(0x0E40, 4); // water level
  return data;
})();

// Empty segments for testing
export const EMPTY_SEGMENT_DATA = new Uint8Array(0);

// RLE compressed data for testing decompression
export const RLE_COMPRESSED_DATA = new Uint8Array([
  0x03,       // 3 literal bytes follow
  0x01, 0x02, 0x03, // literal bytes
  0x80 + 5,   // RLE marker + 5 repeats
  0xFF,       // byte to repeat
  0x02,       // 2 literal bytes
  0xAA, 0xBB, // literal bytes
]);

export const RLE_DECOMPRESSED_DATA = new Uint8Array([
  0x01, 0x02, 0x03,       // literal
  0xFF, 0xFF, 0xFF, 0xFF, 0xFF, // 5 repeats
  0xAA, 0xBB,             // literal
]);

// Sample 128x128 map data (minimal)
export const SAMPLE_MAP_DATA = {
  tiles: Array.from({ length: 128 * 128 }, (_, i) => ({
    x: Math.floor(i / 128),
    y: i % 128,
    ALTM: { altitude: 0, waterFlag: false },
    XTER: { id: 0, slope: [0, 0, 0, 0], waterLevel: "dry" },
    XBLD: { id: 0 },
    XZON: { type: 0, corners: "0000" },
    XBIT: { conductive: false, powered: false },
    XUND: { subway: false, pipes: false }
  }))
};
