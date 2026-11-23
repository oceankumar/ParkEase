# CP4 execution-plan evidence

See [05_query_timings.md](../05_query_timings.md) for the measured results,
query catalogue, methodology, index analysis and reproduction instructions.

- `q01_before.json` … `q12_before.json`: baseline `EXPLAIN (ANALYZE, BUFFERS,
  SETTINGS, FORMAT JSON)` with all indexes from `03_schema.sql`.
- `q01_after.json` … `q12_after.json`: same queries/data after `indexes.sql`.
- `summary.json`: actual engine/environment, fixture sizes, query calls, all five
  samples per phase, planning times, result hashes, counts and validation checks.
- `timings_table.md`: generated median timing comparison.
- `seed.sql`: deterministic synthetic fixture for an empty academic schema.
- `indexes.sql`: three candidate indexes evaluated together; Q06's index is the
  demonstrated improvement. The other two remain for experiment reproducibility.
- `benchmark.py`: Python standard-library runner using `psql`; requires an empty
  disposable database and writes evidence into this directory.
- `run_local.sh`: creates a temporary isolated cluster, runs the experiment and
  removes the cluster on exit. Requires PostgreSQL 17 tools and Python 3.

Each JSON file contains a real measured plan at the median of five runs.
Do not substitute optimizer estimates for measured execution times.
