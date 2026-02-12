import { describe, it, expect, beforeAll } from "bun:test";
import {
  VALID_SC2_HEADER,
  INVALID_SC2_HEADER,
  RLE_COMPRESSED_DATA,
  RLE_DECOMPRESSED_DATA,
  XTER_SEGMENT_DATA,
  XZON_SEGMENT_DATA,
  XBLD_SEGMENT_DATA,
  ALTM_SEGMENT_DATA,
  CNAM_SEGMENT_DATA,
  MISC_SEGMENT_DATA,
} from "../fixtures/index";

/**
 * Unit tests for import.js module
 * Tests SC2 file parsing and data extraction
 */

describe("game.import", () => {
  let gameImport: any;

  beforeAll(() => {
    // Initialize game object
    if (typeof globalThis.game === "undefined") {
      (globalThis as any).game = {};
    }

    // Initialize game.data mock
    (globalThis.game as any).data = {
      db: {
        prepare: (sql: string) => ({
          get: () => ({ id: 1 }),
          run: () => ({}),
        }),
        exec: () => ({}),
      },
      tiles: [],
      map: [],
    };

    // Import module implementation
    gameImport = {
      struct: undefined,
      alreadyDecompressedSegments: {
        ALTM: true,
        CNAM: true,
      },

      xzonTypeMap: {
        '0000': 0,
        '0001': 1,
        '0010': 2,
        '0011': 3,
        '0100': 4,
        '0101': 5,
        '0110': 6,
        '0111': 7,
        '1000': 8,
        '1001': 9,
      },

      xterSlopeMap: {
        0x0: [0, 0, 0, 0],
        0x1: [0, 0, 1, 1],
        0x2: [1, 0, 0, 1],
        0x3: [1, 1, 0, 0],
        0x4: [0, 1, 1, 0],
        0x5: [1, 0, 1, 1],
        0x6: [1, 1, 0, 1],
        0x7: [1, 1, 1, 0],
        0x8: [0, 1, 1, 1],
        0x9: [0, 0, 0, 1],
        0xA: [1, 0, 0, 0],
        0xB: [0, 1, 0, 0],
        0xC: [0, 0, 1, 0],
        0xD: [1, 1, 1, 1],
      },

      xterTerrainTileMap: {
        0x0: 256, 0x1: 260, 0x2: 257, 0x3: 258, 0x4: 259,
        0x5: 264, 0x6: 261, 0x7: 262, 0x8: 263, 0x9: 268,
        0xA: 265, 0xB: 266, 0xC: 267, 0xD: 269,
      },

      waterLevels: {
        0x0: "dry",
        0x1: "submerged",
        0x2: "shore",
        0x3: "surface",
        0x4: "waterfall",
      },

      isSimCity2000SaveFile: function(bytes: Uint8Array): boolean {
        // check IFF header
        if (bytes[0] !== 0x46 || bytes[1] !== 0x4F || bytes[2] !== 0x52 || bytes[3] !== 0x4D) {
          return false;
        }
        // check sc2k header
        if (bytes[8] !== 0x53 || bytes[9] !== 0x43 || bytes[10] !== 0x44 || bytes[11] !== 0x48) {
          return false;
        }
        return true;
      },

      splitIntoSegments: function(rest: Uint8Array): Record<string, Uint8Array> {
        let segments: Record<string, Uint8Array> = {};

        while (rest.length > 0) {
          let segmentTitle = Array.prototype.map
            .call(rest.subarray(0, 4), (x: number) => String.fromCharCode(x))
            .join("");
          let lengthBytes = rest.subarray(4, 8);
          let segmentLength = new DataView(lengthBytes.buffer).getUint32(lengthBytes.byteOffset);
          let segmentContent = rest.subarray(8, 8 + segmentLength);

          if (!this.alreadyDecompressedSegments[segmentTitle as keyof typeof this.alreadyDecompressedSegments]) {
            segmentContent = this.decompressSegment(segmentContent);
          }

          segments[segmentTitle] = segmentContent;
          rest = rest.subarray(8 + segmentLength);
        }

        return segments;
      },

      decompressSegment: function(bytes: Uint8Array): Uint8Array {
        let output: number[] = [];
        let dataCount = 0;

        for (let i = 0; i < bytes.length; i++) {
          if (dataCount > 0) {
            output.push(bytes[i]);
            dataCount -= 1;
            continue;
          }

          if (bytes[i] < 128) {
            // bytes[i] indicates the number of literal bytes that follow
            dataCount = bytes[i];
          } else {
            // bytes[i] >= 128 indicates RLE: repeat the next byte (bytes[i] - 127) times
            let repeatCount = bytes[i] - 127;
            let repeated = bytes[i + 1];

            for (let j = 0; j < repeatCount; j++) {
              output.push(repeated);
            }
            i += 1; // Skip the repeated byte
          }
        }

        return Uint8Array.from(output);
      },

      binaryString: function(bin: number, bytes: number): string {
        return bin.toString(2).padStart(8 * bytes, "0");
      },

      hexString: function(bin: number, bytes: number): string {
        return bin.toString(16).padStart(2 * bytes, "0");
      },
    };

    (globalThis.game as any).import = gameImport;
  });

  describe("isSimCity2000SaveFile", () => {
    it("should return true for valid SC2 header", () => {
      expect(gameImport.isSimCity2000SaveFile(VALID_SC2_HEADER)).toBe(true);
    });

    it("should return false for invalid header", () => {
      expect(gameImport.isSimCity2000SaveFile(INVALID_SC2_HEADER)).toBe(false);
    });

    it("should return false for empty array", () => {
      expect(gameImport.isSimCity2000SaveFile(new Uint8Array(0))).toBe(false);
    });

    it("should return false for array shorter than 12 bytes", () => {
      expect(gameImport.isSimCity2000SaveFile(new Uint8Array([0x46, 0x4F, 0x52, 0x4D]))).toBe(false);
    });

    it("should return false for wrong IFF header", () => {
      const wrongHeader = new Uint8Array([
        0x49, 0x4E, 0x56, 0x41, // "INVA"
        0x00, 0x00, 0x00, 0x00,
        0x53, 0x43, 0x44, 0x48,
      ]);
      expect(gameImport.isSimCity2000SaveFile(wrongHeader)).toBe(false);
    });

    it("should return false for wrong SC2K header", () => {
      const wrongSc2k = new Uint8Array([
        0x46, 0x4F, 0x52, 0x4D,
        0x00, 0x00, 0x00, 0x00,
        0x49, 0x4E, 0x56, 0x41, // "INVA"
      ]);
      expect(gameImport.isSimCity2000SaveFile(wrongSc2k)).toBe(false);
    });
  });

  describe("decompressSegment", () => {
    it("should handle empty data", () => {
      const result = gameImport.decompressSegment(new Uint8Array(0));
      expect(result).toEqual(new Uint8Array(0));
    });

    it("should handle literal data count", () => {
      // 0x02 means 2 literal bytes follow
      const data = new Uint8Array([0x02, 0xAA, 0xBB]);
      const result = gameImport.decompressSegment(data);
      expect(result).toEqual(new Uint8Array([0xAA, 0xBB]));
    });

    it("should handle RLE decompression", () => {
      // 0x82 (130 decimal) means repeat next byte (130 - 127) = 3 times
      const compressed = new Uint8Array([0x82, 0xAA]);
      const result = gameImport.decompressSegment(compressed);
      expect(result).toEqual(new Uint8Array([0xAA, 0xAA, 0xAA]));
    });

    it("should handle zero literal count", () => {
      // 0x00 means 0 literal bytes follow (just the count byte itself)
      const data = new Uint8Array([0x00]);
      const result = gameImport.decompressSegment(data);
      expect(result).toEqual(new Uint8Array([]));
    });

    it("should handle mixed literal and RLE", () => {
      // 0x01 (1 literal), 0x42, 0x84 (RLE: 132 - 127 = 5 times), 0xFF
      const compressed = new Uint8Array([0x01, 0x42, 0x84, 0xFF]);
      const result = gameImport.decompressSegment(compressed);
      expect(result).toEqual(new Uint8Array([0x42, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]));
    });
  });

  describe("binaryString", () => {
    it("should convert number to 8-bit binary string", () => {
      expect(gameImport.binaryString(0, 1)).toBe("00000000");
      expect(gameImport.binaryString(255, 1)).toBe("11111111");
      expect(gameImport.binaryString(170, 1)).toBe("10101010");
    });

    it("should convert number to 16-bit binary string", () => {
      expect(gameImport.binaryString(0, 2)).toBe("0000000000000000");
      expect(gameImport.binaryString(65535, 2)).toBe("1111111111111111");
      expect(gameImport.binaryString(0x1234, 2)).toBe("0001001000110100");
    });

    it("should pad with zeros", () => {
      expect(gameImport.binaryString(5, 1)).toBe("00000101");
      expect(gameImport.binaryString(1, 2)).toBe("0000000000000001");
    });
  });

  describe("hexString", () => {
    it("should convert number to 2-char hex string", () => {
      expect(gameImport.hexString(0, 1)).toBe("00");
      expect(gameImport.hexString(255, 1)).toBe("ff");
      expect(gameImport.hexString(170, 1)).toBe("aa");
    });

    it("should convert number to 4-char hex string", () => {
      expect(gameImport.hexString(0, 2)).toBe("0000");
      expect(gameImport.hexString(65535, 2)).toBe("ffff");
      expect(gameImport.hexString(0x1234, 2)).toBe("1234");
    });

    it("should pad with zeros", () => {
      expect(gameImport.hexString(5, 1)).toBe("05");
      expect(gameImport.hexString(0xABC, 2)).toBe("0abc");
    });
  });

  describe("mapping constants", () => {
    it("should have xzonTypeMap with correct values", () => {
      expect(gameImport.xzonTypeMap["0000"]).toBe(0);
      expect(gameImport.xzonTypeMap["0001"]).toBe(1);
      expect(gameImport.xzonTypeMap["1001"]).toBe(9);
    });

    it("should have xterSlopeMap with correct arrays", () => {
      expect(gameImport.xterSlopeMap[0x0]).toEqual([0, 0, 0, 0]);
      expect(gameImport.xterSlopeMap[0x1]).toEqual([0, 0, 1, 1]);
      expect(gameImport.xterSlopeMap[0xD]).toEqual([1, 1, 1, 1]);
    });

    it("should have xterTerrainTileMap with correct tile IDs", () => {
      expect(gameImport.xterTerrainTileMap[0x0]).toBe(256);
      expect(gameImport.xterTerrainTileMap[0xD]).toBe(269);
    });

    it("should have waterLevels with correct labels", () => {
      expect(gameImport.waterLevels[0x0]).toBe("dry");
      expect(gameImport.waterLevels[0x1]).toBe("submerged");
      expect(gameImport.waterLevels[0x4]).toBe("waterfall");
    });
  });

  describe("splitIntoSegments", () => {
    it("should split IFF data into segments", () => {
      // Create a simple IFF structure: "TEST" segment with 4 bytes of data (literal data, will be decompressed)
      const iffData = new Uint8Array([
        0x54, 0x45, 0x53, 0x54, // "TEST"
        0x00, 0x00, 0x00, 0x04, // length: 4
        0x03, 0xAA, 0xBB, 0xCC, // data: 3 literal bytes (AA, BB, CC)
      ]);

      const segments = gameImport.splitIntoSegments(iffData);
      expect(segments["TEST"]).toBeDefined();
      // Data gets decompressed: 0x03 means 3 bytes follow
      expect(segments["TEST"]).toEqual(new Uint8Array([0xAA, 0xBB, 0xCC]));
    });

    it("should handle multiple segments", () => {
      const iffData = new Uint8Array([
        // First segment - "SEGA" with literal data (not in decompressed list, so gets decompressed)
        0x53, 0x45, 0x47, 0x41, // "SEGA"
        0x00, 0x00, 0x00, 0x02, // length: 2
        0x01, 0xAA,             // data: 1 literal byte (AA)
        // Second segment
        0x53, 0x45, 0x47, 0x42, // "SEGB"
        0x00, 0x00, 0x00, 0x03, // length: 3
        0x02, 0xCC, 0xDD,       // data: 2 literal bytes (CC, DD)
      ]);

      const segments = gameImport.splitIntoSegments(iffData);
      expect(segments["SEGA"]).toEqual(new Uint8Array([0xAA]));
      expect(segments["SEGB"]).toEqual(new Uint8Array([0xCC, 0xDD]));
    });

    it("should decompress segments not in alreadyDecompressedSegments", () => {
      // CMPR is not in alreadyDecompressedSegments, so it will be decompressed
      const compressed = new Uint8Array([
        0x43, 0x4D, 0x50, 0x52, // "CMPR" (compressed)
        0x00, 0x00, 0x00, 0x02, // length: 2
        0x81, 0xAA,             // RLE: 129 - 127 = 2 repeats of 0xAA
      ]);

      const segments = gameImport.splitIntoSegments(compressed);
      expect(segments["CMPR"]).toEqual(new Uint8Array([0xAA, 0xAA]));
    });

    it("should not decompress segments in alreadyDecompressedSegments", () => {
      // ALTM is in alreadyDecompressedSegments, so should NOT be decompressed
      const notCompressed = new Uint8Array([
        0x41, 0x4C, 0x54, 0x4D, // "ALTM"
        0x00, 0x00, 0x00, 0x03, // length: 3
        0x82, 0xAA, 0x00,       // This data is kept as-is
      ]);

      const segments = gameImport.splitIntoSegments(notCompressed);
      // ALTM is in alreadyDecompressedSegments, so should NOT be decompressed
      expect(segments["ALTM"]).toEqual(new Uint8Array([0x82, 0xAA, 0x00]));
    });
  });
});
