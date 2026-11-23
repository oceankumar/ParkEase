# CP4 — ParkEase query timings and execution plans

## Scope

Measured on **23 November 2026 (IST)** using the twelve CP3 queries in
[04_queries.sql](04_queries.sql), against [03_schema.sql](03_schema.sql).
These are PostgreSQL academic submission results. The running MERN application
uses MongoDB; these measurements do not describe its API performance.
The repository supplied no separate CP3/CP4 rubric, so this submission includes a
query portfolio, deterministic data, before/after plans, timings and analysis.

## CP3 query catalogue

| ID | ParkEase use case | SQL concepts |
| --- | --- | --- |
| Q01 | Approved mall discovery by city and budget | Filtering, ordering, parameters |
| Q02 | Available bays for a booking window | Multi-table join, correlated NOT EXISTS, range overlap |
| Q03 | Driver booking history | Joins, descending ordering, LIMIT |
| Q04 | Mall reservation register | Four-table join, half-open date bounds |
| Q05 | Published and maintenance inventory | LEFT JOIN, GROUP BY, aggregate FILTER |
| Q06 | Daily confirmed reservation value | IST date grouping, SUM, COUNT |
| Q07 | Repeat drivers | GROUP BY, HAVING |
| Q08 | Malls without an active guard | Correlated NOT EXISTS |
| Q09 | Mall ranking by reservation value | CTE, LEFT JOIN, DENSE_RANK |
| Q10 | Cancellation rates | Conditional counts, NULLIF, percentage arithmetic |
| Q11 | Guard-scoped QR credential lookup | Unique hash lookup, joins, EXISTS |
| Q12 | Malls priced above average | Scalar aggregate subquery |

Queries use only columns and statuses present in the relational schema.
`CONFIRMED` bookings block half-open `[start, end)` intervals; cancellation releases
that interval. Retired/maintenance bays are excluded from Q02. Reversed or empty
query windows return no bays. Financial totals are **quoted reservation value in
paise**, not collected payments or actual-time bills. Q11 is a read-only academic
credential lookup, not a replacement for the runtime entry/exit transaction.

## Environment and method

- PostgreSQL **17.10 (Homebrew)**, Apple Silicon / macOS; full engine and OS strings
  are recorded in [summary.json](plans/summary.json).
- Isolated temporary local cluster, default PostgreSQL configuration, UTF-8 and
  `--no-locale`; `btree_gist` installed by the base schema.
- Session settings: `TimeZone = Asia/Kolkata`, `jit = off`,
  `plan_cache_mode = force_custom_plan`. Custom plans use the sample parameters
  rather than mixing in PostgreSQL's automatic generic-plan selection.
- Deterministic synthetic data from [seed.sql](plans/seed.sql): 2,003 users,
  40 malls, 80 floors, 400 rows, 8,000 bays, **96,000 bookings** (76,800 confirmed),
  two guard assignments and 160 QR credentials. Twelve daily two-hour windows per
  bay start on 1 November 2026; 20% of bookings are cancelled. All malls share a
  demo owner; this is a controlled fixture rather than a production distribution.
- Baseline includes **every index and constraint in 03_schema.sql**, including the
  GiST exclusion index and existing driver/slot lookup indexes.
- Baseline and optimized phases use the same rows and sample parameters. The
  optimized phase adds only [indexes.sql](plans/indexes.sql), then runs `ANALYZE`.
- Each query/phase gets one untimed result execution for equivalence checking,
  followed by one excluded EXPLAIN warm-up and five measured executions in one
  session. Reported time is the **median PostgreSQL Execution Time**, excluding
  planning, connection setup, network transfer and result rendering.
- Each saved JSON plan is the measured execution at that median. All five timing
  samples, planning times, result row counts and result fingerprints are retained
  in `summary.json`. Buffer counts belong to that saved representative run.

## Results

A ratio greater than 1 means the optimized phase was faster. Sub-millisecond
ratios are especially sensitive to noise and are not evidence of an index win.

| Query | Result rows | Before (ms) | After (ms) | Before / after |
| --- | ---: | ---: | ---: | ---: |
| Q01 | 4 | 0.007 | 0.007 | 1.00× |
| Q02 | 40 | 0.340 | 0.341 | 1.00× |
| Q03 | 20 | 0.040 | 0.043 | 0.93× |
| Q04 | 200 | 0.406 | 0.928 | 0.44× |
| Q05 | 40 | 1.853 | 1.937 | 0.96× |
| Q06 | 1 | 5.539 | 1.574 | 3.52× |
| Q07 | 1200 | 15.842 | 15.789 | 1.00× |
| Q08 | 38 | 0.026 | 0.025 | 1.04× |
| Q09 | 40 | 23.578 | 23.631 | 1.00× |
| Q10 | 40 | 28.090 | 28.162 | 1.00× |
| Q11 | 1 | 0.026 | 0.022 | 1.18× |
| Q12 | 20 | 0.020 | 0.014 | 1.43× |

The generated table is also available as [timings_table.md](plans/timings_table.md).
All twelve before/after result sets matched byte-for-byte.

## Plan interpretation and index evaluation

### Q06: useful partial covering index

Before: [q06_before.json](plans/q06_before.json) scans all bookings sequentially,
filters by confirmed status and arrival time, then aggregates by IST day. The plan
returns 6,400 matching bookings to the aggregate, touching 1,847 shared buffer blocks.

After: [q06_after.json](plans/q06_after.json) uses
`cp4_bookings_confirmed_start_idx`, a B-tree on `start_time` restricted to
`status = 'CONFIRMED'`, with `total_amount_paise` included for the aggregate.
The index-only scan touches 183 shared buffer blocks. Execution falls from
**5.539 ms to 1.574 ms (3.52×)**. Index-only scans can still fetch heap pages when
visibility information requires it; the saved plan records the actual heap fetches.

### Q01: small relation favors a sequential scan

The candidate partial index on `(city, hourly_rate_paise, id)` matches discovery
filters and ordering. Both [before](plans/q01_before.json) and
[after](plans/q01_after.json) plans choose a sequential scan plus sort: the mall
relation contains only 40 rows and touches one shared buffer block. Timing is
0.007 ms in both phases. This fixture does not justify retaining that index for
performance; test a larger mall catalogue before adopting it.

### Q04: existing bay index remains preferred

The candidate `(slot_id, start_time)` index could combine bay equality and an
arrival range. On this fixture, both [before](plans/q04_before.json) and
[after](plans/q04_after.json) plans keep nested loops with `bookings_slot_idx`.
Each bay has only twelve bookings, so scanning its short history is cheap.
Both representative plans touch 3,421 shared buffer blocks. The measured median
rises from 0.406 to 0.928 ms despite the same plan structure. This run shows no
benefit from the candidate index; the slowdown cannot be attributed to a new access
path. More interleaved repetitions would be needed to separate timing variation
from a reproducible effect.

### Remaining queries

Q02 uses the existing `bookings_slot_idx` to check each bay's short history; the
GiST exclusion index still enforces the no-overlap constraint, but is not the chosen
lookup path here. Q03 uses the existing driver/start index. Q11 scans the small QR
relation and uses primary-key indexes for booking, bay, floor and guard lookups;
the unique QR hash index is available but is not selected in this fixture.
Whole-dataset ranking and cancellation summaries (Q09,
Q10) continue to require substantial joins and aggregation; the three candidate
indexes are not designed to remove that work. Small timing changes without an
access-path change should not be described as optimizations.

**Recommendation:** retain the Q06 partial covering index for this demonstrated
reporting workload. Treat the discovery and composite booking indexes as evaluated
candidates, not proven improvements. `indexes.sql` deliberately retains all three
so the submitted comparison can be reproduced. Extra indexes consume space and
add write maintenance costs; this experiment measures reads only.

## Reproduce and validate

Requires PostgreSQL 17 server/client tools with `btree_gist`, Python 3, and a Unix
shell. Run from the repository root as a regular user:

```sh
sh dbms/plans/run_local.sh
```

The runner uses `pg_config --bindir`; to select Homebrew PostgreSQL 17 explicitly:

```sh
PG_BIN=/opt/homebrew/opt/postgresql@17/bin sh dbms/plans/run_local.sh
```

This starts an isolated cluster using a private temporary Unix socket directory,
with TCP disabled. It creates the schema and fixture, executes CP3, saves 24 JSON
plans and timing evidence, checks results, then stops and removes the cluster.
It never reads application credentials or connects to MongoDB. A failed run exits
nonzero. Output artifacts overwrite the previous benchmark; update this report's
table and interpretation from the regenerated evidence if measuring again.

Alternatively, create a new empty disposable PostgreSQL database and run:

```sh
createdb parkease_cp4
python3 dbms/plans/benchmark.py --dsn 'dbname=parkease_cp4'
```

This alternative leaves the fixture database in place for inspection. The benchmark
refuses a database containing user tables; it does not drop existing tables.
To execute the CP3 portfolio independently, use another empty database, then:

```sh
psql -X -v ON_ERROR_STOP=1 -d parkease_dbms -f dbms/03_schema.sql
psql -X -v ON_ERROR_STOP=1 -d parkease_dbms -f dbms/plans/seed.sql
psql -X -v ON_ERROR_STOP=1 -d parkease_dbms -f dbms/04_queries.sql
```

Validation passed for all twelve queries, before/after result equivalence,
expected result counts, adjacent non-overlapping bookings, cancelled bookings
releasing bays, invalid windows returning no rows, and zero-inventory malls being
retained with zero counts. Results are warm-cache, single-client local measurements;
they do not establish production concurrency performance or statistical significance.
