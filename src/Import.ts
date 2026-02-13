import type { Data } from './Data.js';

interface ParsedTile {
  x: number;
  y: number;
  ALTM?: {
    tunnelLevels: number;
    waterFlag: boolean;
    globalWaterLevel: number;
    altitude: number;
  };
  XBIT?: {
    conductive: boolean;
    powered: boolean;
    piped: boolean;
    watered: boolean;
    landValue: boolean;
    waterCovered: boolean;
    rotate: boolean;
    saltWater: boolean;
  };
  XBLD?: {
    id: number;
    idHex: string;
  };
  XTER?: {
    slope: number[] | null;
    surfaceWater: number | null;
    waterLevel: string | null;
    waterLevelHex: number;
    id: number;
    raw: string;
  };
  XUND?: {
    subway: boolean;
    pipes: boolean;
    slope: number[] | null;
    subwayLeftRight: boolean | null;
    missileSilo: boolean;
    subwayStation: boolean;
    raw?: string;
  };
  XZON?: {
    corners: string;
    zoneType: string;
    type: number;
  };
  XTXT?: {
    sign: boolean;
    microsimLabel: boolean;
    xlabId?: string;
    xthgData?: string;
    raw: string;
  };
}

interface Struct {
  tiles: ParsedTile[];
  cityName?: string;
  XLAB?: string[];
  MISC?: {
    rotation: number;
    yearFounded: number;
    daysElapsed: number;
    money: number;
    population: number;
    zoomLevel: number;
    cityCenterX: number;
    cityCenterY: number;
    waterLevel: number;
  };
}

interface ImportedCityData {
  name: string;
  rotation: number;
  waterLevel: number;
  tiles: Array<{
    x: number;
    y: number;
    z: number;
    terrain_tile_id: number;
    zone_tile_id: number;
    building_tile_id: number;
    building_corners: string;
    zone_type: number;
    water_level: string;
    surface_water: number | null;
    conductive: string;
    powered: string;
    piped: string;
    watered: string;
    land_value: string;
    water_covered: string;
    rotate: string;
    salt_water: string;
    subway: boolean;
    subway_station: boolean;
    subway_direction: boolean | null;
    pipes: boolean;
  }>;
}

export class SC2Importer {
  private struct: Struct | null = null;

  private alreadyDecompressedSegments: Record<string, boolean> = {
    'ALTM': true,
    'CNAM': true
  };

  private xzonTypeMap: Record<string, number> = {
    '0000': 0,
    '0001': 1,
    '0010': 2,
    '0011': 3,
    '0100': 4,
    '0101': 5,
    '0110': 6,
    '0111': 7,
    '1000': 8,
    '1001': 9
  };

  private xterSlopeMap: Record<number, number[]> = {
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
    0xD: [1, 1, 1, 1]
  };

  private xterTerrainTileMap: Record<number, number> = {
    0x0: 256,
    0x1: 260,
    0x2: 257,
    0x3: 258,
    0x4: 259,
    0x5: 264,
    0x6: 261,
    0x7: 262,
    0x8: 263,
    0x9: 268,
    0xA: 265,
    0xB: 266,
    0xC: 267,
    0xD: 269
  };

  private waterLevels: Record<number, string> = {
    0x0: 'dry',
    0x1: 'submerged',
    0x2: 'shore',
    0x3: 'surface',
    0x4: 'waterfall'
  };

  public isSimCity2000SaveFile(bytes: Uint8Array): boolean {
    if (bytes[0] !== 0x46 || bytes[1] !== 0x4F || bytes[2] !== 0x52 || bytes[3] !== 0x4D) {
      return false;
    }

    if (bytes[8] !== 0x53 || bytes[9] !== 0x43 || bytes[10] !== 0x44 || bytes[11] !== 0x48) {
      return false;
    }

    return true;
  }

  public parse(bytes: Uint8Array): ImportedCityData | null {
    const buffer = new Uint8Array(bytes);
    const rest = buffer.subarray(12);
    const segments = this.splitIntoSegments(rest);

    this.toVerboseFormat(segments);

    if (!this.struct) {
      return null;
    }

    console.log('Parsed SC2 file:', this.struct);

    return this.loadCity();
  }

  private loadCity(): ImportedCityData | null {
    if (!this.struct) return null;

    console.log('Loading City...');

    const rotation = this.struct.MISC?.rotation ?? 0;
    const waterLevel = this.struct.MISC?.waterLevel ?? 4;
    const name = this.struct.cityName ?? 'Imported City';

    const tiles: ImportedCityData['tiles'] = [];

    for (let i = 0; i < this.struct.tiles.length; i++) {
      const tile = this.struct.tiles[i];
      const terrainTileId = this.xterTerrainTileMap[
        tile.XTER && tile.XTER.id > 13 ? tile.XTER.id - 14 : (tile.XTER?.id ?? 0)
      ] ?? 256;
      const zoneTileId = tile.XZON && tile.XZON.type > 0 ? 290 + tile.XZON.type : 0;

      tiles.push({
        x: tile.x,
        y: tile.y,
        z: tile.ALTM?.altitude ?? 0,
        terrain_tile_id: terrainTileId,
        zone_tile_id: zoneTileId,
        building_tile_id: tile.XBLD?.id ?? 0,
        building_corners: tile.XZON?.corners ?? '0000',
        zone_type: tile.XZON?.type ?? 0,
        water_level: tile.XTER?.waterLevel ?? 'dry',
        surface_water: tile.XTER?.surfaceWater ?? null,
        conductive: this.boolToYn(tile.XBIT?.conductive),
        powered: this.boolToYn(tile.XBIT?.powered),
        piped: this.boolToYn(tile.XBIT?.piped),
        watered: this.boolToYn(tile.XBIT?.watered),
        land_value: this.boolToYn(tile.XBIT?.landValue),
        water_covered: this.boolToYn(tile.XBIT?.waterCovered),
        rotate: this.boolToYn(tile.XBIT?.rotate),
        salt_water: this.boolToYn(tile.XBIT?.saltWater),
        subway: tile.XUND?.subway ?? false,
        subway_station: tile.XUND?.subwayStation ?? false,
        subway_direction: tile.XUND?.subwayLeftRight ?? null,
        pipes: tile.XUND?.pipes ?? false
      });
    }

    return {
      name,
      rotation,
      waterLevel,
      tiles
    };
  }

  private boolToYn(val: boolean | undefined): string {
    return val ? 'Y' : 'N';
  }

  private toVerboseFormat(segments: Record<string, Uint8Array>): void {
    let x = 0;
    let y = 0;

    this.struct = {
      tiles: []
    };

    for (let i = 0; i < 128 * 128; i++) {
      this.struct.tiles.push({ x: 0, y: 0 });
    }

    for (let i = 0; i < this.struct.tiles.length; i++) {
      if (y === 128) {
        y = 0;
        x++;
      }

      this.struct.tiles[i].x = x;
      this.struct.tiles[i].y = y;

      y++;
    }

    for (const [segmentTitle, data] of Object.entries(segments)) {
      const handler = this.segmentHandlers[segmentTitle];
      if (handler && this.struct) {
        handler(data, this.struct, this);
      }
    }
  }

  private splitIntoSegments(rest: Uint8Array): Record<string, Uint8Array> {
    const segments: Record<string, Uint8Array> = {};

    while (rest.length > 0) {
      const segmentTitle = Array.from(rest.subarray(0, 4))
        .map(b => String.fromCharCode(b))
        .join('');
      const lengthBytes = rest.subarray(4, 8);
      const segmentLength = new DataView(lengthBytes.buffer, lengthBytes.byteOffset).getUint32(0);
      let segmentContent = rest.subarray(8, 8 + segmentLength);

      if (!this.alreadyDecompressedSegments[segmentTitle]) {
        segmentContent = this.decompressSegment(segmentContent);
      }

      segments[segmentTitle] = segmentContent;
      rest = rest.subarray(8 + segmentLength);
    }

    return segments;
  }

  private decompressSegment(bytes: Uint8Array): Uint8Array {
    const output: number[] = [];
    let dataCount = 0;

    for (let i = 0; i < bytes.length; i++) {
      if (dataCount > 0) {
        output.push(bytes[i]);
        dataCount--;
        continue;
      }

      if (bytes[i] < 128) {
        dataCount = bytes[i];
      } else {
        const repeatCount = bytes[i] - 127;
        const repeated = bytes[i + 1];

        for (let j = 0; j < repeatCount; j++) {
          output.push(repeated);
        }
        i++;
      }
    }

    return Uint8Array.from(output);
  }

  private binaryString(bin: number, bytes: number): string {
    return bin.toString(2).padStart(8 * bytes, '0');
  }

  private hexString(bin: number, bytes: number): string {
    return bin.toString(16).padStart(2 * bytes, '0');
  }

  private segmentHandlers: Record<string, (data: Uint8Array, struct: Struct, importer: SC2Importer) => void> = {
    'ALTM': (data, struct) => {
      const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

      for (let i = 0; i < data.byteLength / 2; i++) {
        const square = view.getUint16(i * 2);
        struct.tiles[i].ALTM = {
          tunnelLevels: (square & 0xFF00),
          waterFlag: (square & 0x0080) !== 0,
          globalWaterLevel: (square & 0x0060),
          altitude: (square & 0x001F)
        };
      }
    },

    'CNAM': (data, struct) => {
      const view = new Uint8Array(data);
      const len = view[0] & 0x3F;
      const strDat = view.subarray(1, 1 + len);

      struct.cityName = Array.from(strDat)
        .map(b => String.fromCharCode(b))
        .join('')
        .replace(/[^\x00-\x7F]/g, '');
    },

    'XBIT': (data, struct) => {
      const view = new Uint8Array(data);

      view.forEach((square, i) => {
        struct.tiles[i].XBIT = {
          conductive: (square & 0x80) !== 0,
          powered: (square & 0x40) !== 0,
          piped: (square & 0x20) !== 0,
          watered: (square & 0x10) !== 0,
          landValue: (square & 0x08) !== 0,
          waterCovered: (square & 0x04) !== 0,
          rotate: (square & 0x02) !== 0,
          saltWater: (square & 0x01) !== 0
        };
      });
    },

    'XBLD': (data, struct, importer) => {
      const view = new Uint8Array(data);

      view.forEach((square, i) => {
        struct.tiles[i].XBLD = {
          id: square,
          idHex: importer.hexString(square, 1)
        };
      });
    },

    'XTER': (data, struct, importer) => {
      const view = new Uint8Array(data);

      view.forEach((square, i) => {
        const terrain: ParsedTile['XTER'] = {
          slope: null,
          surfaceWater: null,
          waterLevel: null,
          waterLevelHex: 0x0,
          id: 0,
          raw: ''
        };

        if (square < 0x3E) {
          terrain.slope = importer.xterSlopeMap[square & 0x0F] ?? null;
          terrain.surfaceWater = square & 0x0F;
          terrain.waterLevel = importer.waterLevels[(square & 0xF0) >> 4] ?? 'dry';
          terrain.waterLevelHex = (square & 0xF0) >> 4;
        } else if (square === 0x3E) {
          terrain.slope = importer.xterSlopeMap[0] ?? null;
          terrain.surfaceWater = square & 0x0F;
          terrain.waterLevel = importer.waterLevels[0x4] ?? 'dry';
          terrain.waterLevelHex = 0x4;
        } else if (square >= 0x40) {
          terrain.slope = importer.xterSlopeMap[0] ?? null;
          terrain.surfaceWater = square & 0x0F;
          terrain.waterLevel = importer.waterLevels[0x3] ?? 'dry';
          terrain.waterLevelHex = 0x3;
        }

        terrain.id = square & 0x0F;
        terrain.raw = importer.binaryString(square, 1);

        struct.tiles[i].XTER = terrain;
      });
    },

    'XUND': (data, struct, importer) => {
      const view = new Uint8Array(data);

      view.forEach((square, i) => {
        const underground: ParsedTile['XUND'] = {
          subway: false,
          pipes: false,
          slope: null,
          subwayLeftRight: null,
          missileSilo: false,
          subwayStation: false
        };

        if (square < 0x1E) {
          underground.slope = importer.xterSlopeMap[square & 0x0F] ?? null;

          if ((square & 0xF0) === 0x00) {
            underground.subway = true;
          } else if ((square & 0xF0) === 0x10 && square < 0x1F) {
            underground.pipes = true;
          }
        } else if (square === 0x1F || square === 0x20) {
          underground.subway = true;
          underground.pipes = true;
          underground.slope = importer.xterSlopeMap[0] ?? null;
          underground.subwayLeftRight = square === 0x1F;
        } else if (square === 0x22) {
          underground.missileSilo = true;
        } else if (square === 0x23) {
          underground.subwayStation = true;
          underground.slope = importer.xterSlopeMap[0] ?? null;
        }

        underground.raw = importer.binaryString(square, 1);
        struct.tiles[i].XUND = underground;
      });
    },

    'XZON': (data, struct, importer) => {
      const view = new Uint8Array(data);

      view.forEach((square, i) => {
        const binaryStr = importer.binaryString(square, 1);
        const corners = binaryStr.substring(0, 4);
        const zoneType = binaryStr.substring(4, 8);

        struct.tiles[i].XZON = {
          corners,
          zoneType,
          type: importer.xzonTypeMap[zoneType] ?? 0
        };
      });
    },

    'XTXT': (data, struct, importer) => {
      const view = new Uint8Array(data);

      view.forEach((square, i) => {
        const txt: ParsedTile['XTXT'] = {
          sign: false,
          microsimLabel: false,
          raw: ''
        };

        if (square === 0x00) {
          txt.sign = false;
          txt.microsimLabel = false;
        } else if (square >= 0x01 && square <= 0x32) {
          txt.sign = true;
          txt.microsimLabel = false;
          txt.xlabId = importer.hexString(square, 1);
        } else if (square >= 0x33 && square <= 0xC9) {
          txt.sign = false;
          txt.microsimLabel = true;
          txt.xlabId = importer.hexString(square, 1);
        } else if (square >= 0xC9) {
          txt.sign = false;
          txt.microsimLabel = false;
          txt.xthgData = importer.hexString(square, 1);
        }

        txt.raw = importer.binaryString(square, 1);
        struct.tiles[i].XTXT = txt;
      });
    },

    'XLAB': (data, struct) => {
      const view = new Uint8Array(data);
      const labels: string[] = [];

      for (let i = 0; i < 256; i++) {
        const labelPos = i * 25;
        const labelLength = Math.max(0, Math.min(view[labelPos], 24));
        const labelData = view.subarray(labelPos + 1, labelPos + 1 + labelLength);

        labels[i] = Array.from(labelData)
          .map(b => String.fromCharCode(b))
          .join('');
      }

      struct.XLAB = labels;
    },

    'MISC': (data, struct) => {
      const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

      struct.MISC = {
        rotation: view.getUint32(0x0008),
        yearFounded: view.getUint32(0x000c),
        daysElapsed: view.getUint32(0x0010),
        money: view.getUint32(0x0014),
        population: view.getUint32(0x0050),
        zoomLevel: view.getUint32(0x1014),
        cityCenterX: view.getUint32(0x1018),
        cityCenterY: view.getUint32(0x101c),
        waterLevel: view.getUint32(0x0E40)
      };
    }
  };

  public async importToData(data: Data, bytes: Uint8Array): Promise<void> {
    const cityData = this.parse(bytes);
    if (!cityData) {
      throw new Error('Failed to parse SC2 file');
    }

    data.cityName = cityData.name;
    data.cityRotation = cityData.rotation;
    data.waterLevel = cityData.waterLevel;

    for (const tile of cityData.tiles) {
      const { x, y } = tile;

      if (!data.map[x]) {
        data.map[x] = [];
      }

      data.map[x][y] = {
        x,
        y,
        z: tile.z,
        cornerSlope: parseInt(tile.building_corners, 2),
        water_level: tile.water_level,
        terrainHeight: tile.z,
        tiles: {
          terrain: tile.terrain_tile_id,
          building: tile.building_tile_id,
          zone: tile.zone_tile_id,
          network: null
        }
      };
    }

    data.cityLoaded = true;
    console.log(`City "${cityData.name}" loaded with ${cityData.tiles.length} tiles`);
  }
}
