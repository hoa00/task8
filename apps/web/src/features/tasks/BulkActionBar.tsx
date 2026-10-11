import { translate as t } from '../../i18n/i18n';
import { useTranslation } from '../../i18n/useTranslation';
import { useState } from 'react';
import { Icon } from '@studio/ui';
import type { BootstrapDto, OperationInput } from '@studio/contracts/api';
import { AssigneeField, TaskPriorityField, TaskStatusField } from './fields';
type BulkPatch = OperationInput<'bulkMutateTasks'>['body'] & { operation: 'patch' };
export interface BulkActionBarProps { count: number; data: BootstrapDto; pending: boolean; onPatch: (patch: BulkPatch['patch']) => Promise<boolean>; onDelete: () => void; onClear: () => void }
export function BulkActionBar({ count, data, pending, onPatch, onDelete, onClear }: BulkActionBarProps) { useTranslation();
 const [open, setOpen] = useState<string | null>(null);
 const control = (name: string) => ({ open: open === name, onOpenChange: (next: boolean) => setOpen(next ? name : null), disabled: pending, triggerLabel: name, triggerClassName: 'task-bulk-button', trigger: <><Icon name={name === 'Status' ? 'circle-dot' : name === 'Assignee' ? 'user' : 'signal-high'} size={14} />{name}</> });
 return <div className="task-bulkbar" role="toolbar" aria-label={t("Bulk actions")}><b className="font-semibold">{count}  {t("selected")}</b><span className="task-bulk-sep" /><TaskStatusField {...control('Status')} value="todo" onChange={status => onPatch({ status })} /><AssigneeField {...control('Assignee')} value={null} members={data.members} currentMemberId={data.currentMember.id} onChange={assigneeId => onPatch({ assigneeId })} /><TaskPriorityField {...control('Priority')} value="none" onChange={priority => onPatch({ priority })} /><button type="button" className="task-bulk-button" disabled={pending} onClick={onDelete}><Icon name="trash-2" size={14} />{t("Delete")}</button><span className="task-bulk-sep" /><button type="button" className="task-bulk-button" onClick={onClear} aria-label={t("Clear selection")}><Icon name="x" size={14} /></button></div>;
}
