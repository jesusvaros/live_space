#!/usr/bin/env python3
"""Create a deterministic, PII-safe inventory of the legacy backups.

The command only reads its inputs and writes JSON to stdout. ZIP member paths and
database row values are deliberately excluded because they can contain user IDs,
emails, object names, tokens, or other private data.
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import re
import sys
import zipfile
from collections import defaultdict
from pathlib import Path
from typing import BinaryIO, TextIO


COPY_RE = re.compile(r"^COPY (?P<table>[^ ]+) ")
CREATE_TABLE_RE = re.compile(r"^CREATE TABLE (?P<table>[^ (]+)")
SAFE_COUNTS = {
    "public.artists",
    "public.profiles",
    "public.venues",
    "public.videos",
    "storage.buckets",
    "storage.objects",
}


def sha256_stream(stream: BinaryIO) -> str:
    digest = hashlib.sha256()
    while chunk := stream.read(1024 * 1024):
        digest.update(chunk)
    return digest.hexdigest()


def sha256_file(path: Path) -> str:
    with path.open("rb") as stream:
        return sha256_stream(stream)


def inspect_database(path: Path) -> dict[str, object]:
    counts: dict[str, int] = {}
    tables: set[str] = set()
    current_copy: str | None = None

    with gzip.open(path, "rt", encoding="utf-8", errors="replace") as stream:
        for line in stream:
            create_match = CREATE_TABLE_RE.match(line)
            if create_match and create_match.group("table").startswith("public."):
                tables.add(create_match.group("table"))

            copy_match = COPY_RE.match(line)
            if copy_match:
                current_copy = copy_match.group("table")
                if current_copy in SAFE_COUNTS:
                    counts[current_copy] = 0
                continue

            if current_copy is not None:
                if line == "\\.\n":
                    current_copy = None
                elif current_copy in SAFE_COUNTS:
                    counts[current_copy] += 1

    return {
        "filename": path.name,
        "bytes": path.stat().st_size,
        "sha256": sha256_file(path),
        "format": "gzip-compressed PostgreSQL cluster SQL dump",
        "public_tables": sorted(tables),
        "safe_row_counts": dict(sorted(counts.items())),
        "excluded": "All row values and all auth/session/token counts",
    }


def safe_category(member_name: str) -> str:
    """Return only a broad media category, never the full archive path."""
    lowered = member_name.lower()
    if "/event-posters/" in lowered:
        return "event-poster"
    if "/thumbnails/" in lowered:
        return "thumbnail"
    if "/videos/" in lowered:
        return "video"
    if "/images/" in lowered:
        return "image"
    return "other"


def inspect_storage(path: Path) -> dict[str, object]:
    grouped: dict[str, list[dict[str, object]]] = defaultdict(list)
    total_uncompressed = 0

    with zipfile.ZipFile(path) as archive:
        members = [member for member in archive.infolist() if not member.is_dir()]
        for member in members:
            total_uncompressed += member.file_size
            with archive.open(member, "r") as stream:
                content_hash = sha256_stream(stream)
            grouped[content_hash].append(
                {
                    "bytes": member.file_size,
                    "extension": Path(member.filename).suffix.lower() or "none",
                    "category": safe_category(member.filename),
                }
            )

    objects = []
    for content_hash, occurrences in sorted(grouped.items()):
        objects.append(
            {
                "sha256": content_hash,
                "bytes": occurrences[0]["bytes"],
                "occurrences": len(occurrences),
                "extensions": sorted({str(item["extension"]) for item in occurrences}),
                "categories": sorted({str(item["category"]) for item in occurrences}),
            }
        )

    entry_count = sum(item["occurrences"] for item in objects)
    return {
        "filename": path.name,
        "bytes": path.stat().st_size,
        "sha256": sha256_file(path),
        "format": "ZIP",
        "entries": entry_count,
        "uncompressed_bytes": total_uncompressed,
        "unique_contents": len(objects),
        "duplicate_entries": entry_count - len(objects),
        "content_objects": objects,
        "excluded": "ZIP member paths, timestamps, owners, and embedded user IDs",
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", type=Path, required=True, help=".backup.gz file")
    parser.add_argument("--storage", type=Path, required=True, help="storage .zip file")
    parser.add_argument(
        "--check",
        type=Path,
        help="Compare semantically with an existing inventory JSON instead of printing JSON",
    )
    return parser.parse_args()


def validate_file(path: Path, suffix: str) -> None:
    if not path.is_file():
        raise ValueError(f"Input does not exist or is not a file: {path}")
    if not path.name.endswith(suffix):
        raise ValueError(f"Expected a {suffix} file: {path}")


def main() -> int:
    args = parse_args()
    try:
        validate_file(args.database, ".gz")
        validate_file(args.storage, ".zip")
        inventory = {
            "inventory_format": 1,
            "privacy": "No row values, archive paths, emails, tokens, or user identifiers",
            "database": inspect_database(args.database),
            "storage": inspect_storage(args.storage),
        }
        if args.check is not None:
            validate_file(args.check, ".json")
            with args.check.open("r", encoding="utf-8") as stream:
                expected = json.load(stream)
            if inventory != expected:
                print(f"inventory mismatch: {args.check}", file=sys.stderr)
                return 2
            print(f"inventory matches: {args.check}")
            return 0
    except (OSError, ValueError, json.JSONDecodeError, zipfile.BadZipFile, gzip.BadGzipFile) as error:
        print(f"inventory failed: {error}", file=sys.stderr)
        return 1

    json.dump(inventory, sys.stdout, ensure_ascii=False, indent=2, sort_keys=True)
    print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
