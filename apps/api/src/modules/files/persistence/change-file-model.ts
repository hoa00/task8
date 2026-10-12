export type FileChangeCommand =
  | { kind: 'rename'; expectedVersion: number; name: string }
  | { kind: 'delete' | 'restore'; expectedVersion: number }
  | { kind: 'duplicate'; expectedVersion: number; name?: string };
