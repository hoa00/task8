// SQLite stores millisecond components exactly; Julian-day floating-point truncation can lose 1ms.
export const sqlNow =
  "(CAST(strftime('%s','now') AS INTEGER)*1000+CAST(substr(strftime('%f','now'),4,3) AS INTEGER))";
