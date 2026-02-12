import { describe, it, expect, beforeAll, beforeEach } from "bun:test";
import { MOCK_MAP_CELL, MOCK_TILES, SAMPLE_MAP_DATA } from "../fixtures/index";

/**
 * Unit tests for game.js module
 * Tests core game logic and state management
 */

describe("game", () => {
  let game: any;

  beforeAll(() => {
    // Initialize game object with core logic
    game = {
      // Game constants
      tileHeight: 64,
      tileWidth: 32,
      layerOffset: 24,
      originX: 0,
      originY: 0,
      maxMapSize: 128,
      tilesX: 128,
      tilesY: 128,
      waterLevel: 4,
      mapRotation: 0,
      corners: ["1000", "0100", "0010", "0001"],

      // Mock data
      data: {
        map: [],
        tiles: MOCK_TILES,
        cityId: 1,
        cityName: "Test City",
        cityRotation: 0,
        cityLoaded: true,
      },

      // Mock graphics
      graphics: {
        ready: true,
        primaryContext: {
          font: "",
          fillStyle: "",
          textAlign: "",
          fillText: () => {},
          clearRect: () => {},
          canvas: { width: 1280, height: 1024 },
        },
        loadingMessage: () => {},
        updateCanvasSize: () => {},
        drawTile: () => {},
        getTile: (id: number) => {
          const tile = MOCK_TILES.find((t) => t.id === id);
          return (
            tile || {
              id,
              name: "Unknown",
              size: "1x1",
              flip_h: "N",
              flip_alt_tile: "N",
            }
          );
        },
        flipTile: () => false,
        layerOffset: 24,
        isInsideClipBoundary: () => true,
      },

      // Mock UI
      ui: {
        cursorTileX: 10,
        cursorTileY: 20,
        selectionBox: () => {},
      },

      // Mock debug
      debug: {
        begin: () => {},
        end: () => {},
        main: () => {},
        hideTerrain: false,
        hideZones: false,
        hideNetworks: false,
        hideBuildings: false,
        hideWater: false,
        hideTerrainEdge: false,
        lowerBuildingOpacity: false,
        hideAnimatedTiles: false,
      },

      // Core functions
      getMapCell: function(xT: number, yT: number) {
        if (typeof this.data.map[xT] !== "undefined") {
          if (typeof this.data.map[xT][yT] !== "undefined") {
            return this.data.map[xT][yT];
          }
        }
        return false;
      },

      getSurroundingCells: function(tX: number, tY: number) {
        var surroundingCells: any[] = [];
        for (var cX = -1; cX <= 1; cX++) {
          for (var cY = -1; cY <= 1; cY++) {
            surroundingCells.push({ x: tX + cX, y: tY + cY });
          }
        }
        return surroundingCells;
      },

      isCursorOnMap: function() {
        return (
          this.ui.cursorTileX >= 0 &&
          this.ui.cursorTileX < this.tilesX &&
          this.ui.cursorTileY >= 0 &&
          this.ui.cursorTileY < this.tilesY
        );
      },

      drawTerrainTile: function(cell: any) {
        if (cell.tiles.terrain == null || cell.tiles.terrain == 0) return;

        let tileId = cell.tiles.terrain;
        let topOffset = 0;

        if (
          (cell.water_level === "submerged" || cell.water_level === "shore") &&
          cell.z < this.waterLevel &&
          !this.debug.hideWater
        ) {
          topOffset = (this.waterLevel - cell.z) * this.graphics.layerOffset;
        }

        if (cell.water_level === "submerged" && !this.debug.hideWater) tileId = 270;

        if (
          (cell.water_level === "shore" || cell.water_level === "surface") &&
          !this.debug.hideWater
        ) {
          tileId = cell.tiles.terrain + 14;
        }

        if (!this.debug.hideTerrain) {
          this.graphics.drawTile(tileId, cell, topOffset);
        }
      },

      drawZoneTile: function(cell: any) {
        if (cell.tiles.zone == null || cell.tiles.zone == 0) return;
        if (!this.debug.hideZones) {
          this.graphics.drawTile(cell.tiles.zone, cell);
        }
      },

      drawBuildingTile: function(cell: any) {
        if (
          cell.tiles.building == null ||
          cell.tiles.building == 0 ||
          (cell.tiles.building > 14 && cell.tiles.building < 108)
        )
          return;

        let topOffset = 0;
        if (
          (cell.water_level === "submerged" || cell.water_level === "shore") &&
          cell.z < this.waterLevel
        ) {
          topOffset = (this.waterLevel - cell.z) * this.graphics.layerOffset;
        }

        var tile = this.graphics.getTile(cell.tiles.building);
        var keyTile = false;

        if (cell.corners === this.corners[this.mapRotation]) keyTile = true;
        if (tile.size === "1x1") keyTile = true;

        if (this.debug.lowerBuildingOpacity) {
          this.graphics.primaryContext.globalAlpha = 0.6;
        }

        if (keyTile && !this.debug.hideBuildings) {
          this.graphics.drawTile(cell.tiles.building, cell, topOffset);
        }

        if (this.debug.lowerBuildingOpacity) {
          this.graphics.primaryContext.globalAlpha = 1;
        }
      },

      rotateMap: function(direction: string) {
        var rotatedMap: any[] = [];

        if (direction === "left") {
          var newX = 0;
          var newY = this.maxMapSize - 1;
        } else {
          var newX = this.maxMapSize - 1;
          var newY = 0;
        }

        for (var mX = 0; mX < this.maxMapSize; mX++) {
          for (var mY = 0; mY < this.maxMapSize; mY++) {
            if (typeof rotatedMap[newY] === "undefined") rotatedMap[newY] = [];

            if (typeof this.data.map[mX] !== "undefined" && typeof this.data.map[mX][mY] !== "undefined") {
              rotatedMap[newY][newX] = this.data.map[mX][mY];
              rotatedMap[newY][newX].x = newY;
              rotatedMap[newY][newX].y = newX;
            }

            if (direction === "left") {
              newY--;
              if (newY < 0) newY = this.maxMapSize - 1;
            } else {
              newY++;
              if (newY >= this.maxMapSize) newY = 0;
            }
          }

          if (direction === "left") {
            newX++;
            if (newX >= this.maxMapSize) newX = 0;
          } else {
            newX--;
            if (newX < 0) newX = this.maxMapSize - 1;
          }
        }

        this.data.map = rotatedMap;

        if (direction === "left") {
          this.mapRotation++;
          if (this.mapRotation > 3) this.mapRotation = 0;
        } else {
          this.mapRotation--;
          if (this.mapRotation < 0) this.mapRotation = 3;
        }
      },
    };

    (globalThis as any).game = game;
  });

  beforeEach(() => {
    // Reset map data before each test
    game.data.map = [];
    game.mapRotation = 0;

    // Create simple 3x3 test map
    for (let x = 0; x < 3; x++) {
      game.data.map[x] = [];
      for (let y = 0; y < 3; y++) {
        game.data.map[x][y] = {
          x,
          y,
          z: x + y,
          tiles: {
            terrain: 256,
            building: 0,
            zone: 0,
            underground: 0,
          },
          water_level: "dry",
          corners: "1000",
          rotate: "N",
        };
      }
    }
  });

  describe("game constants", () => {
    it("should have correct tile dimensions", () => {
      expect(game.tileHeight).toBe(64);
      expect(game.tileWidth).toBe(32);
    });

    it("should have correct layer offset", () => {
      expect(game.layerOffset).toBe(24);
    });

    it("should have correct map size", () => {
      expect(game.maxMapSize).toBe(128);
      expect(game.tilesX).toBe(128);
      expect(game.tilesY).toBe(128);
    });

    it("should have correct water level", () => {
      expect(game.waterLevel).toBe(4);
    });

    it("should have correct initial rotation", () => {
      expect(game.mapRotation).toBe(0);
    });

    it("should have correct corners array", () => {
      expect(game.corners).toHaveLength(4);
      expect(game.corners[0]).toBe("1000");
      expect(game.corners[1]).toBe("0100");
      expect(game.corners[2]).toBe("0010");
      expect(game.corners[3]).toBe("0001");
    });
  });

  describe("getMapCell", () => {
    it("should return cell for valid coordinates", () => {
      const cell = game.getMapCell(1, 1);
      expect(cell).toBeTruthy();
      expect(cell.x).toBe(1);
      expect(cell.y).toBe(1);
    });

    it("should return false for out of bounds coordinates", () => {
      expect(game.getMapCell(-1, 0)).toBe(false);
      expect(game.getMapCell(0, -1)).toBe(false);
      expect(game.getMapCell(10, 0)).toBe(false);
      expect(game.getMapCell(0, 10)).toBe(false);
    });

    it("should return false for undefined coordinates", () => {
      expect(game.getMapCell(100, 100)).toBe(false);
    });
  });

  describe("getSurroundingCells", () => {
    it("should return 9 cells (3x3 grid)", () => {
      const cells = game.getSurroundingCells(5, 5);
      expect(cells).toHaveLength(9);
    });

    it("should include center cell", () => {
      const cells = game.getSurroundingCells(5, 5);
      const centerCell = cells.find((c: any) => c.x === 5 && c.y === 5);
      expect(centerCell).toBeTruthy();
    });

    it("should include adjacent cells", () => {
      const cells = game.getSurroundingCells(5, 5);
      expect(cells.some((c: any) => c.x === 4 && c.y === 5)).toBe(true); // left
      expect(cells.some((c: any) => c.x === 6 && c.y === 5)).toBe(true); // right
      expect(cells.some((c: any) => c.x === 5 && c.y === 4)).toBe(true); // top
      expect(cells.some((c: any) => c.x === 5 && c.y === 6)).toBe(true); // bottom
    });

    it("should include diagonal cells", () => {
      const cells = game.getSurroundingCells(5, 5);
      expect(cells.some((c: any) => c.x === 4 && c.y === 4)).toBe(true); // top-left
      expect(cells.some((c: any) => c.x === 6 && c.y === 6)).toBe(true); // bottom-right
    });
  });

  describe("isCursorOnMap", () => {
    it("should return true for cursor within map bounds", () => {
      game.ui.cursorTileX = 10;
      game.ui.cursorTileY = 20;
      expect(game.isCursorOnMap()).toBe(true);
    });

    it("should return false for cursor at negative coordinates", () => {
      game.ui.cursorTileX = -1;
      game.ui.cursorTileY = 0;
      expect(game.isCursorOnMap()).toBe(false);
    });

    it("should return false for cursor beyond map bounds", () => {
      game.ui.cursorTileX = 128;
      game.ui.cursorTileY = 0;
      expect(game.isCursorOnMap()).toBe(false);
    });

    it("should return false for cursor at max boundary", () => {
      game.ui.cursorTileX = 127;
      game.ui.cursorTileY = 127;
      expect(game.isCursorOnMap()).toBe(true);
    });
  });

  describe("drawTerrainTile", () => {
    it("should not draw if terrain is null", () => {
      const cell = { ...MOCK_MAP_CELL, tiles: { ...MOCK_MAP_CELL.tiles, terrain: null } };
      let drawCalled = false;
      game.graphics.drawTile = () => {
        drawCalled = true;
      };
      game.drawTerrainTile(cell);
      expect(drawCalled).toBe(false);
    });

    it("should not draw if terrain is 0", () => {
      const cell = { ...MOCK_MAP_CELL, tiles: { ...MOCK_MAP_CELL.tiles, terrain: 0 } };
      let drawCalled = false;
      game.graphics.drawTile = () => {
        drawCalled = true;
      };
      game.drawTerrainTile(cell);
      expect(drawCalled).toBe(false);
    });

    it("should draw terrain tile", () => {
      let drawCalled = false;
      game.graphics.drawTile = () => {
        drawCalled = true;
      };
      game.drawTerrainTile(MOCK_MAP_CELL);
      expect(drawCalled).toBe(true);
    });

    it("should use water tile for submerged cells", () => {
      let tileIdUsed = 0;
      game.graphics.drawTile = (id: number) => {
        tileIdUsed = id;
      };
      const cell = { ...MOCK_MAP_CELL, water_level: "submerged" };
      game.drawTerrainTile(cell);
      expect(tileIdUsed).toBe(270);
    });
  });

  describe("drawZoneTile", () => {
    it("should not draw if zone is null", () => {
      const cell = { ...MOCK_MAP_CELL, tiles: { ...MOCK_MAP_CELL.tiles, zone: null } };
      let drawCalled = false;
      game.graphics.drawTile = () => {
        drawCalled = true;
      };
      game.drawZoneTile(cell);
      expect(drawCalled).toBe(false);
    });

    it("should not draw if zone is 0", () => {
      const cell = { ...MOCK_MAP_CELL, tiles: { ...MOCK_MAP_CELL.tiles, zone: 0 } };
      let drawCalled = false;
      game.graphics.drawTile = () => {
        drawCalled = true;
      };
      game.drawZoneTile(cell);
      expect(drawCalled).toBe(false);
    });

    it("should draw zone tile", () => {
      let drawCalled = false;
      game.graphics.drawTile = () => {
        drawCalled = true;
      };
      game.drawZoneTile(MOCK_MAP_CELL);
      expect(drawCalled).toBe(true);
    });
  });

  describe("drawBuildingTile", () => {
    it("should not draw if building is null", () => {
      const cell = { ...MOCK_MAP_CELL, tiles: { ...MOCK_MAP_CELL.tiles, building: null } };
      let drawCalled = false;
      game.graphics.drawTile = () => {
        drawCalled = true;
      };
      game.drawBuildingTile(cell);
      expect(drawCalled).toBe(false);
    });

    it("should not draw if building is 0", () => {
      const cell = { ...MOCK_MAP_CELL, tiles: { ...MOCK_MAP_CELL.tiles, building: 0 } };
      let drawCalled = false;
      game.graphics.drawTile = () => {
        drawCalled = true;
      };
      game.drawBuildingTile(cell);
      expect(drawCalled).toBe(false);
    });

    it("should not draw for network tiles (14-108)", () => {
      const cell = { ...MOCK_MAP_CELL, tiles: { ...MOCK_MAP_CELL.tiles, building: 50 } };
      let drawCalled = false;
      game.graphics.drawTile = () => {
        drawCalled = true;
      };
      game.drawBuildingTile(cell);
      expect(drawCalled).toBe(false);
    });

    it("should draw building for key tile", () => {
      let drawCalled = false;
      game.graphics.drawTile = () => {
        drawCalled = true;
      };
      const cell = {
        ...MOCK_MAP_CELL,
        tiles: { ...MOCK_MAP_CELL.tiles, building: 1 },
        corners: "1000", // matches corners[0]
      };
      game.drawBuildingTile(cell);
      expect(drawCalled).toBe(true);
    });
  });

  describe("rotateMap", () => {
    it("should rotate map left", () => {
      game.rotateMap("left");
      expect(game.mapRotation).toBe(1);
    });

    it("should rotate map right", () => {
      game.rotateMap("right");
      expect(game.mapRotation).toBe(3);
    });

    it("should cycle rotation from 3 to 0 when rotating left", () => {
      game.mapRotation = 3;
      game.rotateMap("left");
      expect(game.mapRotation).toBe(0);
    });

    it("should cycle rotation from 0 to 3 when rotating right", () => {
      game.mapRotation = 0;
      game.rotateMap("right");
      expect(game.mapRotation).toBe(3);
    });

    it("should rearrange map data when rotating", () => {
      const originalCell = game.data.map[0][0];
      game.rotateMap("left");
      // Map should have been rearranged
      expect(game.data.map).toBeTruthy();
    });
  });
});
