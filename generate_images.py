#!/usr/bin/env python3
"""Generate images from JSON descriptions using fal.ai API (Flux.1 Schnell)."""

import os
import sys
import json
import argparse
import io
import time
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

FAL_API_URL = "https://queue.fal.run/fal-ai/flux/schnell"
FAL_POLL_INTERVAL = 5.0
FAL_MAX_POLL_TIME = 300
DEFAULT_MODEL = "flux-schnell"
IMAGE_SIZES_FILE = Path("images/image_sizes.json")
REQUEST_QUEUE_FILE = Path("images/.request_queue.json")
MAX_PENDING_REQUESTS = 10

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
class PendingRequest:
    status_url: str
    response_url: str
    source_file: str
    keywords: list[str]
    asset_type: str
    width: int
    height: int
    json_path: str
    submitted_at: float


def load_image_sizes() -> dict:
    if IMAGE_SIZES_FILE.exists():
        with open(IMAGE_SIZES_FILE, "r") as f:
            return json.load(f)
    return {}


def load_request_queue() -> list[PendingRequest]:
    if REQUEST_QUEUE_FILE.exists():
        with open(REQUEST_QUEUE_FILE, "r") as f:
            data = json.load(f)
            return [PendingRequest(**item) for item in data]
    return []


def save_request_queue(queue: list[PendingRequest]) -> None:
    with open(REQUEST_QUEUE_FILE, "w") as f:
        json.dump(
            [
                {
                    "status_url": r.status_url,
                    "response_url": r.response_url,
                    "source_file": r.source_file,
                    "keywords": r.keywords,
                    "asset_type": r.asset_type,
                    "width": r.width,
                    "height": r.height,
                    "json_path": r.json_path,
                    "submitted_at": r.submitted_at,
                }
                for r in queue
            ],
            f,
            indent=2,
        )


def add_pending_request(request: PendingRequest) -> None:
    queue = load_request_queue()
    queue.append(request)
    save_request_queue(queue)


def remove_pending_request(status_url: str) -> None:
    queue = load_request_queue()
    queue = [r for r in queue if r.status_url != status_url]
    save_request_queue(queue)


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


def submit_request(api_key: str, desc: AssetDescription) -> Optional[PendingRequest]:
    keywords_str = ", ".join(desc.keywords)
    prompt = build_sc2k_prompt(keywords_str, desc.asset_type, desc.width, desc.height)

    payload = {
        "prompt": prompt,
        "image_size": {"width": desc.width, "height": desc.height},
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
            print(f"Error: Missing status_url or response_url for {desc.source_file}")
            return None

        return PendingRequest(
            status_url=status_url,
            response_url=response_url,
            source_file=desc.source_file,
            keywords=desc.keywords,
            asset_type=desc.asset_type,
            width=desc.width,
            height=desc.height,
            json_path=str(desc.json_path),
            submitted_at=time.time(),
        )
    except Exception as e:
        print(f"Error submitting {desc.source_file}: {e}")
        return None


def fetch_completed_image(api_key: str, request: PendingRequest) -> Optional[bytes]:
    headers = {"Authorization": f"Key {api_key}", "Content-Type": "application/json"}

    try:
        status_response = requests.get(request.status_url, headers=headers, timeout=10)
        if status_response.status_code != 200:
            return None

        status_result = status_response.json()
        status = status_result.get("status")

        if status != "COMPLETED":
            return None

        result_response = requests.get(
            request.response_url, headers=headers, timeout=30
        )
        if result_response.status_code != 200:
            return None

        final_result = result_response.json()
        images = final_result.get("images", [])

        if not images:
            return None

        image_url = images[0].get("url", "")
        if not image_url:
            return None

        img_response = requests.get(image_url, timeout=30)
        img_response.raise_for_status()
        return img_response.content

    except Exception as e:
        print(f"Error fetching {request.source_file}: {e}")
        return None


def run_queue_processor(
    api_key: str,
    descriptions: list[AssetDescription],
    output_dir: Optional[Path],
) -> tuple[int, int]:
    saved = 0
    errors = 0
    pending_queue = load_request_queue()

    print(f"Resuming with {len(pending_queue)} pending requests from queue")

    desc_index = 0
    total_descs = len(descriptions)

    while desc_index < total_descs or pending_queue:
        while len(pending_queue) < MAX_PENDING_REQUESTS and desc_index < total_descs:
            desc = descriptions[desc_index]
            output_path = get_output_path(desc, output_dir)

            if output_path.exists():
                desc_index += 1
                continue

            print(f"[{desc_index + 1}/{total_descs}] Submitting: {desc.source_file}")
            request = submit_request(api_key, desc)

            if request:
                pending_queue.append(request)
                add_pending_request(request)
                print(f"  Queued ({len(pending_queue)}/{MAX_PENDING_REQUESTS} pending)")
            else:
                errors += 1

            desc_index += 1

        if not pending_queue:
            continue

        print(f"Polling {len(pending_queue)} pending requests...")
        time.sleep(FAL_POLL_INTERVAL)

        completed = []
        for request in pending_queue:
            elapsed = time.time() - request.submitted_at
            if elapsed > FAL_MAX_POLL_TIME:
                print(f"  Timeout: {request.source_file} ({elapsed:.0f}s)")
                completed.append(request)
                errors += 1
                continue

            image_bytes = fetch_completed_image(api_key, request)

            if image_bytes:
                output_path = (
                    output_dir / request.source_file
                    if output_dir
                    else Path(request.json_path).parent / request.source_file
                )
                output_path.parent.mkdir(parents=True, exist_ok=True)

                try:
                    img = Image.open(io.BytesIO(image_bytes))
                    if img.mode != "RGBA":
                        img = img.convert("RGBA")
                    img.save(output_path, "PNG")
                    saved += 1
                    print(f"  ✓ Saved: {output_path}")
                    completed.append(request)
                except Exception as e:
                    print(f"  ✗ Save error {request.source_file}: {e}")
                    errors += 1
                    completed.append(request)

        for request in completed:
            pending_queue.remove(request)
            remove_pending_request(request.status_url)

    if REQUEST_QUEUE_FILE.exists():
        REQUEST_QUEUE_FILE.unlink()

    return saved, errors


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
        "--clear-queue",
        action="store_true",
        help="Clear pending request queue before starting",
    )
    args = parser.parse_args()

    if not args.api_key:
        print(
            "Error: API key required. Set FAL_KEY environment variable or use --api-key"
        )
        sys.exit(1)

    if args.clear_queue and REQUEST_QUEUE_FILE.exists():
        REQUEST_QUEUE_FILE.unlink()
        print("Cleared pending request queue")

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
        pending = load_request_queue()
        if not pending:
            print("No images to generate")
            return
        print(f"Processing {len(pending)} pending requests from queue")

    print(
        f"Using queue mode (max {MAX_PENDING_REQUESTS} pending, poll every {FAL_POLL_INTERVAL}s)"
    )

    saved, errors = run_queue_processor(args.api_key, to_process, output_dir)

    print(f"\n{'=' * 50}")
    print(f"Completed: {saved} saved, {skipped} skipped, {errors} errors")


if __name__ == "__main__":
    main()
