// Harness consumer for AC1/AC3: two independent controllers and changing props.
import { useState } from 'react';
import type { EntityId } from '@studio/contracts/api';
import { useStudioQuery } from '../../data/queries';
import { useTaskFieldCommands } from './useTaskFieldCommands';
import type { TaskDto } from '@studio/contracts/api';
export function ControllerRaceProbe({ workspaceId, taskIds }: { workspaceId: EntityId; taskIds: readonly EntityId[] }) {
  const [alternate, setAlternate] = useState(false); const first = useStudioQuery('getTask', { workspaceId, taskId: taskIds[0]! }), second = useStudioQuery('getTask', { workspaceId, taskId: taskIds[1] ?? taskIds[0]! }); const query = alternate ? second : first;
  return <section data-controller-race data-race-targets-ready={!!first.data && !!second.data} className="mt-6"><button type="button" data-switch-controller onClick={() => setAlternate(value => !value)}>Switch controller target</button>{query.data && <RaceEditors task={query.data.data.task} />}</section>;
}
function RaceEditors({ task }: { task: TaskDto }) {
  const a = useTaskFieldCommands(task), b = useTaskFieldCommands(task);
  return <><button type="button" data-race-a onClick={() => { void a.patch({ priority: 'high' }); }}>A priority</button><button type="button" data-race-b onClick={() => { void b.patch({ priority: 'urgent' }); }}>B priority</button><output data-race-task>{task.id}</output><output data-race-priority>{task.priority}</output><output data-race-version>{task.version}</output><output data-race-error>{a.error}</output><output data-race-attempt>{JSON.stringify(a.attempt)}</output></>;
}
