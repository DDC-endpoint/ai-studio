/**
 * The first instant of `now`'s calendar month in UTC (037 D11). Pure: the
 * dashboard's "Posts this month" counts from here, so the bound never depends
 * on the server's time zone.
 */
export function monthStartUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0))
}
