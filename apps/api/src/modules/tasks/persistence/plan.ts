import type { IdGenerator } from '../../../shared/ids.ts';
import type { ActivityRow, SubtaskRow, TaskProjection, TaskRow } from './model.ts';

import type { ColumnScope, UndoDescriptor } from '@studio/contracts/api';
import type { SqlPredicate } from '../../../db/commands.ts';

export interface Plan {
  ids: IdGenerator;
  before: TaskProjection[];
  changed: TaskRow[];
  created: TaskRow[];
  children: SubtaskRow[];
  labels: { workspaceId: string; taskId: string; labelId: string }[];
  dependencies: { workspaceId: string; taskId: string; dependsOnTaskId: string }[];
  replaceLabels: string[];
  replaceDependencies: string[];
  guards: SqlPredicate[];
  undo: { descriptor: UndoDescriptor; payload: string } | null;
  events: ActivityRow[];
  allocations: { projectId: string; count: number }[];
  intent:
    | { kind: 'mutation' }
    | { kind: 'lifecycle' }
    | { kind: 'create'; request: { id: string; hash: string } }
    | { kind: 'column'; scope: ColumnScope; operation: 'complete' | 'archive' | 'sortPriority' };
  sourceChildren: SubtaskRow[] | null;
  slots: TaskRow[] | null;
  dependencyTargets: TaskProjection[];
}
