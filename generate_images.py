#!/usr/bin/env python3
"""Generate images from JSON descriptions using fal.ai API (Flux.1 Schnell)."""

import os
import sys
import json
import argparse
import asyncio
import io
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

FAL_API_URL = "https://queue.fal.run/fal-ai/flux/schnell"
FAL_POLL_INTERVAL = 1.0
FAL_MAX_POLL_TIME = 120
DEFAULT_MODEL = "flux-schnell"
IMAGE_SIZES_FILE = Path("images/image_sizes.json")

FAL_IMAGE_SIZES = {
    "square_hd": (1024, 1024),
    "square": (512, 512),
    "portrait_4_3": (768, 1024),
    "portrait_16_9": (576, 1024),
    "landscape_4_3": (1024, 768),
    "landscape_16_9": (1024, 576),
}

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


def calculate_output_config(width: int, height: int) -> str:
    actual_ratio = width / height if height > 0 else 1.0
    best_size = "square"
    best_diff = float("inf")

    for size_name, (sw, sh) in FAL_IMAGE_SIZES.items():
        size_ratio = sw / sh
        diff = abs(actual_ratio - size_ratio)
        if diff < best_diff:
            best_diff = diff
            best_size = size_name

    return best_size


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
    image_size = calculate_output_config(desc.width, desc.height)
    prompt = build_sc2k_prompt(keywords_str, desc.asset_type, desc.width, desc.height)

    payload = {
        "prompt": prompt,
        "image_size": image_size,
        "num_inference_steps": 4,
        "num_images": 1,
    }

    headers = {"Authorization": f"Key {api_key}", "Content-Type": "application/json"}

    try:
        response = requests.post(FAL_API_URL, headers=headers, json=payload, timeout=30)
        response.raise_for_status()
        result = response.json()

        status_url = result.get("status_url")
        response_url = result.get("response_url")

        if not status_url or not response_url:
            print(f"Error: Missing status_url or response_url")
            print(f"  Response: {json.dumps(result, indent=2)[:1000]}")
            return None

        poll_start = time.time()
        while time.time() - poll_start < FAL_MAX_POLL_TIME:
            status_response = requests.get(status_url, headers=headers, timeout=10)
            if status_response.status_code != 200:
                print(
                    f"Status check error {status_response.status_code}: {status_response.text[:200]}"
                )
                return None

            status_result = status_response.json()
            status = status_result.get("status")

            if status == "COMPLETED":
                break
            elif status in ("FAILED", "CANCELLED"):
                print(f"Request {status}")
                print(f"  Response: {json.dumps(status_result, indent=2)[:500]}")
                return None

            time.sleep(FAL_POLL_INTERVAL)
        else:
            print(f"Timeout after {FAL_MAX_POLL_TIME}s")
            return None

        result_response = requests.get(response_url, headers=headers, timeout=30)
        if result_response.status_code != 200:
            print(
                f"Result fetch error {result_response.status_code}: {result_response.text[:200]}"
            )
            return None

        final_result = result_response.json()

        images = final_result.get("images", [])
        if not images:
            print(f"Error: No images in response")
            print(f"  Response: {json.dumps(final_result, indent=2)[:1000]}")
            return None

        image_url = images[0].get("url", "")
        if not image_url:
            print(f"Error: No image URL in response")
            print(f"  Response: {json.dumps(final_result, indent=2)[:1000]}")
            return None

        img_response = requests.get(image_url, timeout=30)
        img_response.raise_for_status()
        return img_response.content

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
    image_size = calculate_output_config(desc.width, desc.height)

    if desc.grid_position and desc.grid_size:
        prompt = build_compositional_prompt(desc, keywords_str)
    else:
        prompt = build_sc2k_prompt(
            keywords_str, desc.asset_type, desc.width, desc.height
        )

    payload = {
        "prompt": prompt,
        "image_size": image_size,
        "num_inference_steps": 4,
        "num_images": 1,
    }

    headers = {"Authorization": f"Key {api_key}", "Content-Type": "application/json"}

    try:
        async with session.post(
            FAL_API_URL,
            headers=headers,
            json=payload,
            timeout=aiohttp.ClientTimeout(total=30),
        ) as response:
            if response.status != 200:
                error_text = await response.text()
                print(
                    f"API Error {response.status} for {desc.source_file}: {error_text[:500]}"
                )
                return (desc, None)
            result = await response.json()

        status_url = result.get("status_url")
        response_url = result.get("response_url")

        if not status_url or not response_url:
            print(f"Error: Missing status_url or response_url for {desc.source_file}")
            print(f"  Response: {json.dumps(result, indent=2)[:1000]}")
            return (desc, None)

        poll_start = time.time()
        while time.time() - poll_start < FAL_MAX_POLL_TIME:
            async with session.get(
                status_url,
                headers=headers,
                timeout=aiohttp.ClientTimeout(total=10),
            ) as status_response:
                if status_response.status != 200:
                    error_text = await status_response.text()
                    print(
                        f"Status check error {status_response.status} for {desc.source_file}: {error_text[:200]}"
                    )
                    return (desc, None)

                status_result = await status_response.json()
                status = status_result.get("status")

                if status == "COMPLETED":
                    break
                elif status in ("FAILED", "CANCELLED"):
                    print(f"Request {status} for {desc.source_file}")
                    print(f"  Response: {json.dumps(status_result, indent=2)[:500]}")
                    return (desc, None)

                await asyncio.sleep(FAL_POLL_INTERVAL)
        else:
            print(f"Timeout waiting for {desc.source_file} after {FAL_MAX_POLL_TIME}s")
            return (desc, None)

        async with session.get(
            response_url,
            headers=headers,
            timeout=aiohttp.ClientTimeout(total=30),
        ) as result_response:
            if result_response.status != 200:
                error_text = await result_response.text()
                print(
                    f"Result fetch error {result_response.status} for {desc.source_file}: {error_text[:200]}"
                )
                return (desc, None)

            final_result = await result_response.json()

            images = final_result.get("images", [])
            if not images:
                print(f"Error: No images in response for {desc.source_file}")
                print(f"  Response: {json.dumps(final_result, indent=2)[:1000]}")
                return (desc, None)

            image_url = images[0].get("url", "")
            if not image_url:
                print(f"Error: No image URL in response for {desc.source_file}")
                print(f"  Response: {json.dumps(final_result, indent=2)[:1000]}")
                return (desc, None)

            async with session.get(
                image_url, timeout=aiohttp.ClientTimeout(total=30)
            ) as img_response:
                img_response.raise_for_status()
                return (desc, await img_response.read())

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
    headers = {
        "Authorization": f"Key {api_key}",
        "Content-Type": "application/json",
    }

    for i in range(0, len(descriptions), grid_size[0] * grid_size[1]):
        batch = descriptions[i : i + grid_size[0] * grid_size[1]]
        combined_prompt = build_combined_grid_prompt(batch, grid_size)

        max_width = max(d.width for d in batch)
        max_height = max(d.height for d in batch)
        total_width = max_width * grid_size[1]
        total_height = max_height * grid_size[0]
        image_size = calculate_output_config(total_width, total_height)

        payload = {
            "prompt": combined_prompt,
            "image_size": image_size,
            "num_inference_steps": 4,
            "num_images": 1,
        }

        try:
            response = requests.post(
                FAL_API_URL, headers=headers, json=payload, timeout=30
            )
            response.raise_for_status()
            result = response.json()

            status_url = result.get("status_url")
            response_url = result.get("response_url")

            if not status_url or not response_url:
                print(f"Error: Missing status_url or response_url for grid")
                print(f"  Response: {json.dumps(result, indent=2)[:500]}")
                for desc in batch:
                    results.append((desc, None))
                continue

            poll_start = time.time()
            completed = False
            while time.time() - poll_start < FAL_MAX_POLL_TIME:
                status_response = requests.get(status_url, headers=headers, timeout=10)
                if status_response.status_code != 200:
                    print(f"Status check error {status_response.status_code}")
                    break

                status_result = status_response.json()
                status = status_result.get("status")

                if status == "COMPLETED":
                    completed = True
                    break
                elif status in ("FAILED", "CANCELLED"):
                    print(f"Request {status} for grid")
                    break

                time.sleep(FAL_POLL_INTERVAL)

            if not completed:
                for desc in batch:
                    results.append((desc, None))
                continue

            result_response = requests.get(response_url, headers=headers, timeout=30)
            if result_response.status_code != 200:
                print(f"Result fetch error {result_response.status_code}")
                for desc in batch:
                    results.append((desc, None))
                continue

            final_result = result_response.json()
            images = final_result.get("images", [])

            if images:
                image_url = images[0].get("url", "")
                if image_url:
                    img_response = requests.get(image_url, timeout=30)
                    img_response.raise_for_status()
                    image_bytes = img_response.content

                    grid_images = split_grid_image(
                        image_bytes, grid_size, batch[0].width, batch[0].height
                    )
                    for desc, img_bytes in zip(batch, grid_images):
                        results.append((desc, img_bytes))
                    continue

            print(f"Error: No images in grid response")
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
        default=os.environ.get("FAL_KEY"),
        help="fal.ai API key (or set FAL_KEY env var)",
    )
    parser.add_argument(
        "--model",
        "-M",
        default=DEFAULT_MODEL,
        help=f"Model to use (default: {DEFAULT_MODEL}, only flux-schnell supported)",
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
            "Error: API key required. Set FAL_KEY environment variable or use --api-key"
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
