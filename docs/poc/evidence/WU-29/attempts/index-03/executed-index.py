"""Generate the finite M2 inventory/action/reuse index from actual selected evidence."""
import hashlib
import json
import pathlib
import re
import sys
from functools import lru_cache

ROOT = pathlib.Path('.')
OUT = pathlib.Path('docs/poc/evidence/WU-29')
attempt = sys.argv[1]
OUTPUT = OUT / 'indices' / attempt if len(sys.argv)>2 and sys.argv[2]=='--versioned' else OUT
folder = OUT / 'attempts' / attempt
if not re.fullmatch('[a-z0-9-]+', attempt) or folder.exists():
    raise RuntimeError('Unique index attempt required')
folder.mkdir(parents=True)
(folder / 'executed-index.py').write_bytes(pathlib.Path(__file__).read_bytes())
@lru_cache(maxsize=None)
def read(file):
    return json.loads(pathlib.Path(file).read_text())
@lru_cache(maxsize=None)
def ref(file):
    data = pathlib.Path(file).read_bytes()
    return dict(path=str(file), bytes=len(data), sha256=hashlib.sha256(data).hexdigest())
def write(file, value):
    path = pathlib.Path(file)
    if path.exists():
        raise RuntimeError('Index output must be new: ' + str(path))
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
def native(name, child, suffix, scope):
    file = OUT / 'attempts' / child / 'legacy' / suffix
    data = read(file)
    assert data['status'] == 'passed', (name, data['status'])
    rows = next((data[key] for key in ['probes','journeys','steps','cases'] if isinstance(data.get(key), list)), [])
    cases = [dict(id=row.get('id', row.get('name', str(index))), recordedStatus=row.get('status'), recordedPass=row.get('pass'), result=row) if isinstance(row, dict) else dict(id=str(row), recordedStatus=None) for index,row in enumerate(rows)]
    return dict(id=name, report=ref(file), reportStatus=data['status'], scope=scope, cases=cases, statusQualification='Only recorded individual statuses are preserved; no invented per-case PASS where the report records an overall assertion result.')
N = {}
for name, child, suffix, scope in [
 ('fields','native-current-01-fields','WU-08/interactions.json','Standalone QA controlled shared fields/toolbar'),
 ('list','native-closure-03-list','WU-09/interactions.json','Mixed standalone and canonical task List'),
 ('detail','native-form-affected-06-detail','WU-10/interactions.json','Current affected Detail/NewTask; mixed QA and canonical AppShell'),
 ('comments','native-closure-03-comments','WU-11/interactions.json','Standalone QA Drawer fallback drafts; canonical provider is separately covered by Inbox/Draft HTTP'),
 ('board','native-current-01-board','WU-12/interactions.json','Standalone Board QA'),
 ('journey','native-form-affected-06-journey','WU-12/m1-journey.json','Canonical List→Drawer rich content/subtask/comment/file→Files URL→linked Drawer→Board trusted drag→recurrence Undo→My Tasks/reload/history'),
 ('table','native-current-01-table','WU-13/interactions.json','Mixed Table QA/canonical'),
 ('calendar','native-current-01-calendar','WU-14/interactions.json','Mixed QA/canonical, three scopes, Month/Week, boundaries/date drag/frozen submissions'),
 ('timeline','native-current-01-timeline','WU-15/interactions.json','Mixed QA/canonical, two scopes/Months/group/scroll/date drag'),
 ('projects','native-closure-03-projects','WU-16/interactions.json','Real router/AppShell at project-routes host with declared QA transport; catalogue/forms/sharing/saved3/restricted route'),
 ('dashboards','native-current-01-dashboards','WU-17/interactions.json','Canonical Home/Overview and cross-view scalar task flow'),
 ('search','native-search-05-search','WU-18/attempts/replay/report.json','Canonical Search/Palette scopes/native keyboard/copy; current Files URL and Invite/Login demo owners'),
 ('notifications','native-current-01-notifications','WU-19/attempts/replay/report.json','Canonical Inbox/Notifications tabs/read/filter'),
 ('people','native-closure-02-people','WU-20/attempts/replay/report.json','Canonical directory/profile/TeamGrid/role/invite/remove-demo Undo'),
 ('teams','native-current-01-teams','WU-21/attempts/replay/report.json','Canonical teams/form/primary-team/delete Undo'),
 ('files','native-current-01-files','WU-22/attempts/replay/report.json','Canonical grid/list/art/upload/Preview/deep-link/ID/CAS/Undo'),
 ('settings','native-current-01-settings','WU-23/attempts/replay/report.json','Canonical general Settings/native preference controls'),
 ('workspace','native-current-01-workspace','WU-24/attempts/replay/report.json','Canonical eight workspace/notification Settings/shared people/team/project owners'),
 ('security','native-current-01-security','WU-25/attempts/replay/report.json','Canonical security/billing demo states; principal/payment authority unchanged'),
 ('auth','native-closure-03-auth','WU-26/attempts/replay/report.json','Auth outside Shell, actual demo validation/loading/cancel/flow; no identity service'),
 ('onboarding','native-closure-02-onboarding','WU-27/attempts/replay/report.json','Canonical six-step demo draft/finish-once/scoped namespace/history/mobile'),
 ('archive','native-current-01-archive','WU-28/attempts/replay/report.json','Canonical lower galleries/native controls/context6/mention/selection/files/restore/delete/source-visible Undo'),
 ('shell','native-closure-03-shell','WU-17/shell-regression/routes-verification.json','Canonical plus declared synthetic two-workspace route/focus/alias/error/viewport/persisted-collapse probes')]:
    N[name] = native(name, child, suffix, scope)
native_report = dict(status='selected-current-native-flows-passed', owners=N, qualification='23 selected current owner flows. Original multi-owner failed attempts remain FAILED; selection is explicit. Standalone QA is not a whole AppShell assertion.')
base_path = OUT/'attempts/visual-current-04/report.json'
extra_path = OUT/'attempts/extra-current-02/report.json'
base, extra = read(base_path), read(extra_path)
legacy = {
 'shell':'docs/poc/evidence/WU-07/visual-verification.json',
 'fields':'docs/poc/evidence/WU-08/visual-verification.json',
 'list':'docs/poc/evidence/WU-09/visual-verification.json',
 'detail':'docs/poc/evidence/WU-10/visual-verification.json',
 'comments':'docs/poc/evidence/WU-11/visual-verification.json',
 'board':'docs/poc/evidence/WU-12/visual-verification.json',
 'table':'docs/poc/evidence/WU-13/visual-verification.json',
 'calendar':'docs/poc/evidence/WU-14/visual-verification.json',
 'timeline':'docs/poc/evidence/WU-15/visual-verification.json',
 'dashboards':'docs/poc/evidence/WU-17/visual-verification.json',
 'search':'docs/poc/evidence/WU-18/visual-verification.json',
 'notifications':'docs/poc/evidence/WU-19/visual-verification.json',
 'people':'docs/poc/evidence/WU-20/visual-verification.json',
 'teams':'docs/poc/evidence/WU-21/final-proof/visual-verification.json',
 'settings':'docs/poc/evidence/WU-23/attempts/closure-01/report.json',
 'workspace':'docs/poc/evidence/WU-24/attempts/closure-03/report.json',
 'security':'docs/poc/evidence/WU-25/attempts/closure-02/report.json',
 'projects':'docs/poc/evidence/WU-16/full-raster-linux-candidate-review.json',
 'files':'docs/poc/evidence/WU-22/attempts/closure-02/report.json',
 'auth':'docs/poc/evidence/WU-26/attempts/matrix-03/report.json',
 'onboarding':'docs/poc/evidence/WU-27/attempts/static-01/report.json',
 'archive':'docs/poc/evidence/WU-28/attempts/visual-13/report.json'}
route_group = ['dashboards','notifications','list','projects','notifications','search','dashboards','projects','projects','list','calendar','timeline','people','people','teams','teams','search','settings','archive','archive','archive']
owner = {
 'shell':['apps/web/src/app/shell/AppShell.tsx','apps/web/src/app/shell/Sidebar.tsx'],
 'fields':['apps/web/src/features/tasks/fields.tsx','apps/web/src/features/tasks/TaskViewToolbar.tsx'],
 'list':['apps/web/src/features/tasks/TaskList.tsx','apps/web/src/features/tasks/TaskListPages.tsx'],
 'detail':['apps/web/src/features/tasks/detail/TaskOverlayHost.tsx','apps/web/src/features/tasks/detail/TaskFormDialog.tsx'],
 'comments':['apps/web/src/features/comments/Comments.tsx','apps/web/src/features/comments/TaskCommentDraftProvider.tsx','apps/web/src/features/comments/draft-context.ts'],
 'board':['apps/web/src/features/tasks/TaskBoard.tsx'], 'table':['apps/web/src/features/tasks/TaskTable.tsx'],
 'calendar':['apps/web/src/features/calendar/CalendarView.tsx','apps/web/src/features/calendar/CalendarPages.tsx'],
 'timeline':['apps/web/src/features/timeline/TimelineView.tsx','apps/web/src/features/timeline/TimelinePages.tsx'],
 'projects':['apps/web/src/features/projects/ProjectPage.tsx','apps/web/src/features/projects/ProjectFormDialog.tsx','apps/web/src/features/projects/ProjectLayout.tsx'],
 'dashboards':['apps/web/src/features/dashboards/HomePage.tsx','apps/web/src/features/dashboards/WorkspaceOverview.tsx'],
 'search':['apps/web/src/features/search/SearchPage.tsx','apps/web/src/features/activity/ActivityFeed.tsx','apps/web/src/features/search/CommandPalette.tsx'],
 'notifications':['apps/web/src/features/notifications/InboxPage.tsx','apps/web/src/features/notifications/NotificationsPage.tsx'],
 'people':['apps/web/src/features/people/MembersPage.tsx','apps/web/src/features/people/MemberIdentity.tsx','apps/web/src/features/people/PeopleOverlayHost.tsx'],
 'teams':['apps/web/src/features/teams/TeamsPage.tsx','apps/web/src/features/teams/TeamOverlayHost.tsx'],
 'files':['apps/web/src/features/files/ProjectFilesPage.tsx','apps/web/src/features/files/FileFoundation.tsx','apps/web/src/features/files/FileOverlayHost.tsx'],
 'settings':['apps/web/src/features/settings/SettingsPage.tsx'], 'workspace':['apps/web/src/features/settings/WorkspaceNotifications.tsx'],
 'security':['apps/web/src/features/settings/SecurityBilling.tsx'], 'auth':['apps/web/src/features/auth/AuthPage.tsx'],
 'onboarding':['apps/web/src/features/onboarding/OnboardingPage.tsx'], 'archive':['apps/web/src/features/dev/Galleries.tsx','apps/web/src/features/archive/ArchivePage.tsx']}
for paths in owner.values():
    for file in paths: ref(file)
def family(item):
    key=item['id']
    if key.startswith('SC-'): return route_group[int(key[3:5])-1]
    if key.startswith('PR-'): return 'projects'
    if key.startswith('SE-'):
        i=int(key[3:5]); return 'security' if i>=16 else 'workspace' if i in [1,5,6,7,8,9,10,11,12] else 'settings'
    if key.startswith('AU-'): return 'auth'
    if key.startswith('ON-'): return 'onboarding'
    if key.startswith('DR-'): return 'comments' if any(v in key for v in ['activity','rich-text','subtask','attachment','comment']) else 'detail'
    if key.startswith('MD-'):
        return ['detail','projects','projects','people','archive','files','search','teams','files','projects'][int(key[3:5])-1]
    if key.startswith('PO-'):
        kind=key[3:]; return 'shell' if kind in ['create','ws','user','help'] else 'calendar' if kind in ['daylist','event'] else 'comments' if kind in ['emoji','subassignee'] else 'people' if kind=='role' else 'projects' if kind=='pstatus' else 'archive' if kind=='ctx' else 'list' if kind.startswith('bulk-') else 'fields'
    if key=='ST-bulk': return 'list'
    if key in ['ST-loading','ST-offline']: return 'archive'
    if 'calendar' in key: return 'calendar'
    if 'timeline' in key: return 'timeline'
    if 'board' in key: return 'board'
    if 'table' in key: return 'table'
    if 'file' in key: return 'files'
    if 'inbox' in key: return 'notifications'
    if 'drawer' in key or 'modal' in key or key=='ST-task-validation': return 'detail'
    if 'auth' in key: return 'auth'
    if '2fa' in key: return 'security'
    if 'palette' in key or 'search' in key: return 'search'
    if 'project' in key: return 'projects'
    return 'shell'
def case_id(row):
    return row.get('id') or row.get('sample',{}).get('id') or row.get('name')
def case_rows(report):
    data=read(report)
    for key in ['samples','pairs','visual','selected','strictImages']:
        if isinstance(data.get(key),list) and any(case_id(row) for row in data[key] if isinstance(row,dict)):
            return data[key]
    raise RuntimeError('No actual case list: '+str(report))
def current_ids(key):
    ids=[row['id'] for row in base['samples'] if row['id'].startswith(key+'-')]
    if key.startswith('BOUNDARY-'): ids=['DIM-'+key]
    if key.startswith('THEME-'): ids=['DIM-05-'+key[6:]]
    if key in ['DENSITY-content','DENSITY-sidebar']: ids=[r['id'] for r in base['samples'] if r['id'].startswith('DIM-density-')]
    mobile={'home':'SC-01-base','inbox':'SC-02-base','tasks':'SC-10-base','calendar':'SC-11-base','timeline':'SC-12-base','settings':'SC-18-base','board':'VW-board','table':'VW-table','files':'PR-07-files'}
    if key.startswith('MOBILE-') and key[7:] in mobile: ids=[mobile[key[7:]]+'-390']
    return ids
def extra_ids(key):
    if key.startswith('THEME-') and key[6:] not in ['system-light','system-dark']: return ['EX-accent-overlay-'+key[6:]]
    if key=='DENSITY-board': return ['EX-compact-board-1440','EX-compact-board-390']
    if key=='SIDEBAR-collapsed': return ['EX-collapsed-'+str(w) for w in [1440,900,640,390]]
    if key.startswith('BOUNDARY-'):
        w=key[9:]; return [r['id'] for r in extra['samples'] if r['id'].startswith('EX-boundary-') and r['id'].endswith('-'+w)]
    if key=='MOBILE-drawer': return ['EX-boundary-drawer-640']
    if key=='MOBILE-modal': return ['EX-boundary-modal-640']
    if key=='PR-SV-v1': return ['EX-saved-board-1440','EX-saved-table-1440','EX-saved-board-390','EX-saved-table-390']
    if key=='PR-05-calendar': return ['EX-project-week-1440','EX-project-week-390']
    if key=='PR-06-timeline': return ['EX-project-timeline-month-1440','EX-project-timeline-month-390']
    if key=='SC-12-base': return ['EX-timeline-month-1440','EX-timeline-month-390','EX-timeline-none-1440','EX-timeline-none-390']
    return []
leaf_overrides={
 'MD-02-project':('projects',['overview-default-create-light-1440','overview-default-create-light-390','overview-default-edit-light-1440','overview-default-edit-light-390']),
 'MD-03-share':('projects',['overview-default-share-light-1440','overview-default-share-light-390']),
 'MD-10-saveView':('projects',['overview-default-save-light-1440','overview-default-save-light-390']),
 'DR-01-side':('comments',['01-comments-top-light-1440','03-comments-top-light-390','02-comments-top-dark-1440','04-comments-top-dark-390']),
 'DR-02-full':('comments',['19-comments-full-light-1440']),
 'DR-03-activity':('comments',['13-activity-deep-light-1440','14-activity-deep-dark-1440','15-activity-deep-light-390','16-activity-deep-dark-390']),
 'DR-04-rich-text':('comments',['27-editor-top-light-1440','28-editor-top-light-390']),
 'DR-05-subtask':('comments',['21-sub-top-light-1440','22-sub-top-dark-1440','23-sub-top-light-390','24-sub-top-dark-390']),
 'DR-07-comment':('comments',['09-comments-deep-light-1440','10-comments-deep-dark-1440','11-comments-deep-light-390','12-comments-deep-dark-390']),
}
def both(prefix): return [prefix+'-1440',prefix+'-390']
specific_leaf={
 'MD-01-task':(legacy['detail'],['form-default-light-1440','form-default-light-390'],'Archived task-form content, plus current modal06 and native affected06; default-motion native glyph qualification is separate.'),
 'MD-04-invite':(legacy['people'],both('invite'),'Unchanged Invite form-body/controls; truthful demo footer/copy is qualified, not whole confirmation parity.'),
 'MD-05-confirm':('docs/poc/evidence/WU-05/verification.json',['modal-light-indigo-1440','modal-light-indigo-390','nested-light-indigo-1440','nested-light-indigo-390'],'Shared primitive/body geometry; exact current Archive/Projects/Teams native typed confirmations prove actual consumer controls. Registry prose is not asserted whole-image equal.'),
 'MD-06-prompt':(legacy['files'],both('rename'),'Whole natural File rename dialog reuses Prompt; registry Project prompt copy differs and is behavioral/owned-leaf coverage.'),
 'MD-07-shortcuts':('docs/poc/evidence/WU-18/attempts/overlay-leaves-02/report.json',['shortcuts-1440-light-all-base','shortcuts-390-light-all-base'],'Whole owning Shortcuts box; historical matching Linux leaf, not current whole Shell.'),
 'MD-08-team':(legacy['teams'],both('new'),'Selected qualified whole natural Team dialog; raw original failed aggregate stays failed.'),
 'MD-09-filePreview':(legacy['files'],both('preview-fig'),'Current selected File Preview owning box in closure22; canonical URL/native identity checked now.'),
 'DR-06-attachment':(legacy['detail'],['attachment-existing-light-1440','attachment-existing-light-390','attachment-uploading-light-1440','attachment-uploading-light-390'],'Shared attachment leaf plus current native rich cross-screen file identity; no whole attachment-scrolled registry equality claimed.'),
 'DR-08-nested-modal':('docs/poc/evidence/WU-05/verification.json',['nested-light-indigo-1440','nested-light-indigo-390'],'Nested primitive plus current native Drawer/confirmation ownership; not generic toolbar.'),
 'PO-create':(legacy['archive'],both('menu-create'),'Exact current-owned Shell menu, archived WU28 OS-reduce/phase0 scope.'),
 'PO-ws':(legacy['archive'],both('menu-workspace'),'Exact Shell workspace menu, archived WU28 OS-reduce/phase0 scope.'),
 'PO-user':(legacy['archive'],both('menu-profile'),'Exact Shell user menu, archived WU28 OS-reduce/phase0 scope.'),
 'PO-help':(legacy['archive'],both('menu-help'),'Exact Shell help menu, archived WU28 OS-reduce/phase0 scope.'),
 'PO-role':(legacy['people'],both('role-picker'),'Exact owning role popup; selected rows of old failed raw overlay report remain qualified.'),
 'PO-sort':(legacy['fields'],['sort-light-1000','sort-dark-1000'],'Toolbar plus owning popup clip.'),
 'PO-group':(legacy['fields'],['group-light-1000','group-dark-1000'],'Toolbar plus owning popup clip.'),
 'PO-cols':(legacy['fields'],['columns-light-1000','columns-dark-1000'],'Toolbar plus owning popup clip.'),
 'PO-filter':(legacy['fields'],['filter-empty-light-1000','filter-rows-light-1000','filter-expanded-light-1000','filter-empty-dark-1000','filter-rows-dark-1000','filter-expanded-dark-1000'],'Toolbar filter popup/submenu clips.'),
 'PO-fvals':(legacy['fields'],['filter-expanded-light-1000','filter-expanded-dark-1000'],'Toolbar expanded values popup clip.'),
 'PO-daylist':(legacy['calendar'],['workspace-month-overflow-today-ws1-comfortable-light-1440','workspace-month-overflow-today-ws1-comfortable-light-390'],'Calendar overflow/owning day-list leaf.'),
 'PO-event':(legacy['calendar'],['workspace-month-event-today-ws1-comfortable-light-1440'],'Calendar event popup owning leaf.'),
 'PO-emoji':(legacy['comments'],['33-reaction-deep-light-1440','34-reaction-deep-light-390'],'Drawer reaction/emoji owned leaf.'),
 'PO-ctx':(legacy['board'],['workspace-card-menu-comfortable-light-1440'],'Board context consumer leaf plus current six-context native Archive checks; different consumer geometry is explicit.'),
 'ST-toast':('docs/poc/evidence/WU-05/verification.json',['toast-light-indigo-1440','toast-dark-indigo-1440','toast-light-indigo-390'],'Shared toast primitive; current real native Undo/copy outcomes are separate.'),
 'MOBILE-nav':(legacy['shell'],['mobile-light-open-sidebar','mobile-dark-open-sidebar','mobile-collapsed-open-sidebar','mobile-light-bottomnav'],'Owned mobile Shell/navigation leaf plus current persisted-responsive native probe.'),
 'ST-task-validation':(legacy['detail'],['form-error-light-1440','form-error-light-390'],'Task form validation body; current native validation/recovery guards passed.'),
 'ST-bulk':(legacy['list'],['workspace-selected-comfortable-light-1200','workspace-selected-comfortable-light-390'],'Actual selected List bulk bar/body; canonical bulk commands and atomic Undo are current native assertions.'),
 'ST-loading':(legacy['archive'],both('states'),'Gallery loader primitive only. Current actual route/query pending→ready behavior is separately native-verified; no original Home-loading whole-image equality claimed.'),
 'ST-offline':(legacy['archive'],both('states'),'Gallery offline/error primitive only. Current scoped offline write/retry/reset behavior is native-verified; no original Home-offline whole-image equality claimed.'),
 'ST-project-denied':(legacy['archive'],both('full-denied'),'Current owned full error boundary; canonical denied route native assertions retain no Project tab/body leakage.'),
 'ST-project-missing':(legacy['archive'],both('full-not-found'),'Current owned full missing boundary; canonical invalid/missing route native assertions are separate.'),
}
for key in ['status','priority','assignee','labels','project','recur','estimate','deps','date','subassignee','pstatus','bulk-status','bulk-priority','bulk-assignee']:
    specific_leaf['PO-'+key]=('docs/poc/evidence/WU-05/verification.json',['menu-light-indigo-1440','menu-dark-indigo-1440','modal-popup-light-indigo-1440','drawer-popup-light-indigo-1440'],'Behavioral coverage by exact current named owner probes and shared controlled fields; generic menu geometry is a primitive leaf only, not a fabricated business-PO raster case.')
for key,ids in [('status',['table-status-0']),('priority',['table-priority-140']),('project',['table-project-max']),('date',['table-due-0','table-due-140','drawer-due-0'])]:
    specific_leaf['PO-'+key]=('docs/poc/evidence/WU-13/table-popovers/verification.json',ids,'Actual accepted shared Table/Drawer property popup surfaces; anchor/scroll consumer variants are explicit. Earlier List558/8814/pre-settlementDrawer560 remain failed.')
exact_native={
 'MD-05-confirm':['N28-02-demo-toast-confirm-keyboard','N28-05-archive-project-confirm-undo','N28-18-gallery-task-member-delete-undo'],
 'DR-08-nested-modal':['context-duplicate-archive-single-delete-confirmation-and-undo'],
 'ST-toast':['N28-02-demo-toast-confirm-keyboard'],
 'ST-offline':['N28-06-offline-write-retry','N28-12-scoped-offline-switch-and-reset'],
 'ST-loading':['real-route-loading-pending-to-ready'],
 'ST-bulk':['bulk-status-assignee-priority-no-Undo-exact-targets','bulk-delete-confirm-cancel-error-rollback-atomic-Undo'],
}
specific_native_groups={'MD-05-confirm':'archive','DR-08-nested-modal':'detail','ST-toast':'archive','ST-loading':'shell'}
registry=read('docs/poc/reference/scenario-registry.json')['scenarios']
items=[]
for item in registry:
    group=family(item); ids=current_ids(item['id']); exids=extra_ids(item['id'])
    rows=[(base_path,row) for row in base['samples'] if row['id'] in ids]+[(extra_path,row) for row in extra['samples'] if row['id'] in exids]
    visual=[dict(report=ref(path), caseId=row['id'], recordedStatus=row['status'], inputProjection=row.get('sourceInputProjection'), sourceTrigger=row.get('sourceTrigger'), configuration=row.get('configuration'), captures=row.get('captures'), visibleYear=row.get('visibleYear'), qualification='Actual --startup driver wins over inherited registry setup/settleRender prose. Failed originals are retained; exact selected closures are referenced separately.') for path,row in rows]
    key=item['id'];leafgroup, selected=leaf_overrides.get(key,(group,None)); leaf=legacy[leafgroup]; leafscope=None
    if key in specific_leaf: leaf,selected,leafscope=specific_leaf[key]
    if key.startswith('AU-'):
        screen=['login','signup','forgot','forgot-sent','reset','reset-done','verify'][int(key[3:5])-1]
        selected=[screen+'-base-1440',screen+'-base-390']
    if key.startswith('ON-'): selected=['step'+str(int(key[3:5])-1)+'-base-'+str(w) for w in [1440,390]]
    if key=='ST-auth-validation': selected=['login-invalid-1440','login-invalid-390']
    if key=='VW-inbox-selected': selected=['inbox-task-1440-light','inbox-task-390-light']
    if key=='MOBILE-auth': selected=[screen+'-base-390' for screen in ['login','signup','forgot','forgot-sent','reset','reset-done','verify']]
    available=[case_id(row) for row in case_rows(leaf)]
    selected=list(dict.fromkeys(selected or available))
    assert set(selected)<=set(available),(item['id'],selected,available)
    bridge=dict(report=ref(leaf), caseIds=selected, recordedReportStatus=read(leaf).get('status'), dependencyBridge=ref(OUT/'attempts/dependency-bridge-03/report.json'), historicalDialogBridge=ref(OUT/'attempts/historical-dialog-bridge-02-output/report.json') if item['id'] in ['MD-02-project','MD-03-share','MD-10-saveView'] else None, specificScope=leafscope, scope='Selected archived owned leaf/content/control case IDs. Dependency bridge03 is parent28→current; historical dialogs additionally use captured537→current branch diffs. This is not current whole assembled Shell or blanket equality of every registry state. Current affected canonical/native/date/motion/draft checks are separate.')
    ng=specific_native_groups.get(key,group); nativeids=exact_native.get(key,[c['id'] for c in N[ng]['cases']])
    assert set(nativeids)<=set(c['id'] for c in N[ng]['cases']),(key,nativeids)
    property_not_captured=key in ['PO-assignee','PO-labels','PO-recur','PO-estimate','PO-deps','PO-subassignee','PO-pstatus','PO-bulk-status','PO-bulk-priority','PO-bulk-assignee']
    motion_reports=[ref(OUT/'attempts'/name/'report.json') for name in ['home-motion-03','native-task-motion-03','native-timeline-motion-04','dashboard-motion-01','dashboard-motion-02','dashboard-project-motion-03','dashboard-countup-02']] if key.startswith('MOTION-') else []
    if motion_reports: bridge=None
    items.append(dict(id=key, registryFamily=item['family'], baselineTemplate=item, implementationOwners=[ref(p) for p in owner[group]], status='covered-candidate-for-technical-review', currentVisual=visual, archivedLeaf=bridge, propertySurfaceStatus='NOT_CAPTURED_PROPERTY_SURFACE; actual controlled-field/native behavior and shared primitive/body leaf reuse verified, not individual popup raster equality' if property_not_captured else None, motionEvidence=motion_reports, loadingHTTP=ref(OUT/'attempts/inbox-http-01/report.json') if key=='ST-loading' else None, nativeOwner=ng, nativeReport=N[ng]['report'], nativeCases=nativeids, result='Owned UI and selected actual owner behavior verified; visual scope and qualifications are explicit. Registry states are not multiplied into a fictitious total screen count.'))
assert len(items)==173 and len({row['id'] for row in items})==173
supplements=[str(OUT/'attempts'/name/'report.json') for name in ['files-list-closure-05','modal-current-06','extra-current-02','projection-bridge-01','projection-members-02','home-motion-03','native-task-motion-03','native-timeline-motion-04','dashboard-motion-01','dashboard-motion-02','dashboard-project-motion-03','dashboard-countup-02','task-form-entry-04','form-native-glyph-02','onboarding-glyph-closure-03','inbox-http-01','inbox-isolation-03','draft-lifetime-after-02']]
actual_supplements=[]
for p in supplements:
    actual_supplements.append(dict(report=ref(p), status=read(p).get('status')))
inventory_report=dict(status='candidate-awaiting-root-technical-review', inventory=items, counts=dict(registryStates=173,shellRoutes=21,projectTabs=8,settingsSections=21,authStates=7,onboardingSteps=6,modals=10,popovers=28), extraMatrix=[dict(id=row['id'],status=row['status'],setup=row['setup'],sourceTrigger=row.get('sourceTrigger'),visibleYear=row.get('visibleYear')) for row in extra['samples']], supplements=actual_supplements, qualification='Current143 and extra74 are settled tranches; AU/ON/DR/MD/PO and standalone leaf scopes have separate evidence. Source baseline173 Darwin remains unchanged and is not asserted current Linux/Darwin whole-project equality.')
actions=read('docs/poc/evidence/WU-28/action-assignments.json')
group_alias={'tasks':'detail','subtasks':'comments','list-toolbar':'list','sharing':'projects','inbox':'notifications','dev':'archive','shared-overlays':'archive','prompts':'files'}
action_rows=[]
for row in actions['assignments']:
    group=group_alias.get(row['group'],row['group']); current=N[group]
    action_rows.append(dict(source=row['source'],line=row['line'],dispatch=row['dispatch'],action=row['action'],owner=row['owner'],operations=row['operations'],sourceBoundary=row['boundary'],historicalEvidence=row['evidence'],currentOwnerFlow=current['report'],currentScenarioIds=[case['id'] for case in current['cases']],result='Actual selected native owner flow passed; this assignment-to-flow mapping is not a claim that each literal assignment received a separate browser invocation. Source-equivalent commands reuse the same controlled intent; critical inverses have their own exact ledger.',scope=current['scope']))
undo=[('actions431','completeTask','detail'),('actions493','archiveTask','detail'),('actions509','deleteTask','detail'),('actions901','deleteComment','comments'),('actions975','bulkDelete','list'),('actions1156','completeColumn','board'),('actions1170','archiveCompletedColumn','board'),('actions1364','archiveProject','projects'),('actions1402','deleteProject','projects'),('actions1655','deleteFile','files'),('actions/teams120','deleteTeam','teams'),('actions1482','removeProjectMember','projects'),('actions1586','removeWorkspaceMember','people'),('actions1816','previewUndo','archive')]
action_report=dict(status='candidate-native-owner-flows-and-14-undo-sites',sourceAssignments=232,uniqueDispatchActions=231,assignments=action_rows,undo=[dict(source=anchor,action=name,nativeReport=N[group]['report'],scenarioIds=[c['id'] for c in N[group]['cases']],authority='Canonical undoCommand' if index<11 else 'Sharing/People/local demo inverse; no canonical ACL/account restoration',result='Current selected native owner assertions passed; inspect exact named case before interpreting any action as backend behavior.') for index,(anchor,name,group) in enumerate(undo)],pendingIntegrationClosure='Settings/Files/Invite/Workspaces/Search/Signout/Archive/dev controls use completed typed owners in current23. Canonical Files URL replaces obsolete nested Drawer route retention. No future owner/backend feature was added.',nativeEventsAndKeyboard=ref('docs/poc/evidence/WU-28/ACTION_LEDGER.md'),qualification='232 literal/231 unique are inventory counts, not 232 native PASS claims. Select/mention/palette/context/typing/Escape/drag/native-file-boundary scopes remain exactly those recorded in current selected owner probes. Mock HTTP intercepts are not real backend.')
reuse=[('TaskList/fields',['list','detail','board','table','projects']),('Calendar3/Timeline2',['calendar','timeline','projects','list']),('Comments/shared workspace-task draft',['comments','notifications','detail']),('Files identity/art/attachments',['files','detail','search','projects']),('People identity/RolePicker',['people','fields','projects','workspace']),('Projects card/compact/status/catalog',['projects','dashboards','teams','shell']),('Activity shared item',['search','dashboards','projects','people']),('UI primitives and both galleries',['archive','shell','detail','settings'])]
R=[]
for name,groups in reuse:
    files=sorted(set(p for group in groups for p in owner[group])); imports=[]
    for p in files:
        lines=pathlib.Path(p).read_text().splitlines()
        imports.extend(dict(path=p,line=i+1,text=line) for i,line in enumerate(lines) if line.startswith('import '))
    R.append(dict(component=name,consumers=groups,imports=imports,files=[ref(p) for p in files],behavior=[N[g]['report'] for g in groups],qualification='Owned layout variants share canonical fields/renderers/intents; imports alone are not acceptance. Current named native flows and affected visual/date/motion/draft evidence accompany this graph.'))
reuse_report=dict(status='candidate',groups=R,dependencyBridge=ref(OUT/'attempts/dependency-bridge-03/report.json'),affectedComments=[ref(OUT/'attempts'/name/'report.json') for name in ['draft-lifetime-after-02','inbox-http-01','inbox-http-02','inbox-isolation-03']],boundaries=['Inbox Source has no attachment/mention popup; shared composer draft/post/reaction/delete/Undo contract is verified across canonical Drawer/Inbox.','Comment cache is scoped by workspace and task; title/description/subtask/scroll drafts retain the existing Drawer host.','Gallery controls render app UI primitives; readonly sample presentation fields remain local, service demos stay explicit.','No locked Source stylesheet/global mutable S store is imported into production.'])
OUTPUT.mkdir(parents=True,exist_ok=True)
for filename,value in [('NATIVE_INDEX.json',native_report),('INVENTORY_INDEX.json',inventory_report),('ACTION_INDEX.json',action_report),('REUSE_INDEX.json',reuse_report)]: write(OUTPUT/filename,value)
write(folder/'report.json',dict(status='generated-candidate-index',inventory=173,actions=len(action_rows),nativeOwners=len(N),undo=len(undo),outputs=[ref(OUTPUT/name) for name in ['NATIVE_INDEX.json','INVENTORY_INDEX.json','ACTION_INDEX.json','REUSE_INDEX.json']]))
print(json.dumps(dict(attempt=attempt,inventory=173,actions=len(action_rows),nativeOwners=len(N),undo=len(undo))))
