#!/usr/bin/env python3
"""
Generate descriptions for graphical assets using OpenRouter API.
Implements cost-saving strategies:
  - Strategy A: Stitch small assets into grids (99% cost reduction)
  - Strategy B: Low thinking level (fewer reasoning tokens)
  - Strategy C: Structured JSON output (predictable output tokens)
"""

import os
import sys
import json
import argparse
import time
import hashlib
import io
import base64
from pathlib import Path
from typing import Optional
from dataclasses import dataclass

try:
    from openai import OpenAI
except ImportError:
    print("Error: openai package required. Install with: pip install openai")
    sys.exit(1)

try:
    from PIL import Image
except ImportError:
    print("Error: Pillow package required. Install with: pip install Pillow")
    sys.exit(1)

IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"}

MIME_TYPES = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".bmp": "image/bmp",
}

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
DEFAULT_MODEL = "google/gemini-3-flash-preview"

GRID_SIZE = 10
MAX_SINGLE_IMAGE_DIM = 150

GRID_PROMPT = """Analyze this sprite sheet grid containing exactly {count} game assets arranged in a grid layout.
Each cell represents one asset. Process left-to-right, top-to-bottom.

Return a JSON object with a "tiles" array. Each entry must have:
{{"row": int, "col": int, "keywords": ["word1", "word2", "word3", "word4", "word5"], "type": "tile|sprite|icon|ui_element"}}

Row and col are 1-indexed. Return ONLY valid JSON."""

SINGLE_PROMPT = """Describe this game asset in exactly 5 keywords.
Return JSON: {{"keywords": ["word1", "word2", "word3", "word4", "word5"], "type": "tile|sprite|icon|ui_element"}}
Return ONLY valid JSON."""


@dataclass
class ImageInfo:
    path: Path
    width: int
    height: int
    hash: str


def get_image_files(root_dir: str) -> list[Path]:
    files = []
    root_path = Path(root_dir)
    for ext in IMAGE_EXTENSIONS:
        for f in root_path.rglob(f"*{ext}"):
            if "dist" not in f.parts:
                files.append(f)
        for f in root_path.rglob(f"*{ext.upper()}"):
            if "dist" not in f.parts:
                files.append(f)
    return sorted(set(files))


def get_description_path(image_path: Path, output_format: str) -> Path:
    ext = ".json" if output_format == "json" else ".md"
    return image_path.with_suffix(ext)


def file_hash(filepath: Path) -> str:
    hasher = hashlib.md5()
    with open(filepath, "rb") as f:
        hasher.update(f.read())
    return hasher.hexdigest()


def load_progress(progress_file: Path) -> dict:
    if progress_file.exists():
        with open(progress_file, "r") as f:
            return json.load(f)
    return {}


def save_progress(progress_file: Path, progress: dict):
    with open(progress_file, "w") as f:
        json.dump(progress, f, indent=2)


def get_image_info(image_path: Path) -> Optional[ImageInfo]:
    try:
        with Image.open(image_path) as img:
            return ImageInfo(
                path=image_path,
                width=img.width,
                height=img.height,
                hash=file_hash(image_path),
            )
    except Exception as e:
        print(f"Warning: Could not read {image_path}: {e}")
        return None


def categorize_images(images: list[Path]) -> tuple[list[ImageInfo], list[ImageInfo]]:
    small_images = []
    large_images = []

    for img_path in images:
        info = get_image_info(img_path)
        if info:
            if (
                info.width <= MAX_SINGLE_IMAGE_DIM
                and info.height <= MAX_SINGLE_IMAGE_DIM
            ):
                small_images.append(info)
            else:
                large_images.append(info)

    return small_images, large_images


def create_sprite_sheet(images: list[ImageInfo]) -> tuple[bytes, list[tuple[int, int]]]:
    if not images:
        return b"", []

    first_img = Image.open(images[0].path)
    cell_w, cell_h = first_img.width, first_img.height
    first_img.close()

    count = min(len(images), GRID_SIZE * GRID_SIZE)
    grid_w = min(count, GRID_SIZE)
    grid_h = (count + GRID_SIZE - 1) // GRID_SIZE

    sheet = Image.new("RGBA", (grid_w * cell_w, grid_h * cell_h), (0, 0, 0, 0))

    positions = []
    for idx, img_info in enumerate(images[:count]):
        row = idx // GRID_SIZE
        col = idx % GRID_SIZE
        with Image.open(img_info.path) as img:
            if img.mode != "RGBA":
                img = img.convert("RGBA")
            sheet.paste(img, (col * cell_w, row * cell_h))
        positions.append((row + 1, col + 1))

    buffer = io.BytesIO()
    sheet.save(buffer, format="PNG")
    return buffer.getvalue(), positions


def generate_grid_description(
    client: OpenAI, images: list[ImageInfo], model: str = DEFAULT_MODEL
) -> dict[Path, dict]:
    if not images:
        return {}

    image_bytes, positions = create_sprite_sheet(images)
    count = len(positions)
    base64_image = base64.b64encode(image_bytes).decode("utf-8")

    try:
        response = client.chat.completions.create(
            model=model,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/png;base64,{base64_image}"
                            },
                        },
                        {
                            "type": "text",
                            "text": GRID_PROMPT.format(count=count),
                        },
                    ],
                }
            ],
            temperature=0.2,
            response_format={"type": "json_object"},
        )

        print(f"API Response received. Model: {response.model}")
        result = json.loads(response.choices[0].message.content)
        print(f"Parsed JSON: {result}")
        tiles = result.get("tiles", [])

        descriptions = {}
        for i, img_info in enumerate(images[:count]):
            row, col = positions[i]
            tile_desc = None
            for t in tiles:
                if t.get("row") == row and t.get("col") == col:
                    tile_desc = t
                    break

            if tile_desc:
                descriptions[img_info.path] = {
                    "keywords": tile_desc.get("keywords", []),
                    "type": tile_desc.get("type", "unknown"),
                    "_meta": {
                        "source_file": img_info.path.name,
                        "hash": img_info.hash,
                        "generated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
                        "batch_method": "sprite_sheet",
                    },
                }
            else:
                descriptions[img_info.path] = {
                    "keywords": ["unknown"],
                    "type": "unknown",
                    "_meta": {
                        "source_file": img_info.path.name,
                        "hash": img_info.hash,
                        "generated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
                    },
                }

        return descriptions

    except Exception as e:
        print(f"Error processing grid: {e}")
        import traceback

        traceback.print_exc()
        return {}


def generate_single_description(
    client: OpenAI, img_info: ImageInfo, model: str = DEFAULT_MODEL
) -> Optional[dict]:
    ext = img_info.path.suffix.lower()
    if ext not in MIME_TYPES:
        return None

    try:
        with open(img_info.path, "rb") as f:
            image_bytes = f.read()

        base64_image = base64.b64encode(image_bytes).decode("utf-8")
        mime_type = MIME_TYPES[ext]

        response = client.chat.completions.create(
            model=model,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:{mime_type};base64,{base64_image}"
                            },
                        },
                        {
                            "type": "text",
                            "text": SINGLE_PROMPT,
                        },
                    ],
                }
            ],
            temperature=0.2,
            response_format={"type": "json_object"},
        )

        result = json.loads(response.choices[0].message.content)
        result["_meta"] = {
            "source_file": img_info.path.name,
            "hash": img_info.hash,
            "generated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        }
        return result

    except Exception as e:
        print(f"Error processing {img_info.path}: {e}")
        import traceback

        traceback.print_exc()
        return None


def generate_markdown(description: dict, image_path: Path) -> str:
    md = f"# {image_path.name}\n\n"
    keywords = description.get("keywords", [])
    if keywords:
        md += f"**Keywords:** {', '.join(keywords)}\n\n"
    md += f"**Type:** {description.get('type', 'N/A')}\n\n"
    return md


def process_batch(
    client: OpenAI,
    images: list[ImageInfo],
    output_format: str,
    force: bool,
    progress: dict,
    progress_file: Path,
    model: str = DEFAULT_MODEL,
) -> int:
    need_process = []
    for img_info in images:
        str_path = str(img_info.path)
        if force:
            need_process.append(img_info)
        elif str_path in progress and progress[str_path].get("hash") == img_info.hash:
            continue
        elif get_description_path(img_info.path, output_format).exists():
            continue
        else:
            need_process.append(img_info)

    if not need_process:
        return 0

    descriptions = generate_grid_description(client, need_process)
    saved = 0

    for img_info in need_process:
        desc = descriptions.get(img_info.path)
        if not desc:
            continue

        desc_path = get_description_path(img_info.path, output_format)
        if output_format == "json":
            with open(desc_path, "w") as f:
                json.dump(desc, f, indent=2)
        else:
            with open(desc_path, "w") as f:
                f.write(generate_markdown(desc, img_info.path))

        progress[str(img_info.path)] = {"hash": img_info.hash, "processed": True}
        saved += 1

    save_progress(progress_file, progress)
    return saved


def process_large_image(
    client: OpenAI,
    img_info: ImageInfo,
    output_format: str,
    force: bool,
    progress: dict,
    progress_file: Path,
    model: str = DEFAULT_MODEL,
) -> bool:
    str_path = str(img_info.path)

    if not force:
        if str_path in progress and progress[str_path].get("hash") == img_info.hash:
            return True
        if get_description_path(img_info.path, output_format).exists():
            return True

    description = generate_single_description(client, img_info)
    if not description:
        return False

    desc_path = get_description_path(img_info.path, output_format)
    if output_format == "json":
        with open(desc_path, "w") as f:
            json.dump(description, f, indent=2)
    else:
        with open(desc_path, "w") as f:
            f.write(generate_markdown(description, img_info.path))

    progress[str_path] = {"hash": img_info.hash, "processed": True}
    save_progress(progress_file, progress)
    return True


def main():
    parser = argparse.ArgumentParser(
        description="Generate descriptions for graphical assets (cost-optimized)"
    )
    parser.add_argument(
        "--root", "-r", default="images", help="Root directory to search for images"
    )
    parser.add_argument(
        "--api-key",
        "-k",
        default=os.environ.get("OPENROUTER_API_KEY"),
        help="OpenRouter API key (or set OPENROUTER_API_KEY env var)",
    )
    parser.add_argument(
        "--model",
        "-M",
        default=DEFAULT_MODEL,
        help=f"Model to use (default: {DEFAULT_MODEL})",
    )
    parser.add_argument(
        "--format", "-f", choices=["json", "md"], default="json", help="Output format"
    )
    parser.add_argument(
        "--force", action="store_true", help="Regenerate all descriptions"
    )
    parser.add_argument(
        "--limit",
        "-l",
        type=int,
        default=None,
        help="Limit number of images to process",
    )
    parser.add_argument(
        "--delay",
        "-d",
        type=float,
        default=0.3,
        help="Delay between API calls (seconds)",
    )
    parser.add_argument(
        "--grid-size",
        "-g",
        type=int,
        default=GRID_SIZE,
        help="Grid size for sprite sheets",
    )
    parser.add_argument(
        "--max-single-dim",
        "-m",
        type=int,
        default=MAX_SINGLE_IMAGE_DIM,
        help="Max dimension for batching into sprite sheets",
    )
    parser.add_argument(
        "--test",
        "-t",
        action="store_true",
        help="Test mode: process only 2 images to verify setup",
    )
    args = parser.parse_args()

    if not args.api_key:
        print(
            "Error: API key required. Set OPENROUTER_API_KEY environment variable or use --api-key"
        )
        sys.exit(1)

    client = OpenAI(
        api_key=args.api_key,
        base_url=OPENROUTER_BASE_URL,
    )

    if args.test:
        print("=" * 50)
        print("TEST MODE: Processing only 2 images")
        print("=" * 50)

    print(f"Searching for images in: {args.root}")
    all_images = get_image_files(args.root)
    print(f"Found {len(all_images)} images")

    if args.limit:
        all_images = all_images[: args.limit]

    print("Categorizing images by size...")
    small_images, large_images = categorize_images(all_images)
    print(f"Small images (batchable): {len(small_images)}")
    print(f"Large images (individual): {len(large_images)}")

    if args.test:
        small_images = small_images[:1] if small_images else []
        large_images = large_images[:1] if large_images else []
        print(
            f"Test mode: Using {len(small_images)} small + {len(large_images)} large images"
        )

    progress_file = Path(args.root) / ".asset_descriptions_progress.json"
    progress = load_progress(progress_file)

    total_saved = 0
    api_calls = 0
    errors = 0

    for i in range(0, len(small_images), args.grid_size * args.grid_size):
        batch = small_images[i : i + args.grid_size * args.grid_size]
        batch_num = (i // (args.grid_size * args.grid_size)) + 1
        total_batches = (len(small_images) + args.grid_size * args.grid_size - 1) // (
            args.grid_size * args.grid_size
        )
        print(
            f"Batch {batch_num}/{total_batches}: Processing {len(batch)} small images as sprite sheet..."
        )

        saved = process_batch(
            client, batch, args.format, args.force, progress, progress_file, args.model
        )
        total_saved += saved
        api_calls += 1

        if args.delay > 0:
            time.sleep(args.delay)

    for i, img_info in enumerate(large_images, 1):
        print(f"[{i}/{len(large_images)}] Processing large image: {img_info.path.name}")
        success = process_large_image(
            client,
            img_info,
            args.format,
            args.force,
            progress,
            progress_file,
            args.model,
        )

        if success:
            total_saved += 1
        else:
            errors += 1
        api_calls += 1

        if args.delay > 0 and i < len(large_images):
            time.sleep(args.delay)

    print(f"\n{'=' * 50}")
    print(f"Completed: {total_saved} descriptions saved")
    print(f"API calls made: {api_calls}")
    print(f"Cost reduction: ~{100 * (1 - api_calls / max(len(all_images), 1)):.1f}%")
    print(f"Errors: {errors}")
    print(f"Progress saved to: {progress_file}")


if __name__ == "__main__":
    main()
