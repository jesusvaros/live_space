#!/usr/bin/env python3
"""Extract one quarantined copy per audited content hash.

The output filenames are checksums, never legacy object paths or user IDs. The
script refuses archives whose hash or content set differs from the committed
PII-safe inventory and is safe to run repeatedly.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import tempfile
import zipfile
from pathlib import Path


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        while chunk := stream.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--storage", required=True, type=Path)
    parser.add_argument("--inventory", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    inventory = json.loads(args.inventory.read_text(encoding="utf-8"))
    storage_inventory = inventory["storage"]
    expected_archive_hash = storage_inventory["sha256"]
    actual_archive_hash = sha256_file(args.storage)
    if actual_archive_hash != expected_archive_hash:
        raise SystemExit("storage archive checksum mismatch")

    expected = {
        item["sha256"]: {
            "bytes": item["bytes"],
            "extensions": item["extensions"],
        }
        for item in storage_inventory["content_objects"]
    }
    args.output.mkdir(parents=True, exist_ok=True, mode=0o700)
    extracted: set[str] = set()
    observed: set[str] = set()

    with zipfile.ZipFile(args.storage) as archive:
        for member in archive.infolist():
            if member.is_dir():
                continue

            digest = hashlib.sha256()
            suffix = Path(member.filename).suffix.lower() or ".bin"
            with tempfile.NamedTemporaryFile(dir=args.output, delete=False) as temporary:
                temporary_path = Path(temporary.name)
                with archive.open(member) as source:
                    while chunk := source.read(1024 * 1024):
                        digest.update(chunk)
                        temporary.write(chunk)

            checksum = digest.hexdigest()
            observed.add(checksum)
            expected_item = expected.get(checksum)
            if expected_item is None:
                temporary_path.unlink(missing_ok=True)
                raise SystemExit("archive contains an unaudited content hash")
            if member.file_size != expected_item["bytes"]:
                temporary_path.unlink(missing_ok=True)
                raise SystemExit("audited content size mismatch")
            if suffix not in expected_item["extensions"]:
                temporary_path.unlink(missing_ok=True)
                raise SystemExit("audited content extension mismatch")

            destination = args.output / f"{checksum}{suffix}"
            if checksum in extracted or destination.exists():
                temporary_path.unlink(missing_ok=True)
                if not destination.exists() or sha256_file(destination) != checksum:
                    raise SystemExit("existing quarantine file checksum mismatch")
                extracted.add(checksum)
                continue

            shutil.move(str(temporary_path), destination)
            os.chmod(destination, 0o600)
            extracted.add(checksum)

    missing = set(expected) - observed
    if missing or observed != set(expected):
        raise SystemExit("archive content set does not match the audited inventory")

    manifest = {
        "archive_sha256": actual_archive_hash,
        "unique_files": len(extracted),
        "checksums": sorted(extracted),
    }
    print(json.dumps(manifest, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
