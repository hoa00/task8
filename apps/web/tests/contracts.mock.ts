import { operations } from '@studio/contracts';
import type { StudioApi, OperationOutput } from '@studio/contracts';
// A typed fixture boundary, not a running adapter. Real mutation behavior belongs to its owning WU.
export function completionFixtureHandler(reply: OperationOutput<'setTaskCompletion'>): StudioApi['setTaskCompletion'] {
  return async input => {
    operations.setTaskCompletion.request.parse(input);
    return operations.setTaskCompletion.response.parse(reply);
  };
}
