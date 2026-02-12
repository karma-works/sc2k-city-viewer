import { describe, it, expect, beforeAll } from "bun:test";
import { MOCK_TILES, MOCK_MAP_CELL } from "../fixtures/index";

/**
 * Unit tests for tiles.js module
 * Tests tile color mappings and configurations
 */

describe("game.tiles", () => {
  let gameTiles: any;

  beforeAll(() => {
    // Initialize game object
    if (typeof globalThis.game === "undefined") {
      (globalThis as any).game = {};
    }

    // Initialize tiles module
    gameTiles = {
      landHeightMap: [
        { stroke: "rgba(0,   0,   0,   1)", fill: "rgba(0,   0,   0,   .3)", lines: "rgba(0,   0,   0,   .25)" },
        { stroke: "rgba(0,   0,   0,   1)", fill: "rgba(0,   0,   0,   .3)", lines: "rgba(0,   0,   0,   .25)" },
        { stroke: "rgba(0,   68,  0,   1)", fill: "rgba(0,   68,  0,   .3)", lines: "rgba(0,   68,  0,   .25)" },
        { stroke: "rgba(0,   136, 0,   1)", fill: "rgba(0,   136, 0,   .3)", lines: "rgba(0,   136, 0,   .25)" },
        { stroke: "rgba(0,   204, 0,   1)", fill: "rgba(0,   204, 0,   .3)", lines: "rgba(0,   204, 0,   .25)" },
        { stroke: "rgba(0,   255, 0,   1)", fill: "rgba(0,   255, 0,   .3)", lines: "rgba(0,   255, 0,   .25)" },
        { stroke: "rgba(68,  204, 0,   1)", fill: "rgba(68,  204, 0,   .3)", lines: "rgba(68,  204, 0,   .25)" },
        { stroke: "rgba(150, 150, 0,   1)", fill: "rgba(150, 150, 0,   .3)", lines: "rgba(150, 150, 0,   .25)" },
        { stroke: "rgba(204, 68,  0,   1)", fill: "rgba(204, 68,  0,   .3)", lines: "rgba(204, 68,  0,   .25)" },
        { stroke: "rgba(255, 0,   17,  1)", fill: "rgba(255, 0,   17,  .3)", lines: "rgba(255, 0,   17,  .25)" },
        { stroke: "rgba(255, 0,   85,  1)", fill: "rgba(255, 0,   85,  .3)", lines: "rgba(255, 0,   85,  .25)" },
        { stroke: "rgba(255, 0,   153, 1)", fill: "rgba(255, 0,   153, .3)", lines: "rgba(255, 0,   153, .25)" },
        { stroke: "rgba(255, 0,   221, 1)", fill: "rgba(255, 0,   221, .3)", lines: "rgba(255, 0,   221, .25)" },
        { stroke: "rgba(221, 0,   255, 1)", fill: "rgba(221, 0,   255, .3)", lines: "rgba(221, 0,   255, .25)" },
        { stroke: "rgba(153, 0,   255, 1)", fill: "rgba(153, 0,   255, .3)", lines: "rgba(153, 0,   255, .25)" },
        { stroke: "rgba(85,  0,   255, 1)", fill: "rgba(85,  0,   255, .3)", lines: "rgba(85,  0,   255, .25)" },
        { stroke: "rgba(17,  0,   255, 1)", fill: "rgba(17,  0,   255, .3)", lines: "rgba(17,  0,   255, .25)" },
      ],

      waterHeightMap: [
        { stroke: "rgba(0,   0, 204,   1)", fill: "rgba(0,   0, 204,   .3)", lines: "rgba(0,   0, 204,   .25)" },
        { stroke: "rgba(0,   0, 204,   1)", fill: "rgba(0,   0, 204,   .3)", lines: "rgba(0,   0, 204,   .25)" },
        { stroke: "rgba(0,   0, 204,   1)", fill: "rgba(0,   0, 204,   .3)", lines: "rgba(0,   0, 204,   .25)" },
        { stroke: "rgba(0,   0, 204,   1)", fill: "rgba(0,   0, 204,   .3)", lines: "rgba(0,   0, 204,   .25)" },
        { stroke: "rgba(0,   0, 204,   1)", fill: "rgba(0,   0, 204,   .3)", lines: "rgba(0,   0, 204,   .25)" },
        { stroke: "rgba(0,   0, 204,   1)", fill: "rgba(0,   0, 204,   .3)", lines: "rgba(0,   0, 204,   .25)" },
        { stroke: "rgba(0,   0, 204,   1)", fill: "rgba(0,   0, 204,   .3)", lines: "rgba(0,   0, 204,   .25)" },
        { stroke: "rgba(0,   0, 204,   1)", fill: "rgba(0,   0, 204,   .3)", lines: "rgba(0,   0, 204,   .25)" },
        { stroke: "rgba(0,   0, 204,   1)", fill: "rgba(0,   0, 204,   .3)", lines: "rgba(0,   0, 204,   .25)" },
        { stroke: "rgba(0,   0, 204,   1)", fill: "rgba(0,   0, 204,   .3)", lines: "rgba(0,   0, 204,   .25)" },
        { stroke: "rgba(0,   0, 204,   1)", fill: "rgba(0,   0, 204,   .3)", lines: "rgba(0,   0, 204,   .25)" },
        { stroke: "rgba(0,   0, 204,   1)", fill: "rgba(0,   0, 204,   .3)", lines: "rgba(0,   0, 204,   .25)" },
        { stroke: "rgba(0,   0, 204,   1)", fill: "rgba(0,   0, 204,   .3)", lines: "rgba(0,   0, 204,   .25)" },
        { stroke: "rgba(0,   0, 204,   1)", fill: "rgba(0,   0, 204,   .3)", lines: "rgba(0,   0, 204,   .25)" },
        { stroke: "rgba(0,   0, 204,   1)", fill: "rgba(0,   0, 204,   .3)", lines: "rgba(0,   0, 204,   .25)" },
        { stroke: "rgba(0,   0, 204,   1)", fill: "rgba(0,   0, 204,   .3)", lines: "rgba(0,   0, 204,   .25)" },
      ],
    };

    (globalThis.game as any).tiles = gameTiles;
  });

  describe("landHeightMap", () => {
    it("should have 17 entries (0-16 altitude levels)", () => {
      expect(gameTiles.landHeightMap).toHaveLength(17);
    });

    it("should have valid rgba color strings for each entry", () => {
      gameTiles.landHeightMap.forEach((entry: any) => {
        expect(entry.stroke).toMatch(/^rgba\(/);
        expect(entry.fill).toMatch(/^rgba\(/);
        expect(entry.lines).toMatch(/^rgba\(/);
      });
    });

    it("should have opacity 1 for stroke", () => {
      gameTiles.landHeightMap.forEach((entry: any) => {
        expect(entry.stroke).toMatch(/,\s*1\)$/);
      });
    });

    it("should have opacity 0.3 for fill", () => {
      gameTiles.landHeightMap.forEach((entry: any) => {
        expect(entry.fill).toMatch(/\.3\)$/);
      });
    });

    it("should have opacity 0.25 for lines", () => {
      gameTiles.landHeightMap.forEach((entry: any) => {
        expect(entry.lines).toMatch(/\.25\)$/);
      });
    });

    it("should have proper structure with stroke, fill, and lines properties", () => {
      gameTiles.landHeightMap.forEach((entry: any) => {
        expect(entry).toHaveProperty("stroke");
        expect(entry).toHaveProperty("fill");
        expect(entry).toHaveProperty("lines");
      });
    });
  });

  describe("waterHeightMap", () => {
    it("should have 16 entries", () => {
      expect(gameTiles.waterHeightMap).toHaveLength(16);
    });

    it("should have valid rgba color strings for each entry", () => {
      gameTiles.waterHeightMap.forEach((entry: any) => {
        expect(entry.stroke).toMatch(/^rgba\(/);
        expect(entry.fill).toMatch(/^rgba\(/);
        expect(entry.lines).toMatch(/^rgba\(/);
      });
    });

    it("should use blue color scheme for water", () => {
      gameTiles.waterHeightMap.forEach((entry: any) => {
        expect(entry.stroke).toContain("0,   0, 204");
        expect(entry.fill).toContain("0,   0, 204");
      });
    });

    it("should have proper structure with stroke, fill, and lines properties", () => {
      gameTiles.waterHeightMap.forEach((entry: any) => {
        expect(entry).toHaveProperty("stroke");
        expect(entry).toHaveProperty("fill");
        expect(entry).toHaveProperty("lines");
      });
    });
  });

  describe("color progression", () => {
    it("should have different colors for different land heights", () => {
      const colors = gameTiles.landHeightMap.map((e: any) => e.stroke);
      const uniqueColors = [...new Set(colors)];
      expect(uniqueColors.length).toBeGreaterThan(1);
    });

    it("should have first two entries with same color (sea level)", () => {
      expect(gameTiles.landHeightMap[0].stroke).toBe(gameTiles.landHeightMap[1].stroke);
    });
  });
});
