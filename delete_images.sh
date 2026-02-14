#!/bin/bash
# Delete all PNG images from the images folder
# WARNING: This is irreversible! Run persist_image_sizes.py first!
#
# Usage: ./delete_images.sh [--confirm]
#
# The --confirm flag is required to actually delete files.
# Without it, the script will only show what would be deleted.

IMAGES_DIR="images"

if [ "$1" != "--confirm" ]; then
    echo "DRY RUN - No files will be deleted"
    echo "=================================="
    find "$IMAGES_DIR" -name "*.png" -type f | wc -l | xargs echo "Would delete:"
    echo ""
    echo "To actually delete, run: $0 --confirm"
    exit 0
fi

echo "Deleting all PNG files in $IMAGES_DIR..."
find "$IMAGES_DIR" -name "*.png" -type f -delete
echo "Done. JSON files preserved."
