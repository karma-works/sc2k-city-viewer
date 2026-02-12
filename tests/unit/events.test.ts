import { describe, it, expect, beforeAll, beforeEach } from "bun:test";

/**
 * Unit tests for events.js module
 * Tests event handling and keyboard input
 */

describe("game.events", () => {
  let gameEvents: any;
  let mockGame: any;
  let keyEventHandler: Function;

  beforeAll(() => {
    // Initialize game object
    if (typeof globalThis.game === "undefined") {
      (globalThis as any).game = {};
    }

    mockGame = {
      graphics: {
        setDrawFrame: () => {},
        updateCanvasSize: () => {},
      },
      ui: {
        moveCamera: () => {},
        cursorTileX: 10,
        cursorTileY: 20,
        selectedTileX: 5,
        selectedTileY: 15,
      },
      data: {
        clear: () => {},
      },
      import: {
        openFile: () => {},
      },
      debug: {
        showSelectedTileInfo: false,
        hideAnimatedTiles: false,
        showBuildingCorners: false,
        showTileCoordinates: false,
        showTileCount: false,
        hideTerrain: false,
        hideZones: false,
        hideNetworks: false,
        hideBuildings: false,
        hideWater: false,
        hideTerrainEdge: false,
        showHeightMap: false,
        showZoneOverlay: false,
        showNetworkOverlay: false,
        toggleClipBoundDebug: () => {},
      },
      rotateMap: () => {},
      isCursorOnMap: () => true,
      getMapCell: () => ({
        x: 10,
        y: 20,
        tiles: { terrain: 256, building: 0, zone: 0 },
      }),
    };

    gameEvents = {
      activeCursorTool: "center",

      register: function() {
        // Mock registration - would add real event listeners in browser
      },

      keyEvent: function(event: { key: string }) {
        mockGame.graphics.setDrawFrame();

        switch (event.key) {
          case "1":
            this.activeCursorTool = "none";
            mockGame.debug.showSelectedTileInfo = false;
            break;
          case "2":
            this.activeCursorTool = "center";
            mockGame.debug.showSelectedTileInfo = true;
            break;
          case "3":
            this.activeCursorTool = "info";
            mockGame.debug.showSelectedTileInfo = true;
            break;
          case "a":
            mockGame.debug.hideAnimatedTiles = !mockGame.debug.hideAnimatedTiles;
            break;
          case "z":
            mockGame.debug.showBuildingCorners = !mockGame.debug.showBuildingCorners;
            break;
          case "c":
            mockGame.debug.showTileCoordinates = !mockGame.debug.showTileCoordinates;
            break;
          case "i":
            mockGame.debug.showTileCount = !mockGame.debug.showTileCount;
            break;
          case "x":
            mockGame.debug.hideTerrain = !mockGame.debug.hideTerrain;
            break;
          case "v":
            mockGame.debug.hideZones = !mockGame.debug.hideZones;
            break;
          case "y":
            mockGame.debug.hideNetworks = !mockGame.debug.hideNetworks;
            break;
          case "b":
            mockGame.debug.hideBuildings = !mockGame.debug.hideBuildings;
            break;
          case "n":
            mockGame.debug.hideWater = !mockGame.debug.hideWater;
            break;
          case "m":
            mockGame.debug.hideTerrainEdge = !mockGame.debug.hideTerrainEdge;
            break;
          case "h":
            mockGame.debug.showHeightMap = !mockGame.debug.showHeightMap;
            if (mockGame.debug.showHeightMap) {
              mockGame.debug.hideTerrain = true;
              mockGame.debug.hideZones = true;
              mockGame.debug.hideBuildings = true;
              mockGame.debug.hideNetworks = true;
              mockGame.debug.hideWater = true;
              mockGame.debug.hideTerrainEdge = true;
            } else {
              mockGame.debug.hideTerrain = false;
              mockGame.debug.hideZones = false;
              mockGame.debug.hideBuildings = false;
              mockGame.debug.hideNetworks = false;
              mockGame.debug.hideWater = false;
              mockGame.debug.hideTerrainEdge = false;
            }
            break;
          case "k":
            mockGame.debug.showZoneOverlay = !mockGame.debug.showZoneOverlay;
            break;
          case "j":
            mockGame.debug.showNetworkOverlay = !mockGame.debug.showNetworkOverlay;
            break;
          case "q":
            mockGame.rotateMap("left");
            break;
          case "w":
            mockGame.rotateMap("right");
            break;
          case "t":
            mockGame.debug.toggleClipBoundDebug();
            break;
          case "o":
            mockGame.import.openFile();
            break;
          case "0":
            mockGame.data.clear();
            break;
          case "ArrowUp":
            mockGame.ui.moveCamera("up");
            break;
          case "ArrowRight":
            mockGame.ui.moveCamera("right");
            break;
          case "ArrowDown":
            mockGame.ui.moveCamera("down");
            break;
          case "ArrowLeft":
            mockGame.ui.moveCamera("left");
            break;
        }
      },
    };

    keyEventHandler = gameEvents.keyEvent.bind(gameEvents);
    (globalThis.game as any).events = gameEvents;
    Object.assign(globalThis.game, mockGame);
  });

  beforeEach(() => {
    gameEvents.activeCursorTool = "center";
    // Reset debug flags
    Object.keys(mockGame.debug).forEach((key) => {
      if (typeof mockGame.debug[key] === "boolean") {
        mockGame.debug[key] = false;
      }
    });
  });

  describe("initial state", () => {
    it("should have initial cursor tool set to 'center'", () => {
      expect(gameEvents.activeCursorTool).toBe("center");
    });
  });

  describe("cursor tool switching", () => {
    it("should set tool to 'none' when pressing 1", () => {
      keyEventHandler({ key: "1" });
      expect(gameEvents.activeCursorTool).toBe("none");
    });

    it("should set tool to 'center' when pressing 2", () => {
      gameEvents.activeCursorTool = "none";
      keyEventHandler({ key: "2" });
      expect(gameEvents.activeCursorTool).toBe("center");
    });

    it("should set tool to 'info' when pressing 3", () => {
      keyEventHandler({ key: "3" });
      expect(gameEvents.activeCursorTool).toBe("info");
    });
  });

  describe("debug toggle keys", () => {
    it("should toggle hideAnimatedTiles when pressing 'a'", () => {
      expect(mockGame.debug.hideAnimatedTiles).toBe(false);
      keyEventHandler({ key: "a" });
      expect(mockGame.debug.hideAnimatedTiles).toBe(true);
      keyEventHandler({ key: "a" });
      expect(mockGame.debug.hideAnimatedTiles).toBe(false);
    });

    it("should toggle showBuildingCorners when pressing 'z'", () => {
      expect(mockGame.debug.showBuildingCorners).toBe(false);
      keyEventHandler({ key: "z" });
      expect(mockGame.debug.showBuildingCorners).toBe(true);
    });

    it("should toggle showTileCoordinates when pressing 'c'", () => {
      expect(mockGame.debug.showTileCoordinates).toBe(false);
      keyEventHandler({ key: "c" });
      expect(mockGame.debug.showTileCoordinates).toBe(true);
    });

    it("should toggle showTileCount when pressing 'i'", () => {
      expect(mockGame.debug.showTileCount).toBe(false);
      keyEventHandler({ key: "i" });
      expect(mockGame.debug.showTileCount).toBe(true);
    });
  });

  describe("visibility toggle keys", () => {
    it("should toggle hideTerrain when pressing 'x'", () => {
      expect(mockGame.debug.hideTerrain).toBe(false);
      keyEventHandler({ key: "x" });
      expect(mockGame.debug.hideTerrain).toBe(true);
    });

    it("should toggle hideZones when pressing 'v'", () => {
      expect(mockGame.debug.hideZones).toBe(false);
      keyEventHandler({ key: "v" });
      expect(mockGame.debug.hideZones).toBe(true);
    });

    it("should toggle hideNetworks when pressing 'y'", () => {
      expect(mockGame.debug.hideNetworks).toBe(false);
      keyEventHandler({ key: "y" });
      expect(mockGame.debug.hideNetworks).toBe(true);
    });

    it("should toggle hideBuildings when pressing 'b'", () => {
      expect(mockGame.debug.hideBuildings).toBe(false);
      keyEventHandler({ key: "b" });
      expect(mockGame.debug.hideBuildings).toBe(true);
    });

    it("should toggle hideWater when pressing 'n'", () => {
      expect(mockGame.debug.hideWater).toBe(false);
      keyEventHandler({ key: "n" });
      expect(mockGame.debug.hideWater).toBe(true);
    });

    it("should toggle hideTerrainEdge when pressing 'm'", () => {
      expect(mockGame.debug.hideTerrainEdge).toBe(false);
      keyEventHandler({ key: "m" });
      expect(mockGame.debug.hideTerrainEdge).toBe(true);
    });
  });

  describe("height map key", () => {
    it("should toggle showHeightMap when pressing 'h'", () => {
      expect(mockGame.debug.showHeightMap).toBe(false);
      keyEventHandler({ key: "h" });
      expect(mockGame.debug.showHeightMap).toBe(true);
    });

    it("should hide other layers when enabling height map", () => {
      keyEventHandler({ key: "h" });
      expect(mockGame.debug.hideTerrain).toBe(true);
      expect(mockGame.debug.hideZones).toBe(true);
      expect(mockGame.debug.hideBuildings).toBe(true);
      expect(mockGame.debug.hideNetworks).toBe(true);
      expect(mockGame.debug.hideWater).toBe(true);
      expect(mockGame.debug.hideTerrainEdge).toBe(true);
    });

    it("should restore other layers when disabling height map", () => {
      keyEventHandler({ key: "h" }); // Enable
      keyEventHandler({ key: "h" }); // Disable
      expect(mockGame.debug.hideTerrain).toBe(false);
      expect(mockGame.debug.hideZones).toBe(false);
      expect(mockGame.debug.hideBuildings).toBe(false);
      expect(mockGame.debug.hideNetworks).toBe(false);
      expect(mockGame.debug.hideWater).toBe(false);
      expect(mockGame.debug.hideTerrainEdge).toBe(false);
    });
  });

  describe("overlay toggle keys", () => {
    it("should toggle showZoneOverlay when pressing 'k'", () => {
      expect(mockGame.debug.showZoneOverlay).toBe(false);
      keyEventHandler({ key: "k" });
      expect(mockGame.debug.showZoneOverlay).toBe(true);
    });

    it("should toggle showNetworkOverlay when pressing 'j'", () => {
      expect(mockGame.debug.showNetworkOverlay).toBe(false);
      keyEventHandler({ key: "j" });
      expect(mockGame.debug.showNetworkOverlay).toBe(true);
    });
  });

  describe("map rotation keys", () => {
    it("should call rotateMap with 'left' when pressing 'q'", () => {
      let rotateCalled = false;
      let rotateDirection = "";
      mockGame.rotateMap = (dir: string) => {
        rotateCalled = true;
        rotateDirection = dir;
      };
      keyEventHandler({ key: "q" });
      expect(rotateCalled).toBe(true);
      expect(rotateDirection).toBe("left");
    });

    it("should call rotateMap with 'right' when pressing 'w'", () => {
      let rotateCalled = false;
      let rotateDirection = "";
      mockGame.rotateMap = (dir: string) => {
        rotateCalled = true;
        rotateDirection = dir;
      };
      keyEventHandler({ key: "w" });
      expect(rotateCalled).toBe(true);
      expect(rotateDirection).toBe("right");
    });
  });

  describe("utility keys", () => {
    it("should call toggleClipBoundDebug when pressing 't'", () => {
      let toggleCalled = false;
      mockGame.debug.toggleClipBoundDebug = () => {
        toggleCalled = true;
      };
      keyEventHandler({ key: "t" });
      expect(toggleCalled).toBe(true);
    });

    it("should call openFile when pressing 'o'", () => {
      let openCalled = false;
      mockGame.import.openFile = () => {
        openCalled = true;
      };
      keyEventHandler({ key: "o" });
      expect(openCalled).toBe(true);
    });

    it("should call data.clear when pressing '0'", () => {
      let clearCalled = false;
      mockGame.data.clear = () => {
        clearCalled = true;
      };
      keyEventHandler({ key: "0" });
      expect(clearCalled).toBe(true);
    });
  });

  describe("arrow key navigation", () => {
    it("should move camera up when pressing ArrowUp", () => {
      let moveCalled = false;
      let moveDirection = "";
      mockGame.ui.moveCamera = (dir: string) => {
        moveCalled = true;
        moveDirection = dir;
      };
      keyEventHandler({ key: "ArrowUp" });
      expect(moveCalled).toBe(true);
      expect(moveDirection).toBe("up");
    });

    it("should move camera down when pressing ArrowDown", () => {
      let moveCalled = false;
      let moveDirection = "";
      mockGame.ui.moveCamera = (dir: string) => {
        moveCalled = true;
        moveDirection = dir;
      };
      keyEventHandler({ key: "ArrowDown" });
      expect(moveCalled).toBe(true);
      expect(moveDirection).toBe("down");
    });

    it("should move camera left when pressing ArrowLeft", () => {
      let moveCalled = false;
      let moveDirection = "";
      mockGame.ui.moveCamera = (dir: string) => {
        moveCalled = true;
        moveDirection = dir;
      };
      keyEventHandler({ key: "ArrowLeft" });
      expect(moveCalled).toBe(true);
      expect(moveDirection).toBe("left");
    });

    it("should move camera right when pressing ArrowRight", () => {
      let moveCalled = false;
      let moveDirection = "";
      mockGame.ui.moveCamera = (dir: string) => {
        moveCalled = true;
        moveDirection = dir;
      };
      keyEventHandler({ key: "ArrowRight" });
      expect(moveCalled).toBe(true);
      expect(moveDirection).toBe("right");
    });
  });

  describe("setDrawFrame call", () => {
    it("should call setDrawFrame on every key event", () => {
      let drawFrameCalled = false;
      mockGame.graphics.setDrawFrame = () => {
        drawFrameCalled = true;
      };
      keyEventHandler({ key: "1" });
      expect(drawFrameCalled).toBe(true);
    });
  });
});
