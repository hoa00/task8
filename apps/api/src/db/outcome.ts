export const confirmedRollback = (error: unknown) =>
  error instanceof Error &&
  /D1_ERROR:/u.test(error.message) &&
  /constraint failed|SQLITE_CONSTRAINT|no such table|syntax error/iu.test(error.message);
