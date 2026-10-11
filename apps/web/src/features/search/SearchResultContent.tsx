import { translate as t } from '../../i18n/i18n';
import type { BootstrapDto, SearchResultDto } from '@studio/contracts/api';
import { ColorDot } from '@studio/ui';
import { MemberIdentity } from '../people/MemberIdentity';
import { TaskStatusIcon } from '../tasks/atoms';
import { ProjectIcon, ProjectStatus } from '../projects/ProjectComponents';
import { FileTypeIcon } from '../files/FileFoundation';
import { ago } from '../tasks/date-display';
import { Highlight } from './Highlight';
export interface SearchResultContentProps { result: SearchResultDto; query: string; data: BootstrapDto; now: string }
export function SearchResultContent({ result: r, query, data, now }: SearchResultContentProps) {
 const title = 'min-w-0 flex-1 truncate';
 if (r.kind === 'tasks') { const p = data.projects.find(row => row.project.id === r.task.projectId)?.project; return <><TaskStatusIcon status={r.task.status}/><span className="font-mono text-[11px] text-muted">{r.task.key}</span><span className={title}><Highlight text={r.task.title} query={query}/></span>{p && <span className="inline-flex max-w-[140px] items-center gap-[5px] text-xs text-secondary"><ColorDot color={p.color} className="size-2! rounded-[3px]!"/>{p.name}</span>}<MemberIdentity member={data.members.find(row => row.id === r.task.assigneeId) ?? null} avatarOnly/></>; }
 if (r.kind === 'projects') { const p = r.project.project; return <><ProjectIcon project={p} size={13}/><span className={title}><Highlight text={p.name} query={query}/>{' '}<span className="text-xs text-muted">— {r.project.access === 'allowed' ? r.project.project.description.slice(0, 70) : ''}…</span></span><ProjectStatus status={p.status}/></>; }
 if (r.kind === 'people') return <><MemberIdentity member={r.member} avatarOnly size="md"/><span className={title}><Highlight text={r.member.name} query={query}/>{' '}<span className="text-xs text-muted">{r.member.title}</span></span><span className="text-xs text-muted">{r.member.email}</span></>;
 if (r.kind === 'files') return <><FileTypeIcon type={r.file.fileType}/><span className={title}><Highlight text={r.file.name} query={query}/></span><span className="text-xs text-muted">{r.file.displaySize} · {data.projects.find(row => row.project.id === r.file.projectId)?.project.name}</span></>;
 return <><MemberIdentity member={data.members.find(row => row.id === r.comment.authorId) ?? null} avatarOnly/><div className="min-w-0 grow"><div className="text-xs text-secondary"><b className="font-medium text-foreground">{data.members.find(row => row.id === r.comment.authorId)?.name ?? t('Someone')}</b>  {t("on")} {r.taskTitle} · {ago(r.comment.createdAt, now)}</div><div className="text-[13px]"><Highlight text={r.comment.bodyText} query={query}/></div></div></>;
}
