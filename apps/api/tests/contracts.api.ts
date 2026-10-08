import { operations, ApiErrorSchema } from '@studio/contracts';
import type { OperationInput, OperationOutput } from '@studio/contracts';
export function validateWorkerBoundary(input: unknown, output: unknown): { input: OperationInput<'bulkMutateTasks'>; output: OperationOutput<'bulkMutateTasks'> } {
  return { input: operations.bulkMutateTasks.request.parse(input), output: operations.bulkMutateTasks.response.parse(output) };
}
export const validationFailure = ApiErrorSchema.parse({ error: { code: 'VALIDATION_ERROR', message: 'Invalid request', fieldErrors: { dueDate: ['Invalid date'] } } });
