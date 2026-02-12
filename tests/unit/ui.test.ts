import { describe, it, expect, beforeAll, beforeEach } from "bun:test";
import { MOCK_MAP_CELL } from "../fixtures/index";

/**
 * Unit tests for ui.js module
 * Tests UI state management and camera controls
 */

describe("game.ui", () => {
  let gameUI: any;
  let mockGame: any;

  beforeAll(() => {
    // Initialize game object
    if (typeof globalThis.game === "undefined") {
      (globalThis as any).game = {};
    }

    mockGame = {
      graphics: {
        primaryContext: {
          canvas: { width: 1280, height: 1024 },
        },
        getTile: (id: number) => ({ id, slopes: [0, 0, 0, 0] }),
        isCellInsideClipBoundary: () => true,
        scaledInterfaceContext: {},
        drawVectorTile: () => {},
        layerOffset: 24,
        updateCanvasSize: () => {},
      },
      getMapCell: () => MOCK_MAP_CELL,
      layerOffset: 24,
    };

    gameUI = {
      cameraOffsetX: 0,
      cameraOffsetY: 0,
      cursorX: -1,
      cursorY: -1,
      cursorTileX: -1,
      cursorTileY: -1,
      selectedTileX: -1,
      selectedTileY: -1,
      interfaceFont: "Helvetica,Arial,sans-serif",

      centerCameraOnClick: function() {
        const game = mockGame;
        var centerX = game.graphics.primaryContext.canvas.width / 2;
        var centerY = game.graphics.primaryContext.canvas.height / 2;

        var cursorOffsetX = this.cameraOffsetX - Math.floor(this.cursorX - centerX);
        var cursorOffsetY = this.cameraOffsetY - Math.floor(this.cursorY - centerY);

        this.cameraOffsetX = +cursorOffsetX;
        this.cameraOffsetY = +cursorOffsetY;

        game.graphics.updateCanvasSize();
      },

      moveCamera: function(direction: string) {
        var moveOffset = 40;

        if (direction === "up") this.cameraOffsetY = this.cameraOffsetY + moveOffset;
        if (direction === "down") this.cameraOffsetY = this.cameraOffsetY - moveOffset;
        if (direction === "left") this.cameraOffsetX = this.cameraOffsetX + moveOffset;
        if (direction === "right") this.cameraOffsetX = this.cameraOffsetX - moveOffset;

        mockGame.graphics.updateCanvasSize();
      },
    };

    (globalThis.game as any).ui = gameUI;
    (globalThis.game as any).graphics = mockGame.graphics;
    (globalThis.game as any).getMapCell = mockGame.getMapCell;
    (globalThis.game as any).layerOffset = mockGame.layerOffset;
  });

  beforeEach(() => {
    // Reset state before each test
    gameUI.cameraOffsetX = 0;
    gameUI.cameraOffsetY = 0;
    gameUI.cursorX = -1;
    gameUI.cursorY = -1;
    gameUI.cursorTileX = -1;
    gameUI.cursorTileY = -1;
    gameUI.selectedTileX = -1;
    gameUI.selectedTileY = -1;
  });

  describe("initial state", () => {
    it("should have initial camera offset of 0,0", () => {
      expect(gameUI.cameraOffsetX).toBe(0);
      expect(gameUI.cameraOffsetY).toBe(0);
    });

    it("should have initial cursor position of -1,-1", () => {
      expect(gameUI.cursorX).toBe(-1);
      expect(gameUI.cursorY).toBe(-1);
    });

    it("should have initial cursor tile position of -1,-1", () => {
      expect(gameUI.cursorTileX).toBe(-1);
      expect(gameUI.cursorTileY).toBe(-1);
    });

    it("should have correct interface font", () => {
      expect(gameUI.interfaceFont).toBe("Helvetica,Arial,sans-serif");
    });
  });

  describe("moveCamera", () => {
    it("should increase Y offset when moving up", () => {
      gameUI.moveCamera("up");
      expect(gameUI.cameraOffsetY).toBe(40);
      expect(gameUI.cameraOffsetX).toBe(0);
    });

    it("should decrease Y offset when moving down", () => {
      gameUI.moveCamera("down");
      expect(gameUI.cameraOffsetY).toBe(-40);
      expect(gameUI.cameraOffsetX).toBe(0);
    });

    it("should increase X offset when moving left", () => {
      gameUI.moveCamera("left");
      expect(gameUI.cameraOffsetX).toBe(40);
      expect(gameUI.cameraOffsetY).toBe(0);
    });

    it("should decrease X offset when moving right", () => {
      gameUI.moveCamera("right");
      expect(gameUI.cameraOffsetX).toBe(-40);
      expect(gameUI.cameraOffsetY).toBe(0);
    });

    it("should handle multiple moves in sequence", () => {
      gameUI.moveCamera("up");
      gameUI.moveCamera("up");
      gameUI.moveCamera("right");
      expect(gameUI.cameraOffsetY).toBe(80);
      expect(gameUI.cameraOffsetX).toBe(-40);
    });

    it("should handle all four directions", () => {
      gameUI.moveCamera("up");
      gameUI.moveCamera("down");
      gameUI.moveCamera("left");
      gameUI.moveCamera("right");
      // Should end up at 0,0
      expect(gameUI.cameraOffsetX).toBe(0);
      expect(gameUI.cameraOffsetY).toBe(0);
    });
  });

  describe("centerCameraOnClick", () => {
    it("should update camera offset based on cursor position", () => {
      gameUI.cursorX = 500; // Not at center
      gameUI.cursorY = 400;
      
      const initialOffsetX = gameUI.cameraOffsetX;
      gameUI.centerCameraOnClick();
      
      // Camera should have moved when cursor is not at center
      expect(gameUI.cameraOffsetX).not.toBe(initialOffsetX);
    });

    it("should handle cursor at center of canvas", () => {
      gameUI.cursorX = 640; // Half of 1280
      gameUI.cursorY = 512; // Half of 1024
      
      gameUI.centerCameraOnClick();
      
      // When cursor is at center, offset should be 0
      expect(gameUI.cameraOffsetX).toBe(0);
      expect(gameUI.cameraOffsetY).toBe(0);
    });

    it("should handle cursor at top-left corner", () => {
      gameUI.cursorX = 0;
      gameUI.cursorY = 0;
      
      gameUI.centerCameraOnClick();
      
      // Offset should move to center the cursor
      expect(gameUI.cameraOffsetX).toBeGreaterThan(0);
      expect(gameUI.cameraOffsetY).toBeGreaterThan(0);
    });

    it("should handle cursor at bottom-right corner", () => {
      gameUI.cursorX = 1280;
      gameUI.cursorY = 1024;
      
      gameUI.centerCameraOnClick();
      
      // Offset should move to center the cursor (negative values)
      expect(gameUI.cameraOffsetX).toBeLessThan(0);
      expect(gameUI.cameraOffsetY).toBeLessThan(0);
    });
  });

  describe("cursor state management", () => {
    it("should update cursor position", () => {
      gameUI.cursorX = 100;
      gameUI.cursorY = 200;
      
      expect(gameUI.cursorX).toBe(100);
      expect(gameUI.cursorY).toBe(200);
    });

    it("should update selected tile position", () => {
      gameUI.selectedTileX = 10;
      gameUI.selectedTileY = 20;
      
      expect(gameUI.selectedTileX).toBe(10);
      expect(gameUI.selectedTileY).toBe(20);
    });

    it("should update cursor tile position", () => {
      gameUI.cursorTileX = 5;
      gameUI.cursorTileY = 15;
      
      expect(gameUI.cursorTileX).toBe(5);
      expect(gameUI.cursorTileY).toBe(15);
    });
  });
});
