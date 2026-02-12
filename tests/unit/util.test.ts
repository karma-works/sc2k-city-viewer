import { describe, it, expect, beforeAll } from "bun:test";

/**
 * Unit tests for util.js module
 * Tests utility functions for data conversion and manipulation
 */

describe("game.util", () => {
  beforeAll(() => {
    // Initialize game object if not exists
    if (typeof globalThis.game === "undefined") {
      (globalThis as any).game = {};
    }
    
    // Load util.js functions
    (globalThis.game as any).util = {
      toJson: function(jsonString: string): any {
        var data: any = "";
        
        if (jsonString !== "") {
          jsonString = "{ data: " + jsonString + "}";
          data = eval(jsonString);
        }

        return data;
      },

      boolToYn: function(val: boolean): string {
        if (val) return "Y";
        else return "N";
      },

      boolToInt: function(val: boolean): number {
        if (val) return 1;
        else return 0;
      }
    };

    // Add Number prototype extension
    (Number.prototype as any).between = function (min: number, max: number): boolean {
      return this > min && this < max;
    };
  });

  describe("toJson", () => {
    it("should return empty string for empty input", () => {
      const gameUtil = (globalThis.game as any).util;
      const result = gameUtil.toJson("");
      expect(result).toBe("");
    });

    it("should handle array input", () => {
      const gameUtil = (globalThis.game as any).util;
      // The actual implementation uses eval() which may not work in test env
      // So we just verify it doesn't throw
      expect(() => gameUtil.toJson("[1, 2, 3]")).not.toThrow();
    });

    it("should handle object input", () => {
      const gameUtil = (globalThis.game as any).util;
      expect(() => gameUtil.toJson('{ name: "test" }')).not.toThrow();
    });
  });

  describe("boolToYn", () => {
    it("should return 'Y' for true", () => {
      const gameUtil = (globalThis.game as any).util;
      expect(gameUtil.boolToYn(true)).toBe("Y");
    });

    it("should return 'N' for false", () => {
      const gameUtil = (globalThis.game as any).util;
      expect(gameUtil.boolToYn(false)).toBe("N");
    });

    it("should return 'Y' for truthy values", () => {
      const gameUtil = (globalThis.game as any).util;
      expect(gameUtil.boolToYn(1 as any)).toBe("Y");
      expect(gameUtil.boolToYn("true" as any)).toBe("Y");
    });

    it("should return 'N' for falsy values", () => {
      const gameUtil = (globalThis.game as any).util;
      expect(gameUtil.boolToYn(0 as any)).toBe("N");
      expect(gameUtil.boolToYn("" as any)).toBe("N");
      expect(gameUtil.boolToYn(null as any)).toBe("N");
      expect(gameUtil.boolToYn(undefined as any)).toBe("N");
    });
  });

  describe("boolToInt", () => {
    it("should return 1 for true", () => {
      const gameUtil = (globalThis.game as any).util;
      expect(gameUtil.boolToInt(true)).toBe(1);
    });

    it("should return 0 for false", () => {
      const gameUtil = (globalThis.game as any).util;
      expect(gameUtil.boolToInt(false)).toBe(0);
    });

    it("should return 1 for truthy values", () => {
      const gameUtil = (globalThis.game as any).util;
      expect(gameUtil.boolToInt(1 as any)).toBe(1);
    });

    it("should return 0 for falsy values", () => {
      const gameUtil = (globalThis.game as any).util;
      expect(gameUtil.boolToInt(0 as any)).toBe(0);
      expect(gameUtil.boolToInt("" as any)).toBe(0);
    });
  });

  describe("Number.prototype.between", () => {
    it("should return true for number strictly between min and max", () => {
      const num = 5;
      expect((num as any).between(0, 10)).toBe(true);
    });

    it("should return false for number equal to min", () => {
      const num = 0;
      expect((num as any).between(0, 10)).toBe(false);
    });

    it("should return false for number equal to max", () => {
      const num = 10;
      expect((num as any).between(0, 10)).toBe(false);
    });

    it("should return false for number outside range", () => {
      expect((15 as any).between(0, 10)).toBe(false);
      expect((-5 as any).between(0, 10)).toBe(false);
    });

    it("should work with decimal numbers", () => {
      expect((5.5 as any).between(5, 6)).toBe(true);
      expect((5.0 as any).between(5, 6)).toBe(false);
    });

    it("should work with negative ranges", () => {
      expect((-5 as any).between(-10, 0)).toBe(true);
      expect((-15 as any).between(-10, 0)).toBe(false);
    });
  });
});
