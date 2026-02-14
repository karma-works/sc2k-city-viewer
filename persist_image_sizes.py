#!/usr/bin/env python3
"""
Persist the sizes of all original images to a JSON file.
Run this BEFORE deleting the original images.
"""

import json
from pathlib import Path
from PIL import Image

IMAGES_DIR = Path("images")
OUTPUT_FILE = IMAGES_DIR / "image_sizes.json"


def get_all_image_sizes():
    sizes = {}

    for img_path in IMAGES_DIR.rglob("*.png"):
        if img_path.name.startswith("."):
            continue

        try:
            with Image.open(img_path) as img:
                rel_path = img_path.relative_to(IMAGES_DIR)
                sizes[str(rel_path)] = {"width": img.width, "height": img.height}
        except Exception as e:
            print(f"Warning: Could not read {img_path}: {e}")

    return sizes


def main():
    print(f"Scanning images in {IMAGES_DIR}...")
    sizes = get_all_image_sizes()

    print(f"Found {len(sizes)} images")

    with open(OUTPUT_FILE, "w") as f:
        json.dump(sizes, f, indent=2, sort_keys=True)

    print(f"Saved sizes to {OUTPUT_FILE}")

    width_counts = {}
    height_counts = {}
    for data in sizes.values():
        w, h = data["width"], data["height"]
        width_counts[w] = width_counts.get(w, 0) + 1
        height_counts[h] = height_counts.get(h, 0) + 1

    print("\nWidth distribution:")
    for w in sorted(width_counts.keys()):
        print(f"  {w}px: {width_counts[w]} images")

    print("\nHeight distribution:")
    for h in sorted(height_counts.keys()):
        print(f"  {h}px: {height_counts[h]} images")


if __name__ == "__main__":
    main()
