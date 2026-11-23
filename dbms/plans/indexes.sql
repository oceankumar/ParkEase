-- CP4 optional workload indexes, applied after the baseline measurement.
-- Keep 03_schema.sql unchanged so before/after use an identical base schema.
CREATE INDEX cp4_malls_discovery_idx
    ON malls (city, hourly_rate_paise, id) WHERE status = 'APPROVED';
CREATE INDEX cp4_bookings_slot_start_idx ON bookings (slot_id, start_time);
CREATE INDEX cp4_bookings_confirmed_start_idx
    ON bookings (start_time) INCLUDE (total_amount_paise) WHERE status = 'CONFIRMED';
ANALYZE;
