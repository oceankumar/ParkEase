#!/usr/bin/env python3
"""Measure CP3 queries in an EMPTY, DISPOSABLE PostgreSQL database (stdlib only)."""
import argparse
import hashlib
import json
import platform
import re
import statistics
import subprocess
from pathlib import Path

HERE = Path(__file__).resolve().parent
DBMS = HERE.parent


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dsn', required=True, help='libpq database name or connection URI')
    args = parser.parse_args()

    def psql(sql):
        result = subprocess.run(
            ['psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-d', args.dsn],
            input=sql, text=True, capture_output=True, check=True)
        return result.stdout.strip()

    # Refuse to add fixtures/indexes to a database containing application tables.
    occupied = psql("SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace "
                    "WHERE c.relkind IN ('r','p') AND n.nspname NOT IN ('pg_catalog','information_schema') "
                    "AND n.nspname NOT LIKE 'pg_toast%';")
    if occupied != '0':
        parser.error('Database is not empty. Create a new disposable database for this benchmark.')
    version = psql('SELECT version();')
    psql((DBMS / '03_schema.sql').read_text())
    psql((HERE / 'seed.sql').read_text())
    portfolio = (DBMS / '04_queries.sql').read_text()
    definitions, examples = portfolio.split('-- Sample executions', 1)
    calls = re.findall(r'EXECUTE\s+pe_q\d+\b.*?;', examples, flags=re.S)
    assert len(calls) == 12
    settings = "SET TIME ZONE 'Asia/Kolkata'; SET jit = off; SET plan_cache_mode = force_custom_plan;\n"
    counts = json.loads(psql("""SELECT json_build_object(
      'users', (SELECT count(*) FROM users), 'malls', (SELECT count(*) FROM malls),
      'parking_floors', (SELECT count(*) FROM parking_floors),
      'parking_rows', (SELECT count(*) FROM parking_rows),
      'parking_slots', (SELECT count(*) FROM parking_slots),
      'bookings', (SELECT count(*) FROM bookings),
      'confirmed_bookings', (SELECT count(*) FROM bookings WHERE status='CONFIRMED'),
      'guard_assignments', (SELECT count(*) FROM guard_assignments),
      'qr_tokens', (SELECT count(*) FROM qr_tokens));"""))
    summary = {'postgresql': version, 'platform': platform.platform(), 'rows': counts,
               'runs': 5, 'warmups': 1, 'settings': settings.strip(), 'queries': {}}
    results = {}
    for phase in ('before', 'after'):
        if phase == 'after':
            psql((HERE / 'indexes.sql').read_text())
        results[phase] = []
        for number, call in enumerate(calls, 1):
            qid = f'Q{number:02}'
            # Every phase uses a fresh session but identical settings and query parameters.
            result = psql(settings + definitions + call)
            results[phase].append(result)
            explain = 'EXPLAIN (ANALYZE, BUFFERS, SETTINGS, FORMAT JSON) ' + call
            raw = psql(settings + definitions + '\n' + '\n'.join([explain] * 6))
            decoder = json.JSONDecoder()
            plans = []
            while raw.strip():
                raw = raw.lstrip()
                value, end = decoder.raw_decode(raw)
                plans.append(value)
                raw = raw[end:]
            assert len(plans) == 6
            measured = plans[1:]
            times = [p[0]['Execution Time'] for p in measured]
            median = statistics.median(times)
            representative = measured[times.index(median)]
            (HERE / f'{qid.lower()}_{phase}.json').write_text(json.dumps(representative, indent=2) + '\n')
            entry = summary['queries'].setdefault(qid, {'execute': call})
            entry[phase] = {
                'execution_ms': times, 'median_execution_ms': median,
                'planning_ms': [p[0]['Planning Time'] for p in measured],
                'result_rows': representative[0]['Plan']['Actual Rows'],
                'result_sha256': hashlib.sha256(result.encode()).hexdigest(),
            }
            print(f'{phase} {qid}: {median:.3f} ms', flush=True)
    assert results['before'] == results['after'], 'Index changes altered query results'
    expected_rows = {'Q01': 4, 'Q02': 40, 'Q03': 20, 'Q04': 200, 'Q05': 40,
                     'Q06': 1, 'Q08': 38, 'Q09': 40, 'Q10': 40, 'Q11': 1}
    for qid, expected in expected_rows.items():
        assert summary['queries'][qid]['before']['result_rows'] == expected, (qid, expected)
    # Semantic checks: adjacent windows, cancellation, invalid windows, zero-inventory malls.
    assert psql(settings + definitions + "EXECUTE pe_q02('00000000-0000-0000-0000-000000020001', 'CAR', '2026-11-10 12:00+05:30', '2026-11-10 14:00+05:30');").count('\n') + 1 == 160
    assert psql(settings + definitions + "EXECUTE pe_q02('00000000-0000-0000-0000-000000020001', 'CAR', '2026-11-10 12:00+05:30', '2026-11-10 10:00+05:30');") == ''
    # Transaction rolls back the edge-case fixture after observing the zero counts.
    zero = psql(settings + definitions + """BEGIN;
      INSERT INTO malls (id, owner_id, name, city, address, hourly_rate_paise, status)
      VALUES ('00000000-0000-0000-0000-000000029999',
              '00000000-0000-0000-0000-000000000002', 'Zero inventory', 'Delhi', 'Test', 0, 'APPROVED');
      EXECUTE pe_q05; ROLLBACK;""")
    assert '00000000-0000-0000-0000-000000029999|Zero inventory|0|0|0' in zero
    summary['validation'] = ['12 queries executed successfully', 'Before/after results identical',
                             'Expected result row counts matched', 'Adjacent windows remain available',
                             'Cancelled bookings release bays', 'Invalid windows return no bays',
                             'Zero-inventory mall retained with zero counts']
    (HERE / 'summary.json').write_text(json.dumps(summary, indent=2) + '\n')
    rows = []
    for qid, entry in summary['queries'].items():
        before = entry['before']['median_execution_ms']
        after = entry['after']['median_execution_ms']
        rows.append(f"| {qid} | {entry['before']['result_rows']} | {before:.3f} | {after:.3f} | {before / after:.2f}× |")
    (HERE / 'timings_table.md').write_text(
        '| Query | Result rows | Before (ms) | After (ms) | Before / after |\n'
        '| --- | ---: | ---: | ---: | ---: |\n' + '\n'.join(rows) + '\n')
    print('Saved 24 plans, summary.json and timings_table.md; semantic checks passed.')


if __name__ == '__main__':
    main()
