-- 039 D5: alone in its migration (Postgres cannot use a new value in the same
-- transaction). IF NOT EXISTS: a rolled-back database keeps the value (D24).
ALTER TYPE "Channel" ADD VALUE IF NOT EXISTS 'FACEBOOK';
