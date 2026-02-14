import { glob } from "glob";
import sharp from "sharp";
import { mkdirSync, existsSync, writeFileSync } from "fs";
import { join, basename } from "path";

const TILES_DIR = "images/tiles";
const OUTPUT_DIR = "images/tilemap";
const SHEET_SIZE = 2048;
const PADDING = 0;

interface SpriteInfo {
  id: string;
  frame: number;
  path: string;
  width: number;
  height: number;
}

interface TilemapEntry {
  t: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Sheet {
  index: number;
  width: number;
  height: number;
  x: number;
  y: number;
  rowHeight: number;
}

function parseFilename(filename: string): { id: string; frame: number } {
  const base = basename(filename, ".png");
  const match = base.match(/^(\d+)(?:-(\d+))?$/);
  if (!match) throw new Error(`Invalid filename: ${filename}`);
  const tileId = parseInt(match[1], 10) - 1001;
  return {
    id: String(tileId),
    frame: match[2] ? parseInt(match[2], 10) : 0,
  };
}

async function getSprites(): Promise<SpriteInfo[]> {
  const files = await glob("*.png", { cwd: TILES_DIR });
  const sprites: SpriteInfo[] = [];

  for (const file of files) {
    const { id, frame } = parseFilename(file);
    const path = join(TILES_DIR, file);
    const meta = await sharp(path).metadata();
    sprites.push({
      id,
      frame,
      path,
      width: meta.width || 0,
      height: meta.height || 0,
    });
  }

  return sprites.sort((a, b) => {
    if (a.id !== b.id) return parseInt(a.id) - parseInt(b.id);
    return a.frame - b.frame;
  });
}

function createSheet(index: number): Sheet {
  return { index, width: SHEET_SIZE, height: SHEET_SIZE, x: 0, y: 0, rowHeight: 0 };
}

function packSprites(sprites: SpriteInfo[]): { sheets: Sheet[]; placements: Map<SpriteInfo, { sheet: Sheet; x: number; y: number }> } {
  const sheets: Sheet[] = [createSheet(0)];
  const placements = new Map<SpriteInfo, { sheet: Sheet; x: number; y: number }>();

  for (const sprite of sprites) {
    const { width, height } = sprite;
    let placed = false;

    for (const sheet of sheets) {
      if (sheet.x + width + PADDING > sheet.width) {
        sheet.y += sheet.rowHeight + PADDING;
        sheet.x = 0;
        sheet.rowHeight = 0;
      }

      if (sheet.y + height + PADDING > sheet.height) {
        continue;
      }

      placements.set(sprite, { sheet, x: sheet.x, y: sheet.y });
      sheet.x += width + PADDING;
      if (height > sheet.rowHeight) sheet.rowHeight = height;
      placed = true;
      break;
    }

    if (!placed) {
      const newSheet = createSheet(sheets.length);
      sheets.push(newSheet);
      placements.set(sprite, { sheet: newSheet, x: 0, y: 0 });
      newSheet.x = width + PADDING;
      newSheet.rowHeight = height;
    }
  }

  return { sheets, placements };
}

async function renderAndSaveSheet(
  sheet: Sheet,
  placements: Map<SpriteInfo, { sheet: Sheet; x: number; y: number }>
): Promise<void> {
  const composites: sharp.OverlayOptions[] = [];
  const spritesInSheet: SpriteInfo[] = [];

  for (const [sprite, { sheet: s }] of placements) {
    if (s === sheet) {
      spritesInSheet.push(sprite);
    }
  }

  for (const sprite of spritesInSheet) {
    const { x, y } = placements.get(sprite)!;
    const buffer = await sharp(sprite.path).toBuffer();
    composites.push({ input: buffer, left: x, top: y });
  }

  const base = sharp({
    create: {
      width: SHEET_SIZE,
      height: SHEET_SIZE,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  });

  const filename = join(OUTPUT_DIR, `tilemap_${sheet.index}.png`);
  if (composites.length > 0) {
    await base.composite(composites).png().toFile(filename);
  } else {
    await base.png().toFile(filename);
  }

  console.log(`Sheet ${sheet.index}: ${spritesInSheet.length} sprites -> ${filename}`);
}

function buildTilemap(
  placements: Map<SpriteInfo, { sheet: Sheet; x: number; y: number }>
): Record<string, TilemapEntry> {
  const tilemap: Record<string, TilemapEntry> = {};

  for (const [sprite, { sheet, x, y }] of placements) {
    const key = `${sprite.id}_${sprite.frame}`;
    tilemap[key] = {
      t: sheet.index,
      x,
      y,
      w: sprite.width,
      h: sprite.height,
    };
  }

  return tilemap;
}

async function main() {
  console.log("Scanning tiles...");
  const sprites = await getSprites();
  console.log(`Found ${sprites.length} sprites`);

  console.log("Packing sprites...");
  const { sheets, placements } = packSprites(sprites);
  console.log(`Packed into ${sheets.length} sheets`);

  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  console.log("Rendering and saving sheets...");
  for (const sheet of sheets) {
    await renderAndSaveSheet(sheet, placements);
  }

  console.log("Writing tilemap.json...");
  const tilemap = buildTilemap(placements);
  writeFileSync(join(OUTPUT_DIR, "tilemap.json"), JSON.stringify(tilemap));

  console.log("Done!");
}

main().catch(console.error);
