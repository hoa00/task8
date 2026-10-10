# Shared Timeline

TimelinePage/Panel compose the existing toolbar, complete canonical overlap
loader, query cache, task-open intent, full Drawer/form and updateTask command.
TimelineView owns one rail/header/bar/milestone/dependency renderer for Workspace
and Project; Project remains a feature harness until WU16.

domain/timeline derives DateOnly ranges91/238days,32/11px day widths,36px rows,
inclusive bars, progress, forward/backward curves and same-day milestone lanes.
Timeline's internal equal-date presentation reverses incoming ordinal as the
source does; upstream API/cursor stable-ID comparators remain unchanged. Source
groupTasks receives a fresh due-filtered array, so dependency paint order always
follows original query records. Generalized25 source cases and all4groupings
prove these semantics without changing dates, positions or source templates.

Pointer drag includes scroll delta, duration-preserving rescheduleDateOnly,
60ms click suppression and cancellation cleanup. Existing operation invalidation
refetches real CAS conflicts before retry. Source ignores scroll delta and lacks
Escape/pointercancel cancellation; these contract corrections are explicit.
Source drag uses plain Moved toast without Undo. Existing Drawer completion Undo
uses the shared canonical operation. Dependencies never auto-reschedule.

UI scroll positions belong to Panel and remain isolated by workspace/scope/zoom
across loading/zoom/refetch. Actual Workspace view follows Router search on
Back/Forward. No server-state/task store is added.

WU15 comparisons accept full visible renderer clips, including4 actual Workspace
route cases, not the entire toolbar/page/AppShell. All inherited unaccepted
raster debts remain in VISUAL_PARITY. Source raw outside-range behavior is kept
before the contract's explicit overlap input correction. Milestones use all-date
authorized canonical Project.milestones from Bootstrap, matching source.
