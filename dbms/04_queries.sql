-- CP3: ParkEase query portfolio. PostgreSQL 17; run after 03_schema.sql.
-- psql -X -v ON_ERROR_STOP=1 -d parkease_dbms -f dbms/04_queries.sql
-- Uses the academic relational schema, not the application's MongoDB models.
-- Amounts are paise; timestamps carry an explicit IST offset. All queries are read-only.
-- PREPARE keeps inputs typed and reusable. Run once per fresh session.

-- Q01: Discover approved malls in a city within a driver's hourly budget.
PREPARE pe_q01(text, integer) AS
SELECT id, name, city, address, hourly_rate_paise,
       opening_time, closing_time
FROM malls
WHERE city = $1 AND status = 'APPROVED' AND hourly_rate_paise <= $2
ORDER BY hourly_rate_paise, id;

-- Q02: Find usable CAR/BIKE bays for a requested half-open time window.
-- Adjacent bookings do not overlap; cancelled bookings do not block a bay.
-- Caller must also validate mall hours and driver eligibility before booking.
PREPARE pe_q02(uuid, text, timestamptz, timestamptz) AS
SELECT s.id, f.name AS floor_name, s.slot_code, s.is_accessible, s.is_electric
FROM parking_slots s
JOIN parking_floors f ON f.id = s.floor_id
JOIN malls m ON m.id = f.mall_id
WHERE m.id = $1 AND m.status = 'APPROVED'
  AND s.vehicle_type = $2 AND s.status = 'AVAILABLE' AND s.retired_at IS NULL
  AND $4 > $3
  AND NOT EXISTS (
      SELECT 1 FROM bookings b
      WHERE b.slot_id = s.id AND b.status = 'CONFIRMED'
        AND tstzrange(b.start_time, b.end_time, '[)') && tstzrange($3, greatest($3, $4), '[)')
  )
ORDER BY f.display_order, s.row_number, s.position;

-- Q03: Driver's recent reservations with bay, mall and quoted amount.
PREPARE pe_q03(uuid) AS
SELECT b.id, m.name AS mall_name, f.name AS floor_name, s.slot_code,
       b.vehicle_number, b.start_time, b.end_time, b.status,
       b.total_amount_paise
FROM bookings b
JOIN parking_slots s ON s.id = b.slot_id
JOIN parking_floors f ON f.id = s.floor_id
JOIN malls m ON m.id = f.mall_id
WHERE b.driver_id = $1
ORDER BY b.start_time DESC, b.id
LIMIT 20;

-- Q04: Owner's reservation register for one mall and arrival date range.
-- Half-open timestamp bounds avoid applying a function to the indexed column.
PREPARE pe_q04(uuid, timestamptz, timestamptz) AS
SELECT b.id, u.name AS driver_name, b.vehicle_number, s.slot_code,
       b.start_time, b.end_time, b.status, b.total_amount_paise
FROM parking_floors f
JOIN parking_slots s ON s.floor_id = f.id
JOIN bookings b ON b.slot_id = s.id
JOIN users u ON u.id = b.driver_id
WHERE f.mall_id = $1 AND b.start_time >= $2 AND b.start_time < $3
ORDER BY b.start_time, b.id;

-- Q05: Inventory summary; LEFT JOIN retains malls with no published bays.
PREPARE pe_q05 AS
SELECT m.id, m.name,
       count(s.id) FILTER (WHERE s.retired_at IS NULL) AS published_bays,
       count(s.id) FILTER (WHERE s.retired_at IS NULL AND s.status = 'AVAILABLE') AS usable_bays,
       count(s.id) FILTER (WHERE s.retired_at IS NULL AND s.status = 'MAINTENANCE') AS maintenance_bays
FROM malls m
LEFT JOIN parking_floors f ON f.mall_id = m.id
LEFT JOIN parking_slots s ON s.floor_id = f.id
WHERE m.status = 'APPROVED'
GROUP BY m.id, m.name
ORDER BY m.name, m.id;

-- Q06: Daily confirmed reservation value by IST arrival day, not collected revenue.
-- This schema quotes scheduled duration; it has no actual-time bill/payment table.
PREPARE pe_q06(timestamptz, timestamptz) AS
SELECT (b.start_time AT TIME ZONE 'Asia/Kolkata')::date AS arrival_day_ist,
       count(*) AS confirmed_bookings,
       sum(b.total_amount_paise) AS reserved_value_paise
FROM bookings b
WHERE b.status = 'CONFIRMED' AND b.start_time >= $1 AND b.start_time < $2
GROUP BY (b.start_time AT TIME ZONE 'Asia/Kolkata')::date
ORDER BY arrival_day_ist;

-- Q07: Repeat drivers with at least the requested number of confirmed bookings.
PREPARE pe_q07(bigint) AS
SELECT u.id, u.name, count(*) AS confirmed_bookings,
       sum(b.total_amount_paise) AS reserved_value_paise
FROM users u JOIN bookings b ON b.driver_id = u.id
WHERE b.status = 'CONFIRMED'
GROUP BY u.id, u.name
HAVING count(*) >= $1
ORDER BY confirmed_bookings DESC, u.id;

-- Q08: Approved malls without a currently active guard assignment.
PREPARE pe_q08 AS
SELECT m.id, m.name, m.city
FROM malls m
WHERE m.status = 'APPROVED' AND NOT EXISTS (
    SELECT 1 FROM guard_assignments ga
    JOIN users g ON g.id = ga.guard_id
    WHERE ga.mall_id = m.id AND ga.deactivated_at IS NULL
      AND g.role = 'GUARD' AND g.status = 'ACTIVE'
)
ORDER BY m.name, m.id;

-- Q09: Rank malls by confirmed reservation value, including zero-booking malls.
PREPARE pe_q09 AS
WITH totals AS (
    SELECT m.id, m.name, coalesce(sum(b.total_amount_paise), 0) AS reserved_value_paise
    FROM malls m
    LEFT JOIN parking_floors f ON f.mall_id = m.id
    LEFT JOIN parking_slots s ON s.floor_id = f.id
    LEFT JOIN bookings b ON b.slot_id = s.id AND b.status = 'CONFIRMED'
    WHERE m.status = 'APPROVED'
    GROUP BY m.id, m.name
)
SELECT id, name, reserved_value_paise,
       dense_rank() OVER (ORDER BY reserved_value_paise DESC) AS value_rank
FROM totals
ORDER BY value_rank, id;

-- Q10: Cancellation rate with conditional aggregates and division-by-zero handling.
PREPARE pe_q10 AS
SELECT m.id, m.name, count(b.id) AS bookings,
       count(b.id) FILTER (WHERE b.status = 'CANCELLED') AS cancellations,
       round(100.0 * count(b.id) FILTER (WHERE b.status = 'CANCELLED')
             / nullif(count(b.id), 0), 2) AS cancellation_percent
FROM malls m
LEFT JOIN parking_floors f ON f.mall_id = m.id
LEFT JOIN parking_slots s ON s.floor_id = f.id
LEFT JOIN bookings b ON b.slot_id = s.id
GROUP BY m.id, m.name
ORDER BY cancellations DESC, m.id;

-- Q11: Relational QR gate lookup at an explicit verification time.
-- This reports eligibility only; consuming a token requires a separate transaction.
-- Academic QR schema has one credential per booking and no app pass-type field.
PREPARE pe_q11(text, uuid, uuid, timestamptz) AS
SELECT q.id AS token_id, b.id AS booking_id, b.vehicle_number, s.slot_code,
       q.entry_scanned_at, q.exit_scanned_at
FROM qr_tokens q
JOIN bookings b ON b.id = q.booking_id
JOIN parking_slots s ON s.id = b.slot_id
JOIN parking_floors f ON f.id = s.floor_id
JOIN malls m ON m.id = f.mall_id
WHERE q.token_hash = $1 AND f.mall_id = $2
  AND q.status = 'ACTIVE' AND q.expires_at > $4 AND b.status = 'CONFIRMED'
  AND m.status = 'APPROVED' AND s.retired_at IS NULL
  AND q.exit_scanned_at IS NULL
  AND EXISTS (
      SELECT 1 FROM guard_assignments ga JOIN users g ON g.id = ga.guard_id
      WHERE ga.mall_id = f.mall_id AND ga.guard_id = $3
        AND ga.deactivated_at IS NULL AND g.role = 'GUARD' AND g.status = 'ACTIVE'
  );

-- Q12: Mall prices above the approved-mall average (scalar subquery).
PREPARE pe_q12 AS
SELECT id, name, city, hourly_rate_paise
FROM malls
WHERE status = 'APPROVED' AND hourly_rate_paise > (
    SELECT avg(hourly_rate_paise) FROM malls WHERE status = 'APPROVED'
)
ORDER BY hourly_rate_paise DESC, id;

-- Sample executions (IDs match plans/seed.sql; replace with real IDs for other data).
EXECUTE pe_q01('Delhi', 10000);
EXECUTE pe_q02('00000000-0000-0000-0000-000000020001', 'CAR',
              '2026-11-10 10:00+05:30', '2026-11-10 12:00+05:30');
EXECUTE pe_q03('00000000-0000-0000-0000-000000010001');
EXECUTE pe_q04('00000000-0000-0000-0000-000000020001',
              '2026-11-10 00:00+05:30', '2026-11-11 00:00+05:30');
EXECUTE pe_q05;
EXECUTE pe_q06('2026-11-10 00:00+05:30', '2026-11-11 00:00+05:30');
EXECUTE pe_q07(40);
EXECUTE pe_q08;
EXECUTE pe_q09;
EXECUTE pe_q10;
EXECUTE pe_q11(md5('qr-1') || md5('credential-1'),
              '00000000-0000-0000-0000-000000020001',
              '00000000-0000-0000-0000-000000000003', '2026-11-01 10:00+05:30');
EXECUTE pe_q12;
