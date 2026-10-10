import type { RefObject } from 'react';
import type { BootstrapDto, TaskDto } from '@studio/contracts/api';
import type { TimelineGeometry, TimelineGrouping, TimelineZoom } from '@studio/domain';
import type { TaskFormDefaults } from '../tasks/field-types';
export type TimelineScope = { kind: 'workspace' } | { kind: 'project'; projectId: TaskDto['projectId'] };
export interface TimelineModel {
  data: BootstrapDto; geometry: TimelineGeometry; scope: TimelineScope; grouping: TimelineGrouping;
  scrollPositions: RefObject<Map<string, { left: number; top: number }>>;
  zoom: TimelineZoom; todayRequest: number; pending: boolean;
  onTaskOpen: (id: string) => void;
  onTaskMenu?: (id: string, anchor: HTMLElement, point: { x: number; y: number }) => void;
  onTaskMove: (task: TaskDto, days: number) => Promise<boolean>;
  onNewTask: (defaults: TaskFormDefaults) => void;
}
