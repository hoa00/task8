# Shared Calendar

CalendarView is controlled and has one Month/Week/chip/overflow renderer for
Workspace, Project and My Tasks. CalendarPanel consumes canonical full cursor
due-range data; a second complete query supplies the source full-filtered-scope
project legend. Both use tasks cache invalidation. Events are read-only and obey
project access/filter semantics; My Tasks does not display events.

DateOnly geometry and duration rescheduling belong to domain/calendar. Native
drag uses existing updateTask and source plain toast without Undo. Day add seeds
the existing full TaskFormDialog with TaskFormDefaults; pending/recovery payloads
retain their original identity. Drawer, fields and overlays are shared owners.

Source geometry retains35/42 cells, min-height640, explicit minmax112 rows and
<=640 mobile bars/stacked Week. At641 the full legend covers the mode control
pointer center as in source; trusted pointer limitation and keyboard success are
recorded. QUIRK-02 overflow uses the same complete scoped/filter/auth dataset
as chips; raw source leakage diagnostics and corrected source fixtures remain
separate in WU14 evidence. Project full wrapper remains WU16.

Required source comparison explicitly runs42 Calendar cases. Two mobile supplemental
actual page content pairs are strict0; both desktop whole-content search-corner0/5
variants remain unaccepted debt for M2/full parity/WU29, with failed whole-content audits
and PNG/style/native diagnostics retained. Image parity is not a whole-app claim.

MyTasks390 also retains the original Week-mode center overlap with the weekday
header; trusted pointer leaves Month and native keyboard opens Week. Image
acceptance does not imply every mobile mode-pointer control works.
