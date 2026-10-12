export interface AggregateRow {
  projectId: string;
  total: number;
  backlog: number;
  todo: number;
  progress: number;
  review: number;
  done: number;
  urgent: number;
  high: number;
  medium: number;
  low: number;
  none: number;
  overdue: number;
  subtaskTotal: number;
  subtaskDone: number;
}
