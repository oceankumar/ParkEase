-- Synthetic, deterministic academic fixture. Load ONLY into an empty CP schema.
BEGIN;
SET TIME ZONE 'Asia/Kolkata';
INSERT INTO users (id, name, email, password_hash, role)
VALUES
 ('00000000-0000-0000-0000-000000000001', 'Demo Admin', 'admin@example.test', 'not-a-login-hash', 'ADMIN'),
 ('00000000-0000-0000-0000-000000000002', 'Demo Owner', 'owner@example.test', 'not-a-login-hash', 'MALL_OWNER'),
 ('00000000-0000-0000-0000-000000000003', 'Demo Guard', 'guard@example.test', 'not-a-login-hash', 'GUARD');
INSERT INTO users (id, name, email, password_hash, role)
SELECT lpad((10000 + n)::text, 32, '0')::uuid, 'Driver ' || n,
       'driver' || n || '@example.test', 'not-a-login-hash', 'USER'
FROM generate_series(1, 2000) n;
INSERT INTO malls (id, owner_id, name, city, address, hourly_rate_paise, status)
SELECT lpad((20000 + n)::text, 32, '0')::uuid,
       '00000000-0000-0000-0000-000000000002', 'Mall ' || n,
       CASE WHEN n % 10 = 1 THEN 'Delhi' ELSE 'Noida' END,
       n || ' Demo Road', 3000 + n * 100, 'APPROVED'
FROM generate_series(1, 40) n;
-- Each mall has two floors, five rows per floor, twenty bays per row.
INSERT INTO parking_floors (id, mall_id, name, display_order)
SELECT lpad((30000 + n)::text, 32, '0')::uuid,
       lpad((20001 + (n - 1) / 2)::text, 32, '0')::uuid,
       'Floor ' || (1 + (n - 1) % 2), 1 + (n - 1) % 2
FROM generate_series(1, 80) n;
INSERT INTO parking_rows (floor_id, row_number, cell_count)
SELECT id, r, 20 FROM parking_floors CROSS JOIN generate_series(1, 5) r;
INSERT INTO parking_slots
 (id, floor_id, row_number, slot_code, position, vehicle_type, status, is_accessible, is_electric)
SELECT lpad((40000 + n)::text, 32, '0')::uuid,
       lpad((30001 + (n - 1) / 100)::text, 32, '0')::uuid,
       1 + ((n - 1) % 100) / 20, 'B-' || (1 + (n - 1) % 100),
       1 + (n - 1) % 20, CASE WHEN n % 5 = 0 THEN 'BIKE' ELSE 'CAR' END,
       CASE WHEN n % 25 = 0 THEN 'MAINTENANCE' ELSE 'AVAILABLE' END,
       n % 20 = 1, n % 10 = 1
FROM generate_series(1, 8000) n;
-- Twelve non-overlapping daily windows per bay; 20% cancelled.
INSERT INTO bookings
 (id, driver_id, slot_id, vehicle_number, start_time, end_time,
  hourly_rate_snapshot_paise, status, cancelled_at, created_at)
SELECT lpad((100000 + d * 8000 + n)::text, 32, '0')::uuid,
       lpad((10001 + (n + d * 17 - 1) % 2000)::text, 32, '0')::uuid,
       lpad((40000 + n)::text, 32, '0')::uuid,
       'DL01AB' || lpad(n::text, 4, '0'),
       '2026-11-01 10:00+05:30'::timestamptz + d * interval '1 day',
       '2026-11-01 12:00+05:30'::timestamptz + d * interval '1 day',
       3000 + (1 + (n - 1) / 200) * 100,
       CASE WHEN (n + d) % 5 = 0 THEN 'CANCELLED' ELSE 'CONFIRMED' END,
       CASE WHEN (n + d) % 5 = 0 THEN '2026-10-31 09:00+05:30'::timestamptz END,
       '2026-10-30 09:00+05:30'::timestamptz
FROM generate_series(1, 8000) n CROSS JOIN generate_series(0, 11) d;
INSERT INTO guard_assignments (guard_id, mall_id, assigned_by, gate_label)
SELECT '00000000-0000-0000-0000-000000000003', id,
       '00000000-0000-0000-0000-000000000002', 'Main gate'
FROM malls WHERE id::text IN ('00000000-0000-0000-0000-000000020001',
                             '00000000-0000-0000-0000-000000020002');
INSERT INTO qr_tokens (booking_id, token_hash, expires_at)
SELECT lpad((100000 + n)::text, 32, '0')::uuid,
       md5('qr-' || n) || md5('credential-' || n), '2026-11-01 12:00+05:30'
FROM generate_series(1, 200) n WHERE n % 5 <> 0;
COMMIT;
ANALYZE;
