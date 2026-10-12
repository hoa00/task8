import type { ApiError } from '@studio/contracts/api';
import type { Clock } from './clock.ts';
import { serverClock } from './clock.ts';
export interface DiagnosticFailure {
  phase: string;
  errorCode: ApiError['error']['code'];
  cause?: unknown;
  fileId?: string;
  sourceFileId?: string;
}
export type DiagnosticReporter = (failure: DiagnosticFailure) => void;
export function createDiagnosticReporter(
  context: { requestId: string; operation: string; startedAt: number },
  clock: Clock = serverClock,
): DiagnosticReporter {
  return (failure) => {
    console.error(
      JSON.stringify({
        requestId: context.requestId,
        operation: context.operation,
        errorCode: failure.errorCode,
        errorType: failure.cause instanceof Error ? failure.cause.name : 'Error',
        phase: failure.phase,
        durationMs: clock.now() - context.startedAt,
        ...(failure.fileId ? { fileId: failure.fileId } : {}),
        ...(failure.sourceFileId ? { sourceFileId: failure.sourceFileId } : {}),
      }),
    );
  };
}
export const defaultDiagnosticReporter: DiagnosticReporter = (failure) =>
  console.error(
    JSON.stringify({
      errorCode: failure.errorCode,
      errorType: failure.cause instanceof Error ? failure.cause.name : 'Error',
      phase: failure.phase,
      ...(failure.fileId ? { fileId: failure.fileId } : {}),
      ...(failure.sourceFileId ? { sourceFileId: failure.sourceFileId } : {}),
    }),
  );
