# Recovery tooling

These utilities are deliberately independent from production migrations.

## Rebuild the safe inventory

The inventory command reads both archives in place, streams content for hashing,
and prints deterministic JSON. It never extracts files and never prints database
rows or ZIP member paths.

```bash
python3 tools/recovery/inventory.py \
  --database /path/to/db_cluster.backup.gz \
  --storage /path/to/project.storage.zip \
  --check docs/recovery/inventory-2026-07-17.json
```

Any filename, hash, content classification or count difference means the input is
not the audited backup.

## Build the local selective snapshot

1. Restore the full cluster dump only into a disposable, isolated PostgreSQL
   instance with no public network listener.
2. Connect to the restored `postgres` database and run:

```bash
psql --set ON_ERROR_STOP=1 "$ISOLATED_RECOVERY_DATABASE_URL" \
  --file tools/recovery/selective_snapshot.sql
```

3. Review `recovery_export.artist_candidates` and
   `recovery_export.venue_candidates` manually.
4. Keep every `*_quarantine` table local. Do not copy it to the new project.
5. Export only reviewed catalog candidates to a temporary encrypted directory,
   import them through versioned application migrations, reconcile counts, and
   destroy the disposable database and temporary exports.

The SQL intentionally fails if the audited legacy counts change. It never
selects from any table in the `auth` schema.

## Extract the audited unique media set

This command creates exactly one local quarantined file per audited checksum.
It never reuses legacy object paths and refuses any archive drift:

```bash
python3 tools/recovery/extract_unique_media.py \
  --storage /path/to/project.storage.zip \
  --inventory docs/recovery/inventory-2026-07-17.json \
  --output recovery-work/quarantine
```

Running it twice must return the same eight checksums without producing another
copy. The output directory is ignored by Git and remains private until ownership,
event association and license are approved.
