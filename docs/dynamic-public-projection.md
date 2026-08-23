# Dynamic delayed WDW public projection

The website now supports an immutable public snapshot stream with a hard,
server-enforced 24-hour delay. The producer uploads a sanitized snapshot
immediately; the public API returns only the newest verified eligible snapshot.
The Rooms page fetches that aggregate data at runtime and retains its local
privacy-safe fixture if the service is unavailable.

## Data flow

1. Private WDW refresh completes.
2. The WDW producer creates an allowlisted snapshot and POSTs it to
   `/api/wdw/projection/ingest`.
3. The ingest route independently validates the schema, hashes, and exact
   24-hour delay before inserting an immutable row.
4. `/api/wdw/projection` scans newest-first and returns the latest verified row
   whose `eligible_at` is no later than database time.
5. If newer rows are malformed, the reader continues until it finds the
   last-known-good eligible snapshot.

There is no public snapshot-by-ID endpoint and no listing endpoint.

## Database setup

Apply `website/db/migrations/001_wdw_public_snapshots.sql` with a migration
administrator. Then use separate least-privilege database roles for the two
routes. The exact role-management syntax can vary by hosted Postgres provider;
the effective grants should be equivalent to:

```sql
REVOKE ALL ON TABLE public.wdw_public_snapshots FROM PUBLIC;

GRANT USAGE ON SCHEMA public TO wdw_public_writer;
GRANT INSERT ON TABLE public.wdw_public_snapshots TO wdw_public_writer;
GRANT SELECT (snapshot_id) ON TABLE public.wdw_public_snapshots TO wdw_public_writer;

GRANT USAGE ON SCHEMA public TO wdw_public_reader;
GRANT SELECT ON TABLE public.wdw_public_snapshots TO wdw_public_reader;

REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public.wdw_public_snapshots
  FROM wdw_public_writer, wdw_public_reader;
```

The migration adds a trigger that rejects updates and deletes. Keep migration
and schema-creation privileges out of both runtime roles.

## Runtime configuration

Set these server-only environment variables in the website environment:

- `WDW_PUBLIC_WRITE_DATABASE_URL`: connection for the insert-only writer role.
- `WDW_PUBLIC_READ_DATABASE_URL`: connection for the read-only reader role.
- `WDW_PUBLIC_INGEST_TOKEN`: a dedicated high-entropy token shared only with
  the producer.

Set the producer's `WDW_PUBLIC_INGEST_URL` to the deployed ingest route and its
`WDW_PUBLIC_INGEST_TOKEN` to the same token. Never expose any of these variables
with a `NEXT_PUBLIC_` prefix.

## Commissioning checklist

Keep the existing public path active while commissioning this path in shadow:

- Apply the migration and grants in a non-production environment.
- Confirm writer credentials cannot select payloads, update, or delete.
- Confirm reader credentials cannot insert, update, or delete.
- Publish several producer snapshots and safely replay one snapshot.
- Confirm a snapshot is unavailable at 23:59 and available at exactly 24:00.
- Insert or simulate a malformed newer stored envelope and confirm the reader
  continues to the last-known-good eligible snapshot.
- Confirm `/api/wdw/projection/health` reports a recent eligible snapshot.
- Confirm the Rooms page keeps its fixture and emits no client error if the API
  or database is unavailable.
- Observe at least one full delay window and the expected producer cadence.
- Cut over monitoring and traffic only after the above evidence is captured.

## Rollback

Disable the producer invocation and restore the previous website deployment or
feature path. Leave the append-only snapshot table intact for diagnosis; it is
not necessary to delete rows. Because the legacy path remains active during
shadow commissioning, rollback does not require reconstructing public data.
