export { decideCompletion, transitionCompletion } from './domain/completion.ts';
export { completionProjection, taskDto } from './mapper.ts';

export { completeTask } from './application/complete-task.ts';
export { createTask } from './application/create-task.ts';
export { duplicateTask } from './application/duplicate-task.ts';
export { favoriteTask } from './application/favorite-task.ts';
export { lifecycleTask } from './application/lifecycle-task.ts';
export { queryTasks, resolveTaskKey, taskDataset, taskDetail } from './application/queries.ts';
export { updateTask } from './application/update-task.ts';
export type { SubtaskRow, TaskProjection, TaskRow } from './persistence/model.ts';
export { taskRow, taskSelect } from './persistence/reads.ts';
