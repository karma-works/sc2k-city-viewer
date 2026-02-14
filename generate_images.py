#!/usr/bin/env python3
"""Generate images from JSON descriptions using OpenRouter API."""

import os
import sys
import json
import argparse
import asyncio
import base64
import io
import math
import re
import time
from pathlib import Path
from typing import Optional, Callable
from dataclasses import dataclass, field
from concurrent.futures import ThreadPoolExecutor

try:
    import aiohttp
except ImportError:
    print("Error: aiohttp package required. Install with: pip install aiohttp")
    sys.exit(1)

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
IMAGE_SIZES_FILE = Path("images/image_sizes.json")

SC2K_STYLE_PROMPT = """STYLE REQUIREMENTS (SimCity 2000 aesthetic):
- Dimetric projection: vertical lines remain vertical, base edges follow 2:1 pixel ratio
- Fixed lighting: light source from TOP-LEFT, south and east faces must be in shadow
- Muted earth-tone palette: olive greens, dusty browns, deep blues, industrial greys
- High saturation ONLY for neon signs, lights, or zone overlays
- Pixel art with dithering for gradients on curved surfaces
- Micro-detailing: visible window panes, HVAC units, tiny signs/billboards
- Soft shadows only (no harsh directional shadows)
- Isolated on solid neutral gray background for easy extraction
- Render as game-ready sprite asset, not a scene"""

ISO_BASE_PROMPT = """TECHNICAL REQUIREMENTS:
- Isometric dimetric view, orthographic projection, no perspective distortion
- 3D render with flat ambient lighting, soft global illumination
- Game asset quality: clean edges, tileable, consistent scale
- Voxel-style grid alignment for perfect isometric angles
- Exact pixel dimensions: {width}x{height} centered in canvas
- Asset must be properly cropped and centered"""


def build_sc2k_prompt(keywords: str, asset_type: str, width: int, height: int) -> str:
    return f"""Generate a single SimCity 2000-style isometric game sprite asset.

ASSET DESCRIPTION:
- Type: {asset_type}
- Content: {keywords}
- Exact dimensions: {width}x{height} pixels

{SC2K_STYLE_PROMPT}

{ISO_BASE_PROMPT.format(width=width, height=height)}

CRITICAL: Output ONLY the asset on neutral gray background. No scene, no environment, no multiple angles. Center the {width}x{height} asset precisely."""


VALID_ASPECT_RATIOS = [
    "1:1",
    "2:3",
    "3:2",
    "3:4",
    "4:3",
    "4:5",
    "5:4",
    "9:16",
    "16:9",
    "21:9",
]


def calculate_output_config(width: int, height: int) -> tuple[str, str]:
    max_dim = max(width, height)
    if max_dim <= 512:
        output_size = "1K"
    elif max_dim <= 1024:
        output_size = "2K"
    else:
        output_size = "4K"

    def parse_ratio(ratio: str) -> float:
        parts = ratio.split(":")
        return int(parts[0]) / int(parts[1])

    actual_ratio = width / height if height > 0 else 1.0
    valid_ratios = [(r, parse_ratio(r)) for r in VALID_ASPECT_RATIOS]
    closest = min(valid_ratios, key=lambda x: abs(x[1] - actual_ratio))
    aspect_ratio = closest[0]

    return output_size, aspect_ratio


@dataclass
class AssetDescription:
    json_path: Path
    source_file: str
    keywords: list[str]
    asset_type: str
    hash: str
    width: int
    height: int
    style_reference: Optional[str] = None
    grid_position: Optional[tuple[int, int]] = None
    grid_size: Optional[tuple[int, int]] = None


@dataclass
class BatchConfig:
    max_concurrent: int = 5
    style_reference_path: Optional[Path] = None
    use_compositional: bool = False
    grid_size: tuple[int, int] = (2, 2)
    batch_group_by_style: bool = False


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
) -> Optional[bytes]:
    keywords_str = ", ".join(desc.keywords)
    output_size, aspect_ratio = calculate_output_config(desc.width, desc.height)

    prompt = build_sc2k_prompt(keywords_str, desc.asset_type, desc.width, desc.height)

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


async def generate_image_async(
    session: aiohttp.ClientSession,
    api_key: str,
    desc: AssetDescription,
    model: str = DEFAULT_MODEL,
    style_reference_image: Optional[bytes] = None,
) -> tuple[AssetDescription, Optional[bytes]]:
    keywords_str = ", ".join(desc.keywords)
    output_size, aspect_ratio = calculate_output_config(desc.width, desc.height)

    if desc.grid_position and desc.grid_size:
        prompt = build_compositional_prompt(desc, keywords_str)
    else:
        prompt = build_sc2k_prompt(
            keywords_str, desc.asset_type, desc.width, desc.height
        )

    payload = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "modalities": ["image"],
        "image_config": {"aspect_ratio": aspect_ratio, "image_size": output_size},
    }

    if style_reference_image:
        b64_ref = base64.b64encode(style_reference_image).decode("utf-8")
        payload["messages"][0]["content"] = [
            {
                "type": "image_url",
                "image_url": {"url": f"data:image/png;base64,{b64_ref}"},
            },
            {"type": "text", "text": prompt},
        ]

    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}

    try:
        async with session.post(
            OPENROUTER_API_URL,
            headers=headers,
            json=payload,
            timeout=aiohttp.ClientTimeout(total=120),
        ) as response:
            if response.status != 200:
                error_text = await response.text()
                print(
                    f"API Error {response.status} for {desc.source_file}: {error_text[:500]}"
                )
                return (desc, None)
            result = await response.json()

            if "choices" not in result or not result["choices"]:
                print(f"Error: No choices in response for {desc.source_file}")
                return (desc, None)

            message = result["choices"][0].get("message", {})
            images = message.get("images", [])

            if not images:
                print(f"Error: No images in response for {desc.source_file}")
                return (desc, None)

            image_data = images[0]
            if isinstance(image_data, dict):
                image_url = image_data.get("image_url", {}).get("url", "")
            else:
                image_url = image_data

            if image_url.startswith("data:"):
                match = re.match(r"data:image/[^;]+;base64,(.+)", image_url)
                if match:
                    return (desc, base64.b64decode(match.group(1)))

            if image_url.startswith("http"):
                async with session.get(
                    image_url, timeout=aiohttp.ClientTimeout(total=30)
                ) as img_response:
                    img_response.raise_for_status()
                    return (desc, await img_response.read())

            print(f"Error: Unexpected image data format for {desc.source_file}")
            return (desc, None)

    except asyncio.TimeoutError:
        print(f"Timeout generating {desc.source_file}")
        return (desc, None)
    except Exception as e:
        print(f"Error generating {desc.source_file}: {e}")
        return (desc, None)


def build_compositional_prompt(desc: AssetDescription, keywords_str: str) -> str:
    if not desc.grid_position or not desc.grid_size:
        return build_sc2k_prompt(keywords_str, desc.asset_type, desc.width, desc.height)

    row, col = desc.grid_position
    grid_rows, grid_cols = desc.grid_size
    total_cells = grid_rows * grid_cols

    position_desc = f"cell {row * grid_cols + col + 1} of {total_cells}"

    return f"""Generate a {grid_rows}x{grid_cols} grid of SimCity 2000-style isometric game sprites.

GRID LAYOUT:
- Total cells: {total_cells}
- Current position: {position_desc} (row {row + 1}, column {col + 1})
- Cell size: {desc.width}x{desc.height} pixels each

ASSET FOR THIS CELL:
- Type: {desc.asset_type}
- Content: {keywords_str}

{SC2K_STYLE_PROMPT}

{ISO_BASE_PROMPT.format(width=desc.width, height=desc.height)}

CRITICAL: Each cell contains ONE centered asset on neutral gray background. Clean grid with consistent spacing."""


async def generate_batch_async(
    api_key: str,
    descriptions: list[AssetDescription],
    model: str,
    output_size: str,
    aspect_ratio: str,
    batch_config: BatchConfig,
    progress_callback: Optional[Callable] = None,
) -> list[tuple[AssetDescription, Optional[bytes]]]:
    results = []
    semaphore = asyncio.Semaphore(batch_config.max_concurrent)

    style_reference_image = None
    if batch_config.style_reference_path and batch_config.style_reference_path.exists():
        with open(batch_config.style_reference_path, "rb") as f:
            style_reference_image = f.read()

    connector = aiohttp.TCPConnector(limit=batch_config.max_concurrent)
    async with aiohttp.ClientSession(connector=connector) as session:

        async def bounded_generate(
            desc: AssetDescription,
        ) -> tuple[AssetDescription, Optional[bytes]]:
            async with semaphore:
                result = await generate_image_async(
                    session,
                    api_key,
                    desc,
                    model,
                    style_reference_image,
                )
                if progress_callback:
                    progress_callback(desc, result[1] is not None)
                return result

        tasks = [bounded_generate(desc) for desc in descriptions]
        results = await asyncio.gather(*tasks)

    return results


def generate_compositional_grid(
    api_key: str,
    descriptions: list[AssetDescription],
    model: str,
    grid_size: tuple[int, int],
) -> list[tuple[AssetDescription, Optional[bytes]]]:
    results = []
    for i in range(0, len(descriptions), grid_size[0] * grid_size[1]):
        batch = descriptions[i : i + grid_size[0] * grid_size[1]]
        combined_prompt = build_combined_grid_prompt(batch, grid_size)

        max_width = max(d.width for d in batch)
        max_height = max(d.height for d in batch)
        total_width = max_width * grid_size[1]
        total_height = max_height * grid_size[0]
        output_size, aspect_ratio = calculate_output_config(total_width, total_height)

        payload = {
            "model": model,
            "messages": [{"role": "user", "content": combined_prompt}],
            "modalities": ["image"],
            "image_config": {"aspect_ratio": aspect_ratio, "image_size": output_size},
        }

        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }

        try:
            response = requests.post(
                OPENROUTER_API_URL, headers=headers, json=payload, timeout=180
            )
            response.raise_for_status()
            result = response.json()

            if "choices" in result and result["choices"]:
                images = result["choices"][0].get("message", {}).get("images", [])
                if images:
                    image_data = images[0]
                    if isinstance(image_data, dict):
                        image_url = image_data.get("image_url", {}).get("url", "")
                    else:
                        image_url = image_data

                    image_bytes = None
                    if image_url.startswith("data:"):
                        match = re.match(r"data:image/[^;]+;base64,(.+)", image_url)
                        if match:
                            image_bytes = base64.b64decode(match.group(1))
                    elif image_url.startswith("http"):
                        img_response = requests.get(image_url, timeout=30)
                        img_response.raise_for_status()
                        image_bytes = img_response.content

                    if image_bytes:
                        grid_images = split_grid_image(
                            image_bytes, grid_size, batch[0].width, batch[0].height
                        )
                        for desc, img_bytes in zip(batch, grid_images):
                            results.append((desc, img_bytes))
                        continue

            for desc in batch:
                results.append((desc, None))

        except Exception as e:
            print(f"Error generating grid: {e}")
            for desc in batch:
                results.append((desc, None))

    return results


def build_combined_grid_prompt(
    descriptions: list[AssetDescription], grid_size: tuple[int, int]
) -> str:
    items = []
    max_width = max(d.width for d in descriptions) if descriptions else 64
    max_height = max(d.height for d in descriptions) if descriptions else 64
    for i, desc in enumerate(descriptions):
        keywords_str = ", ".join(desc.keywords)
        row, col = i // grid_size[1], i % grid_size[1]
        items.append(f"Cell ({row + 1},{col + 1}): {keywords_str} [{desc.asset_type}]")

    items_str = "\n".join(items)

    return f"""Generate a {grid_size[0]}x{grid_size[1]} grid of SimCity 2000-style isometric game sprites.

ASSETS PER CELL:
{items_str}

CELL SPECIFICATIONS:
- Each cell: {max_width}x{max_height} pixels
- Clean grid layout with consistent spacing
- Each asset centered within its cell

{SC2K_STYLE_PROMPT}

{ISO_BASE_PROMPT.format(width=max_width, height=max_height)}

CRITICAL: Output a clean {grid_size[0]}x{grid_size[1]} grid. Each cell contains ONE asset on neutral gray background."""


def split_grid_image(
    grid_bytes: bytes, grid_size: tuple[int, int], cell_width: int, cell_height: int
) -> list[Optional[bytes]]:
    try:
        grid_img = Image.open(io.BytesIO(grid_bytes))
        if grid_img.mode != "RGBA":
            grid_img = grid_img.convert("RGBA")

        total_width, total_height = grid_img.size
        cell_actual_width = total_width // grid_size[1]
        cell_actual_height = total_height // grid_size[0]

        images = []
        for row in range(grid_size[0]):
            for col in range(grid_size[1]):
                left = col * cell_actual_width
                upper = row * cell_actual_height
                right = left + cell_actual_width
                lower = upper + cell_actual_height

                cell_img = grid_img.crop((left, upper, right, lower))
                if cell_width != cell_actual_width or cell_height != cell_actual_height:
                    cell_img = cell_img.resize(
                        (cell_width, cell_height), Image.Resampling.NEAREST
                    )

                buffer = io.BytesIO()
                cell_img.save(buffer, format="PNG")
                images.append(buffer.getvalue())

        return images
    except Exception as e:
        print(f"Error splitting grid image: {e}")
        return [None] * (grid_size[0] * grid_size[1])


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
        help="Delay between API calls (seconds, only for sync mode)",
    )
    parser.add_argument(
        "--concurrent",
        "-c",
        type=int,
        default=5,
        help="Number of concurrent API requests (default: 5)",
    )
    parser.add_argument(
        "--style-reference",
        "-S",
        type=str,
        default=None,
        help="Path to style reference image for consistent styling across batch",
    )
    parser.add_argument(
        "--compositional",
        "-C",
        action="store_true",
        help="Use compositional grid prompting (generates multiple assets per request)",
    )
    parser.add_argument(
        "--grid-size",
        "-g",
        type=str,
        default="2x2",
        help="Grid size for compositional mode (e.g., 2x2, 3x3, default: 2x2)",
    )
    parser.add_argument(
        "--sync",
        action="store_true",
        help="Use synchronous mode (sequential requests instead of parallel)",
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

    to_process = []
    skipped = 0
    for desc in descriptions:
        output_path = get_output_path(desc, output_dir)
        if not args.force and output_path.exists():
            skipped += 1
        else:
            to_process.append(desc)

    if skipped > 0:
        print(f"Skipping {skipped} existing images")

    if not to_process:
        print("No images to generate")
        return

    grid_size = tuple(map(int, args.grid_size.lower().split("x")))
    grid_size = (grid_size[0], grid_size[1]) if len(grid_size) == 2 else (2, 2)
    style_ref_path = Path(args.style_reference) if args.style_reference else None

    batch_config = BatchConfig(
        max_concurrent=args.concurrent,
        style_reference_path=style_ref_path,
        use_compositional=args.compositional,
        grid_size=grid_size,
    )

    saved = 0
    errors = 0

    if args.compositional:
        print(f"Using compositional grid mode ({grid_size[0]}x{grid_size[1]})...")
        for i, desc in enumerate(to_process):
            desc.grid_size = grid_size
            desc.grid_position = (i // grid_size[1], i % grid_size[1])

        results = generate_compositional_grid(
            args.api_key,
            to_process,
            args.model,
            grid_size,
        )

        for desc, image_bytes in results:
            if image_bytes:
                output_path = get_output_path(desc, output_dir)
                output_path.parent.mkdir(parents=True, exist_ok=True)
                try:
                    img = Image.open(io.BytesIO(image_bytes))
                    if img.mode != "RGBA":
                        img = img.convert("RGBA")
                    img.save(output_path, "PNG")
                    saved += 1
                    print(f"  Saved: {output_path}")
                except Exception as e:
                    print(f"  Error saving {desc.source_file}: {e}")
                    errors += 1
            else:
                errors += 1

    elif args.sync:
        print(f"Using synchronous mode with {args.delay}s delay...")
        for i, desc in enumerate(to_process, 1):
            output_path = get_output_path(desc, output_dir)
            output_path.parent.mkdir(parents=True, exist_ok=True)
            print(
                f"[{i}/{len(to_process)}] Generating: {desc.source_file} ({desc.width}x{desc.height})..."
            )

            image_bytes = generate_image(args.api_key, desc, args.model)

            if image_bytes:
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
            else:
                print(f"  Failed")
                errors += 1

            if args.delay > 0 and i < len(to_process):
                time.sleep(args.delay)
    else:
        print(f"Using async mode with {args.concurrent} concurrent requests...")

        completed = [0]
        saved_count = [0]
        errors_count = [0]
        total = len(to_process)

        async def save_and_report(
            desc: AssetDescription, image_bytes: Optional[bytes]
        ) -> bool:
            completed[0] += 1
            if not image_bytes:
                print(f"[{completed[0]}/{total}] ✗ {desc.source_file}")
                errors_count[0] += 1
                return False

            output_path = get_output_path(desc, output_dir)
            output_path.parent.mkdir(parents=True, exist_ok=True)
            try:
                img = Image.open(io.BytesIO(image_bytes))
                if img.mode != "RGBA":
                    img = img.convert("RGBA")
                img.save(output_path, "PNG")
                saved_count[0] += 1
                print(f"[{completed[0]}/{total}] ✓ {desc.source_file} → {output_path}")
                return True
            except Exception as e:
                print(
                    f"[{completed[0]}/{total}] ✗ {desc.source_file} (save error: {e})"
                )
                errors_count[0] += 1
                return False

        async def run_async():
            semaphore = asyncio.Semaphore(batch_config.max_concurrent)

            style_reference_image = None
            if (
                batch_config.style_reference_path
                and batch_config.style_reference_path.exists()
            ):
                with open(batch_config.style_reference_path, "rb") as f:
                    style_reference_image = f.read()

            connector = aiohttp.TCPConnector(limit=batch_config.max_concurrent)
            async with aiohttp.ClientSession(connector=connector) as session:

                async def bounded_generate_and_save(desc: AssetDescription):
                    async with semaphore:
                        _, image_bytes = await generate_image_async(
                            session,
                            args.api_key,
                            desc,
                            args.model,
                            style_reference_image,
                        )
                        await save_and_report(desc, image_bytes)

                tasks = [bounded_generate_and_save(desc) for desc in to_process]
                await asyncio.gather(*tasks)

        asyncio.run(run_async())
        saved = saved_count[0]
        errors = errors_count[0]

    print(f"\n{'=' * 50}")
    print(f"Completed: {saved} saved, {skipped} skipped, {errors} errors")


if __name__ == "__main__":
    main()
