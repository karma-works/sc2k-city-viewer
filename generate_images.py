#!/usr/bin/env python3
"""Generate images from JSON descriptions using OpenRouter API."""

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


def get_output_path(desc: AssetDescription, output_dir: Optional[Path]) -> Path:
    if output_dir:
        rel_path = desc.json_path.relative_to(desc.json_path.parents[-1])
        return output_dir / desc.source_file
    return desc.json_path.parent / desc.source_file


def generate_image(
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

        if "choices" not in result or not result["choices"]:
            print(f"Error: No choices in response")
            return None

        message = result["choices"][0].get("message", {})
        images = message.get("images", [])

        if not images:
            print(f"Error: No images in response")
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

        print(f"Error: Unexpected image data format")
        return None

    except requests.exceptions.RequestException as e:
        print(f"API request failed: {e}")
        return None
    except Exception as e:
        print(f"Error generating image: {e}")
        return None


def main():
    parser = argparse.ArgumentParser(
        description="Generate images from JSON descriptions"
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
    args = parser.parse_args()

    if not args.api_key:
        print(
            "Error: API key required. Set OPENROUTER_API_KEY environment variable or use --api-key"
        )
        sys.exit(1)

    output_dir = Path(args.output) if args.output else None
    if output_dir:
        output_dir.mkdir(parents=True, exist_ok=True)

    print(f"Loading JSON descriptions from: {args.root}")
    descriptions = load_json_descriptions(args.root)
    print(f"Found {len(descriptions)} asset descriptions")

    if args.limit:
        descriptions = descriptions[: args.limit]

    saved = 0
    errors = 0
    skipped = 0

    for i, desc in enumerate(descriptions, 1):
        output_path = get_output_path(desc, output_dir)

        if not args.force and output_path.exists():
            skipped += 1
            continue

        output_path.parent.mkdir(parents=True, exist_ok=True)
        print(
            f"[{i}/{len(descriptions)}] Generating: {desc.source_file} ({desc.width}x{desc.height})..."
        )

        image_bytes = generate_image(
            args.api_key, desc, args.model, args.output_size, args.aspect_ratio
        )

        if not image_bytes:
            print(f"  Failed")
            errors += 1
            continue

        try:
            img = Image.open(io.BytesIO(image_bytes))
            if img.mode != "RGBA":
                img = img.convert("RGBA")
            img.save(output_path, "PNG")
            saved += 1
            print(f"  Saved: {output_path}")
        except Exception as e:
            print(f"  Error saving: {e}")
            errors += 1

        if args.delay > 0:
            time.sleep(args.delay)

    print(f"\n{'=' * 50}")
    print(f"Completed: {saved} saved, {skipped} skipped, {errors} errors")


if __name__ == "__main__":
    main()
