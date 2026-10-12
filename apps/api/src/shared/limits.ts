// Canonical values are checked against the contracts capability schema; never raised to fit plans.
export const queryLimits = {
  statements: 50,
  parametersPerStatement: 100,
  batchStatements: 50,
} as const;
export const apiLimits = {
  taskPageSize: 50,
  maxTaskPageSize: 200,
  maxBulkItems: 20,
  maxUndoTargets: 128,
  maxUndoPayloadBytes: 65536,
  maxUploadBytes: 10485760,
} as const;
export const transportLimits = {
  maxJsonBodyBytes: 16 * 1024 * 1024,
  multipartOverheadBytes: 65536,
} as const;
