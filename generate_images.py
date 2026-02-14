#!/usr/bin/env python3
"""
Generate images from JSON descriptions using OpenRouter API.
Implements cost-saving strategies:
  - Sprite Sheet Generation: Generate multiple assets in one image (99% cost reduction)
  - Grid layout with padding for easy extraction
"""

import os
import sys
import json
import argparse
import time
import base64
import io
import re
from pathlib import Path
from typing import Optional
from dataclasses import dataclass

try:
    import requests
except ImportError:
    print("Error: requests package required. Install with: pip install requests")
    sys.exit(1)

try:
    from PIL import Image
except ImportError:
    print("Error: Pillow package required. Install with: pip install Pillow")
    sys.exit(1)

OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"
DEFAULT_MODEL = "google/gemini-2.5-flash-image"
GRID_SIZE = 10
CELL_SIZE = 64
PADDING = 20
DEFAULT_OUTPUT_SIZE = "2K"
DEFAULT_ASPECT_RATIO = "1:1"
IMAGE_SIZES_FILE = Path("images/image_sizes.json")


@dataclass
class AssetDescription:
    json_path: Path
    source_file: str
    keywords: list[str]
    asset_type: str
    hash: str
    width: int
    height: int


def load_image_sizes() -> dict:
    if IMAGE_SIZES_FILE.exists():
        with open(IMAGE_SIZES_FILE, "r") as f:
            return json.load(f)
    return {}


def load_json_descriptions(images_dir: str) -> list[AssetDescription]:
    descriptions = []
    images_path = Path(images_dir)
    sizes = load_image_sizes()

    for json_file in images_path.rglob("*.json"):
        if json_file.name.startswith("."):
            continue

        try:
            with open(json_file, "r") as f:
                data = json.load(f)

            source_file = data.get("_meta", {}).get(
                "source_file", json_file.stem + ".png"
            )
            keywords = data.get("keywords", [])
            asset_type = data.get("type", "sprite")
            hash_val = data.get("_meta", {}).get("hash", "")

            rel_path = json_file.relative_to(images_path)
            png_path = rel_path.with_suffix(".png")
            size_info = sizes.get(str(png_path), {"width": 64, "height": 64})

            descriptions.append(
                AssetDescription(
                    json_path=json_file,
                    source_file=source_file,
                    keywords=keywords,
                    asset_type=asset_type,
                    hash=hash_val,
                    width=size_info["width"],
                    height=size_info["height"],
                )
            )
        except Exception as e:
            print(f"Warning: Could not parse {json_file}: {e}")

    return sorted(descriptions, key=lambda x: (x.width, x.height, x.json_path))


def group_by_size(
    descriptions: list[AssetDescription],
) -> dict[tuple[int, int], list[AssetDescription]]:
    groups: dict[tuple[int, int], list[AssetDescription]] = {}
    for desc in descriptions:
        key = (desc.width, desc.height)
        if key not in groups:
            groups[key] = []
        groups[key].append(desc)
    return groups


SIZE_THRESHOLD = 128


def categorize_by_size(
    descriptions: list[AssetDescription], threshold: int = SIZE_THRESHOLD
) -> tuple[list[AssetDescription], list[AssetDescription]]:
    small = [d for d in descriptions if d.width <= threshold and d.height <= threshold]
    big = [d for d in descriptions if d.width > threshold or d.height > threshold]
    return small, big


def get_output_path(desc: AssetDescription, output_dir: Optional[Path]) -> Path:
    if output_dir:
        rel_path = desc.json_path.relative_to(desc.json_path.parents[-1])
        return output_dir / desc.source_file
    return desc.json_path.parent / desc.source_file


def build_sprite_sheet_prompt(
    descriptions: list[AssetDescription], cell_size: int
) -> str:
    asset_list = []
    for i, desc in enumerate(descriptions, 1):
        keywords_str = ", ".join(desc.keywords)
        asset_list.append(f"{i}. {desc.asset_type}: {keywords_str}")

    assets_text = "\n".join(asset_list)

    total_size = cell_size * GRID_SIZE + PADDING * (GRID_SIZE - 1)
    return f"""Generate a sprite sheet containing {len(descriptions)} unique game assets on a transparent background.

Grid layout specifications:
- Exactly {GRID_SIZE} columns x {GRID_SIZE} rows
- Each cell: exactly {cell_size}x{cell_size} pixels
- {PADDING} pixels gap between cells (no edge padding)
- Total canvas size: {total_size}x{total_size} pixels
- Assets centered within their cells
- Grid starts at pixel (0,0) - no margins

Style: Pixel art, isometric view, high contrast with clear edges.

Assets to generate (arranged left-to-right, top-to-bottom):
{assets_text}"""


def generate_sprite_sheet(
    api_key: str,
    descriptions: list[AssetDescription],
    cell_size: int,
    model: str = DEFAULT_MODEL,
    output_size: str = DEFAULT_OUTPUT_SIZE,
    aspect_ratio: str = DEFAULT_ASPECT_RATIO,
) -> Optional[bytes]:
    prompt = build_sprite_sheet_prompt(descriptions, cell_size)

    payload = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "modalities": ["image"],
        "image_config": {"aspect_ratio": aspect_ratio, "image_size": output_size},
    }

    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}

    try:
        response = requests.post(
            OPENROUTER_API_URL, headers=headers, json=payload, timeout=120
        )
        response.raise_for_status()

        result = response.json()

        if "choices" not in result or not result["choices"]:
            print(f"Error: No choices in response: {result}")
            return None

        message = result["choices"][0].get("message", {})
        images = message.get("images", [])

        if not images:
            content = message.get("content", "")
            print(f"Error: No images in response. Content: {content}")
            return None

        image_data = images[0]
        if isinstance(image_data, dict):
            image_url = image_data.get("image_url", {}).get("url", "")
        else:
            image_url = image_data

        if image_url.startswith("data:"):
            match = re.match(r"data:image/[^;]+;base64,(.+)", image_url)
            if match:
                return base64.b64decode(match.group(1))

        if image_url.startswith("http"):
            img_response = requests.get(image_url, timeout=30)
            img_response.raise_for_status()
            return img_response.content

        print(f"Error: Unexpected image data format: {type(image_data)}")
        return None

    except requests.exceptions.RequestException as e:
        print(f"API request failed: {e}")
        if hasattr(e, "response") and e.response is not None:
            print(f"Response: {e.response.text}")
        return None
    except Exception as e:
        print(f"Unexpected error: {e}")
        import traceback

        traceback.print_exc()
        return None


def split_sprite_sheet(
    image_bytes: bytes, count: int, cell_size: int, padding: int = PADDING
) -> list[Image.Image]:
    try:
        sheet = Image.open(io.BytesIO(image_bytes))
        if sheet.mode != "RGBA":
            sheet = sheet.convert("RGBA")

        images = []
        total_grid_size = cell_size * GRID_SIZE + padding * (GRID_SIZE - 1)
        sheet_width, sheet_height = sheet.size
        offset_x = (sheet_width - total_grid_size) // 2
        offset_y = (sheet_height - total_grid_size) // 2

        for idx in range(count):
            row = idx // GRID_SIZE
            col = idx % GRID_SIZE

            x = offset_x + col * (cell_size + padding)
            y = offset_y + row * (cell_size + padding)

            cell = sheet.crop((x, y, x + cell_size, y + cell_size))
            images.append(cell)

        return images

    except Exception as e:
        print(f"Error splitting sprite sheet: {e}")
        return []


def process_batch(
    api_key: str,
    descriptions: list[AssetDescription],
    output_dir: Optional[Path],
    force: bool,
    model: str = DEFAULT_MODEL,
    output_size: str = DEFAULT_OUTPUT_SIZE,
    aspect_ratio: str = DEFAULT_ASPECT_RATIO,
) -> tuple[int, int]:
    need_process = []
    for desc in descriptions:
        output_path = get_output_path(desc, output_dir)
        if force or not output_path.exists():
            need_process.append(desc)

    if not need_process:
        return 0, 0

    cell_size = need_process[0].width
    print(
        f"Generating sprite sheet for {len(need_process)} assets ({cell_size}x{cell_size})..."
    )

    image_bytes = generate_sprite_sheet(
        api_key, need_process, cell_size, model, output_size, aspect_ratio
    )

    if not image_bytes:
        print("Failed to generate sprite sheet")
        return 0, 1

    print("Splitting sprite sheet into individual images...")
    images = split_sprite_sheet(image_bytes, len(need_process), cell_size)

    if len(images) != len(need_process):
        print(f"Warning: Expected {len(need_process)} images, got {len(images)}")

    saved = 0
    for i, desc in enumerate(need_process):
        if i >= len(images):
            break

        output_path = get_output_path(desc, output_dir)
        output_path.parent.mkdir(parents=True, exist_ok=True)

        try:
            images[i].save(output_path, "PNG")
            saved += 1
            print(f"Saved: {output_path} ({desc.width}x{desc.height})")
        except Exception as e:
            print(f"Error saving {output_path}: {e}")

    return saved, 0


def process_individual(
    api_key: str,
    descriptions: list[AssetDescription],
    output_dir: Optional[Path],
    force: bool,
    model: str = DEFAULT_MODEL,
    output_size: str = DEFAULT_OUTPUT_SIZE,
    aspect_ratio: str = DEFAULT_ASPECT_RATIO,
    delay: float = 0.5,
) -> tuple[int, int]:
    saved = 0
    errors = 0

    for desc in descriptions:
        output_path = get_output_path(desc, output_dir)
        if not force and output_path.exists():
            continue

        output_path.parent.mkdir(parents=True, exist_ok=True)
        print(f"Generating: {desc.source_file} ({desc.width}x{desc.height})...")

        image_bytes = generate_single_image(
            api_key, desc, model, output_size, aspect_ratio
        )

        if not image_bytes:
            print(f"Failed to generate {desc.source_file}")
            errors += 1
            continue

        try:
            img = Image.open(io.BytesIO(image_bytes))
            if img.mode != "RGBA":
                img = img.convert("RGBA")
            img.save(output_path, "PNG")
            saved += 1
            print(f"Saved: {output_path}")
        except Exception as e:
            print(f"Error saving {output_path}: {e}")
            errors += 1

        time.sleep(delay)

    return saved, errors


def generate_single_image(
    api_key: str,
    desc: AssetDescription,
    model: str = DEFAULT_MODEL,
    output_size: str = DEFAULT_OUTPUT_SIZE,
    aspect_ratio: str = DEFAULT_ASPECT_RATIO,
) -> Optional[bytes]:
    keywords_str = ", ".join(desc.keywords)

    prompt = f"""Generate a single game asset image:
Type: {desc.asset_type}
Description: {keywords_str}

Style: Pixel art, isometric view, high contrast, transparent background.
Size: {desc.width}x{desc.height} pixels, centered."""

    payload = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "modalities": ["image"],
        "image_config": {"aspect_ratio": aspect_ratio, "image_size": output_size},
    }

    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}

    try:
        response = requests.post(
            OPENROUTER_API_URL, headers=headers, json=payload, timeout=120
        )
        response.raise_for_status()

        result = response.json()
        message = result["choices"][0].get("message", {})
        images = message.get("images", [])

        if not images:
            return None

        image_data = images[0]
        if isinstance(image_data, dict):
            image_url = image_data.get("image_url", {}).get("url", "")
        else:
            image_url = image_data

        if image_url.startswith("data:"):
            match = re.match(r"data:image/[^;]+;base64,(.+)", image_url)
            if match:
                return base64.b64decode(match.group(1))

        if image_url.startswith("http"):
            img_response = requests.get(image_url, timeout=30)
            img_response.raise_for_status()
            return img_response.content

        return None

    except Exception as e:
        print(f"Error generating single image: {e}")
        return None


def main():
    parser = argparse.ArgumentParser(
        description="Generate images from JSON descriptions (cost-optimized)"
    )
    parser.add_argument(
        "--root",
        "-r",
        default="images",
        help="Root directory containing JSON descriptions",
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
        "--output",
        "-o",
        help="Output directory for generated images (default: same as source)",
    )
    parser.add_argument(
        "--force",
        "-f",
        action="store_true",
        help="Regenerate all images even if they exist",
    )
    parser.add_argument(
        "--limit",
        "-l",
        type=int,
        default=None,
        help="Limit number of assets to process",
    )
    parser.add_argument(
        "--delay",
        "-d",
        type=float,
        default=0.5,
        help="Delay between API calls (seconds)",
    )
    parser.add_argument(
        "--batch-size",
        "-b",
        type=int,
        default=GRID_SIZE * GRID_SIZE,
        help=f"Number of assets per sprite sheet (default: {GRID_SIZE * GRID_SIZE})",
    )
    parser.add_argument(
        "--output-size",
        "-s",
        default=DEFAULT_OUTPUT_SIZE,
        choices=["1K", "2K"],
        help="Output image size (default: 2K)",
    )
    parser.add_argument(
        "--aspect-ratio",
        "-a",
        default=DEFAULT_ASPECT_RATIO,
        help="Aspect ratio for generated images (default: 1:1)",
    )
    parser.add_argument(
        "--test",
        "-t",
        action="store_true",
        help="Test mode: process only 2 batches to verify setup",
    )
    parser.add_argument(
        "--save-sprite-sheets",
        action="store_true",
        help="Save the generated sprite sheets for inspection",
    )
    args = parser.parse_args()

    if not args.api_key:
        print(
            "Error: API key required. Set OPENROUTER_API_KEY environment variable or use --api-key"
        )
        sys.exit(1)

    output_dir = Path(args.output) if args.output else None
    if output_dir:
        output_dir.mkdir(parents=True, exist_ok=True)

    if args.test:
        print("=" * 50)
        print("TEST MODE: Processing only 2 batches")
        print("=" * 50)

    print(f"Loading JSON descriptions from: {args.root}")
    descriptions = load_json_descriptions(args.root)
    print(f"Found {len(descriptions)} asset descriptions")

    if args.limit:
        descriptions = descriptions[: args.limit]

    small, big = categorize_by_size(descriptions, SIZE_THRESHOLD)
    print(f"Small assets (≤{SIZE_THRESHOLD}x{SIZE_THRESHOLD}): {len(small)}")
    print(f"Big assets (>{SIZE_THRESHOLD}x{SIZE_THRESHOLD}): {len(big)}")

    if args.test:
        small = small[: args.batch_size * 2]
        big = big[:2]
        print(f"Test mode: Using {len(small)} small + {len(big)} big")

    total_saved = 0
    api_calls = 0
    errors = 0

    small_groups = group_by_size(small)
    for size_key, group in small_groups.items():
        size_str = f"{size_key[0]}x{size_key[1]}"
        print(f"\nProcessing {len(group)} assets of size {size_str}...")

        for i in range(0, len(group), args.batch_size):
            batch = group[i : i + args.batch_size]
            batch_num = i // args.batch_size + 1
            total_batches = (len(group) + args.batch_size - 1) // args.batch_size

            print(f"  Sprite sheet {batch_num}/{total_batches}...")

            saved, err = process_batch(
                args.api_key,
                batch,
                output_dir,
                args.force,
                args.model,
                args.output_size,
                args.aspect_ratio,
            )

            total_saved += saved
            errors += err
            api_calls += 1

            if args.delay > 0 and i + args.batch_size < len(group):
                time.sleep(args.delay)

    if big:
        print(f"\nProcessing {len(big)} big assets individually...")
        saved, err = process_individual(
            args.api_key,
            big,
            output_dir,
            args.force,
            args.model,
            args.output_size,
            args.aspect_ratio,
            args.delay,
        )
        total_saved += saved
        errors += err
        api_calls += len(big)

    print(f"\n{'=' * 50}")
    print(f"Completed: {total_saved} images saved")
    print(f"API calls made: {api_calls}")
    if len(descriptions) > 0:
        savings = 100 * (1 - api_calls / len(descriptions))
        print(f"Cost reduction: ~{savings:.1f}%")
    print(f"Errors: {errors}")


if __name__ == "__main__":
    main()
