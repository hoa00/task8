CREATE TABLE `activity` (
	`id` text PRIMARY KEY NOT NULL,
	`workspaceId` text NOT NULL,
	`projectId` text,
	`taskId` text,
	`actorId` text,
	`eventType` text NOT NULL,
	`payloadJson` text NOT NULL,
	`commandId` text,
	`revertedAt` integer,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`workspaceId`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspaceId`,`projectId`) REFERENCES `projects`(`workspaceId`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspaceId`,`taskId`) REFERENCES `tasks`(`workspaceId`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspaceId`,`actorId`) REFERENCES `workspaceMembers`(`workspaceId`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "activity_payload" CHECK(json_valid("activity"."payloadJson"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `activity_workspace_id` ON `activity` (`workspaceId`,`id`);--> statement-breakpoint
CREATE INDEX `activity_project` ON `activity` (`workspaceId`,`projectId`,`createdAt`,`id`);--> statement-breakpoint
CREATE INDEX `activity_task` ON `activity` (`workspaceId`,`taskId`,`createdAt`,`id`);--> statement-breakpoint
CREATE TABLE `calendarEvents` (
	`id` text PRIMARY KEY NOT NULL,
	`workspaceId` text NOT NULL,
	`projectId` text NOT NULL,
	`title` text NOT NULL,
	`date` text NOT NULL,
	`localTime` text NOT NULL,
	`timezone` text NOT NULL,
	FOREIGN KEY (`workspaceId`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspaceId`,`projectId`) REFERENCES `projects`(`workspaceId`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `calendarEvents_workspace_id` ON `calendarEvents` (`workspaceId`,`id`);--> statement-breakpoint
CREATE TABLE `commandUndoRecords` (
	`id` text PRIMARY KEY NOT NULL,
	`workspaceId` text NOT NULL,
	`actorMemberId` text NOT NULL,
	`kind` text NOT NULL,
	`payloadVersion` integer NOT NULL,
	`payloadJson` text NOT NULL,
	`createdAt` integer NOT NULL,
	`consumedAt` integer,
	`resultJson` text,
	FOREIGN KEY (`workspaceId`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspaceId`,`actorMemberId`) REFERENCES `workspaceMembers`(`workspaceId`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "kind_enum" CHECK("commandUndoRecords"."kind" IN ('task.complete','task.archive','task.delete','project.archive','project.delete','comment.delete','file.delete','tasks.bulkDelete','tasks.completeColumn','tasks.archiveCompletedColumn','team.delete')),
	CONSTRAINT "undo_payload" CHECK("commandUndoRecords"."payloadVersion" = 1 AND json_valid("commandUndoRecords"."payloadJson") AND length(CAST("commandUndoRecords"."payloadJson" AS BLOB)) <= 65536 AND coalesce(json_type("commandUndoRecords"."payloadJson", '$.targets'), '') = 'array' AND coalesce(json_array_length("commandUndoRecords"."payloadJson", '$.targets'), -1) BETWEEN CASE WHEN "commandUndoRecords"."kind" = 'tasks.archiveCompletedColumn' THEN 0 ELSE 1 END AND 128 AND coalesce(json_extract("commandUndoRecords"."payloadJson", '$.kind'), '') = "commandUndoRecords"."kind"),
	CONSTRAINT "undo_consumed" CHECK(("commandUndoRecords"."consumedAt" IS NULL) = ("commandUndoRecords"."resultJson" IS NULL)),
	CONSTRAINT "undo_result" CHECK("commandUndoRecords"."resultJson" IS NULL OR json_valid("commandUndoRecords"."resultJson"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `commandUndoRecords_workspace_id` ON `commandUndoRecords` (`workspaceId`,`id`);--> statement-breakpoint
CREATE INDEX `undo_actor` ON `commandUndoRecords` (`workspaceId`,`actorMemberId`,`id`);--> statement-breakpoint
CREATE TABLE `commentReactions` (
	`workspaceId` text NOT NULL,
	`commentId` text NOT NULL,
	`memberId` text NOT NULL,
	`reactionKey` text NOT NULL,
	`createdAt` integer NOT NULL,
	PRIMARY KEY(`commentId`, `memberId`, `reactionKey`),
	FOREIGN KEY (`workspaceId`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspaceId`,`commentId`) REFERENCES `comments`(`workspaceId`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspaceId`,`memberId`) REFERENCES `workspaceMembers`(`workspaceId`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "reactionKey_enum" CHECK("commentReactions"."reactionKey" IN ('👍','🎉','❤️','👀','🚀','✅'))
);
--> statement-breakpoint
CREATE TABLE `comments` (
	`id` text PRIMARY KEY NOT NULL,
	`workspaceId` text NOT NULL,
	`taskId` text NOT NULL,
	`authorId` text NOT NULL,
	`bodyText` text NOT NULL,
	`mentionedMemberIdsJson` text NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`deletedAt` integer,
	`deletedBy` text,
	`version` integer DEFAULT 1 NOT NULL,
	`lastMutationId` text,
	FOREIGN KEY (`workspaceId`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspaceId`,`taskId`) REFERENCES `tasks`(`workspaceId`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspaceId`,`authorId`) REFERENCES `workspaceMembers`(`workspaceId`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspaceId`,`deletedBy`) REFERENCES `workspaceMembers`(`workspaceId`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "comments_mentions" CHECK(json_valid("comments"."mentionedMemberIdsJson") AND json_type("comments"."mentionedMemberIdsJson") = 'array'),
	CONSTRAINT "comments_tombstone" CHECK(("comments"."deletedAt" IS NULL) = ("comments"."deletedBy" IS NULL)),
	CONSTRAINT "comments_version" CHECK("comments"."version" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `comments_workspace_id` ON `comments` (`workspaceId`,`id`);--> statement-breakpoint
CREATE INDEX `comments_task` ON `comments` (`workspaceId`,`taskId`,`createdAt`,`id`);--> statement-breakpoint
CREATE TABLE `files` (
	`id` text PRIMARY KEY NOT NULL,
	`workspaceId` text NOT NULL,
	`projectId` text NOT NULL,
	`taskId` text,
	`name` text NOT NULL,
	`fileType` text NOT NULL,
	`mimeType` text,
	`sizeBytes` integer,
	`displaySize` text NOT NULL,
	`storageMode` text NOT NULL,
	`objectKey` text,
	`contentSha256` text,
	`uploadRequestId` text,
	`uploadRequestHash` text,
	`createdBy` text NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`deletedAt` integer,
	`deletedBy` text,
	`version` integer DEFAULT 1 NOT NULL,
	`lastMutationId` text,
	FOREIGN KEY (`workspaceId`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspaceId`,`projectId`) REFERENCES `projects`(`workspaceId`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspaceId`,`taskId`) REFERENCES `tasks`(`workspaceId`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspaceId`,`createdBy`) REFERENCES `workspaceMembers`(`workspaceId`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspaceId`,`deletedBy`) REFERENCES `workspaceMembers`(`workspaceId`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "storageMode_enum" CHECK("files"."storageMode" IN ('sample','r2')),
	CONSTRAINT "files_request" CHECK(("files"."uploadRequestId" IS NULL) = ("files"."uploadRequestHash" IS NULL)),
	CONSTRAINT "files_r2" CHECK("files"."storageMode" != 'r2' OR ("files"."objectKey" IS NOT NULL AND "files"."contentSha256" IS NOT NULL AND "files"."mimeType" IS NOT NULL AND "files"."sizeBytes" IS NOT NULL AND "files"."sizeBytes" BETWEEN 0 AND 10485760)),
	CONSTRAINT "files_size" CHECK("files"."sizeBytes" IS NULL OR "files"."sizeBytes" >= 0),
	CONSTRAINT "files_tombstone" CHECK(("files"."deletedAt" IS NULL) = ("files"."deletedBy" IS NULL)),
	CONSTRAINT "files_version" CHECK("files"."version" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `files_workspace_id` ON `files` (`workspaceId`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `files_upload_request` ON `files` (`workspaceId`,`createdBy`,`uploadRequestId`);--> statement-breakpoint
CREATE INDEX `files_project` ON `files` (`workspaceId`,`projectId`,`deletedAt`,`createdAt`,`id`);--> statement-breakpoint
CREATE TABLE `memberPreferences` (
	`workspaceId` text NOT NULL,
	`memberId` text PRIMARY KEY NOT NULL,
	`preferencesJson` text NOT NULL,
	`notificationPreferencesJson` text NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`workspaceId`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspaceId`,`memberId`) REFERENCES `workspaceMembers`(`workspaceId`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "preferences_json" CHECK(json_valid("memberPreferences"."preferencesJson") AND json_valid("memberPreferences"."notificationPreferencesJson"))
);
--> statement-breakpoint
CREATE TABLE `memberProjectOrder` (
	`workspaceId` text NOT NULL,
	`memberId` text NOT NULL,
	`projectId` text NOT NULL,
	`position` integer NOT NULL,
	PRIMARY KEY(`memberId`, `projectId`),
	FOREIGN KEY (`workspaceId`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspaceId`,`memberId`) REFERENCES `workspaceMembers`(`workspaceId`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspaceId`,`projectId`) REFERENCES `projects`(`workspaceId`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`workspaceId` text NOT NULL,
	`recipientId` text NOT NULL,
	`actorId` text,
	`projectId` text,
	`taskId` text,
	`type` text NOT NULL,
	`text` text NOT NULL,
	`snippet` text NOT NULL,
	`createdAt` integer NOT NULL,
	`readAt` integer,
	FOREIGN KEY (`workspaceId`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspaceId`,`recipientId`) REFERENCES `workspaceMembers`(`workspaceId`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspaceId`,`actorId`) REFERENCES `workspaceMembers`(`workspaceId`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspaceId`,`projectId`) REFERENCES `projects`(`workspaceId`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspaceId`,`taskId`) REFERENCES `tasks`(`workspaceId`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "type_enum" CHECK("notifications"."type" IN ('mention','assign','comment','due','update'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notifications_workspace_id` ON `notifications` (`workspaceId`,`id`);--> statement-breakpoint
CREATE INDEX `notifications_recipient` ON `notifications` (`workspaceId`,`recipientId`,`readAt`,`createdAt`,`id`);--> statement-breakpoint
CREATE TABLE `projectFavorites` (
	`workspaceId` text NOT NULL,
	`memberId` text NOT NULL,
	`projectId` text NOT NULL,
	`createdAt` integer NOT NULL,
	PRIMARY KEY(`memberId`, `projectId`),
	FOREIGN KEY (`workspaceId`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspaceId`,`memberId`) REFERENCES `workspaceMembers`(`workspaceId`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspaceId`,`projectId`) REFERENCES `projects`(`workspaceId`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `projectMembers` (
	`workspaceId` text NOT NULL,
	`projectId` text NOT NULL,
	`memberId` text NOT NULL,
	`permission` text NOT NULL,
	PRIMARY KEY(`projectId`, `memberId`),
	FOREIGN KEY (`workspaceId`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspaceId`,`projectId`) REFERENCES `projects`(`workspaceId`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspaceId`,`memberId`) REFERENCES `workspaceMembers`(`workspaceId`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "permission_enum" CHECK("projectMembers"."permission" IN ('edit','view'))
);
--> statement-breakpoint
CREATE TABLE `projectMilestones` (
	`id` text PRIMARY KEY NOT NULL,
	`workspaceId` text NOT NULL,
	`projectId` text NOT NULL,
	`name` text NOT NULL,
	`date` text NOT NULL,
	`position` integer NOT NULL,
	FOREIGN KEY (`workspaceId`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspaceId`,`projectId`) REFERENCES `projects`(`workspaceId`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `projectMilestones_workspace_id` ON `projectMilestones` (`workspaceId`,`id`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`workspaceId` text NOT NULL,
	`key` text NOT NULL,
	`taskSequence` integer NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`icon` text NOT NULL,
	`color` text NOT NULL,
	`status` text NOT NULL,
	`teamId` text,
	`leadId` text NOT NULL,
	`startDate` text,
	`dueDate` text,
	`visibility` text NOT NULL,
	`lastActivityAt` integer NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`archivedAt` integer,
	`deletedAt` integer,
	`deletedBy` text,
	`version` integer DEFAULT 1 NOT NULL,
	`lastMutationId` text,
	FOREIGN KEY (`workspaceId`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspaceId`,`teamId`) REFERENCES `teams`(`workspaceId`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspaceId`,`leadId`) REFERENCES `workspaceMembers`(`workspaceId`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspaceId`,`deletedBy`) REFERENCES `workspaceMembers`(`workspaceId`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "status_enum" CHECK("projects"."status" IN ('planning','active','risk','hold','complete')),
	CONSTRAINT "visibility_enum" CHECK("projects"."visibility" IN ('workspace','private')),
	CONSTRAINT "projects_dates" CHECK("projects"."startDate" IS NULL OR "projects"."dueDate" IS NULL OR "projects"."startDate" <= "projects"."dueDate"),
	CONSTRAINT "projects_sequence" CHECK("projects"."taskSequence" >= 0),
	CONSTRAINT "projects_tombstone" CHECK(("projects"."deletedAt" IS NULL) = ("projects"."deletedBy" IS NULL)),
	CONSTRAINT "projects_version" CHECK("projects"."version" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `projects_workspace_id` ON `projects` (`workspaceId`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `projects_key` ON `projects` (`workspaceId`,`key`);--> statement-breakpoint
CREATE INDEX `projects_navigation` ON `projects` (`workspaceId`,`archivedAt`,`deletedAt`,`lastActivityAt`,`id`);--> statement-breakpoint
CREATE INDEX `projects_team` ON `projects` (`workspaceId`,`teamId`,`id`);--> statement-breakpoint
CREATE TABLE `savedViews` (
	`id` text PRIMARY KEY NOT NULL,
	`workspaceId` text NOT NULL,
	`projectId` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`filtersJson` text NOT NULL,
	`createdBy` text NOT NULL,
	`position` integer NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`lastMutationId` text,
	FOREIGN KEY (`workspaceId`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspaceId`,`projectId`) REFERENCES `projects`(`workspaceId`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspaceId`,`createdBy`) REFERENCES `workspaceMembers`(`workspaceId`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "type_enum" CHECK("savedViews"."type" IN ('list','board','table')),
	CONSTRAINT "views_filters" CHECK(json_valid("savedViews"."filtersJson")),
	CONSTRAINT "savedViews_version" CHECK("savedViews"."version" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `savedViews_workspace_id` ON `savedViews` (`workspaceId`,`id`);--> statement-breakpoint
CREATE INDEX `savedViews_project` ON `savedViews` (`workspaceId`,`projectId`,`position`,`id`);--> statement-breakpoint
CREATE TABLE `subtasks` (
	`id` text PRIMARY KEY NOT NULL,
	`workspaceId` text NOT NULL,
	`taskId` text NOT NULL,
	`title` text NOT NULL,
	`done` integer NOT NULL,
	`assigneeId` text,
	`dueDate` text,
	`note` text NOT NULL,
	`position` integer NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`workspaceId`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspaceId`,`taskId`) REFERENCES `tasks`(`workspaceId`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspaceId`,`assigneeId`) REFERENCES `workspaceMembers`(`workspaceId`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "subtasks_done" CHECK("subtasks"."done" IN (0,1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `subtasks_workspace_id` ON `subtasks` (`workspaceId`,`id`);--> statement-breakpoint
CREATE INDEX `subtasks_task` ON `subtasks` (`workspaceId`,`taskId`,`position`,`id`);--> statement-breakpoint
CREATE TABLE `taskDependencies` (
	`workspaceId` text NOT NULL,
	`taskId` text NOT NULL,
	`dependsOnTaskId` text NOT NULL,
	PRIMARY KEY(`taskId`, `dependsOnTaskId`),
	FOREIGN KEY (`workspaceId`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspaceId`,`taskId`) REFERENCES `tasks`(`workspaceId`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspaceId`,`dependsOnTaskId`) REFERENCES `tasks`(`workspaceId`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "dependency_self" CHECK("taskDependencies"."taskId" != "taskDependencies"."dependsOnTaskId")
);
--> statement-breakpoint
CREATE INDEX `dependency_incoming` ON `taskDependencies` (`workspaceId`,`dependsOnTaskId`,`taskId`);--> statement-breakpoint
CREATE TABLE `taskFavorites` (
	`workspaceId` text NOT NULL,
	`memberId` text NOT NULL,
	`taskId` text NOT NULL,
	`createdAt` integer NOT NULL,
	PRIMARY KEY(`memberId`, `taskId`),
	FOREIGN KEY (`workspaceId`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspaceId`,`memberId`) REFERENCES `workspaceMembers`(`workspaceId`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspaceId`,`taskId`) REFERENCES `tasks`(`workspaceId`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `taskLabels` (
	`workspaceId` text NOT NULL,
	`taskId` text NOT NULL,
	`labelId` text NOT NULL,
	PRIMARY KEY(`taskId`, `labelId`),
	FOREIGN KEY (`workspaceId`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspaceId`,`taskId`) REFERENCES `tasks`(`workspaceId`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "labelId_enum" CHECK("taskLabels"."labelId" IN ('design','frontend','backend','research','content','bug','qa','growth'))
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`workspaceId` text NOT NULL,
	`projectId` text NOT NULL,
	`number` integer NOT NULL,
	`title` text NOT NULL,
	`descriptionHtml` text NOT NULL,
	`descriptionText` text NOT NULL,
	`status` text NOT NULL,
	`priority` text NOT NULL,
	`assigneeId` text,
	`startDate` text,
	`dueDate` text,
	`estimate` text,
	`recurrence` text,
	`position` integer NOT NULL,
	`completedAt` integer,
	`previousStatus` text,
	`recurrenceSourceTaskId` text,
	`cancelledByUndoId` text,
	`createdBy` text NOT NULL,
	`createRequestId` text,
	`createRequestHash` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`archivedAt` integer,
	`deletedAt` integer,
	`deletedBy` text,
	`version` integer DEFAULT 1 NOT NULL,
	`lastMutationId` text,
	FOREIGN KEY (`workspaceId`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recurrenceSourceTaskId`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspaceId`,`projectId`) REFERENCES `projects`(`workspaceId`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspaceId`,`assigneeId`) REFERENCES `workspaceMembers`(`workspaceId`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspaceId`,`createdBy`) REFERENCES `workspaceMembers`(`workspaceId`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspaceId`,`recurrenceSourceTaskId`) REFERENCES `tasks`(`workspaceId`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspaceId`,`cancelledByUndoId`) REFERENCES `commandUndoRecords`(`workspaceId`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspaceId`,`deletedBy`) REFERENCES `workspaceMembers`(`workspaceId`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "status_enum" CHECK("tasks"."status" IN ('backlog','todo','progress','review','done')),
	CONSTRAINT "priority_enum" CHECK("tasks"."priority" IN ('urgent','high','medium','low','none')),
	CONSTRAINT "tasks_dates" CHECK("tasks"."startDate" IS NULL OR "tasks"."dueDate" IS NULL OR "tasks"."startDate" <= "tasks"."dueDate"),
	CONSTRAINT "tasks_completed" CHECK(("tasks"."status" = 'done') = ("tasks"."completedAt" IS NOT NULL)),
	CONSTRAINT "tasks_request" CHECK(("tasks"."createRequestId" IS NULL) = ("tasks"."createRequestHash" IS NULL)),
	CONSTRAINT "tasks_cancelled" CHECK("tasks"."cancelledByUndoId" IS NULL OR ("tasks"."deletedAt" IS NOT NULL AND "tasks"."deletedBy" IS NOT NULL AND "tasks"."recurrenceSourceTaskId" IS NULL)),
	CONSTRAINT "recurrence_enum" CHECK("tasks"."recurrence" IN ('daily','weekly','biweekly','monthly')),
	CONSTRAINT "estimate_enum" CHECK("tasks"."estimate" IN ('30m','1h','2h','4h','1d','2d','3d','5d','8d')),
	CONSTRAINT "previousStatus_enum" CHECK("tasks"."previousStatus" IN ('backlog','todo','progress','review','done')),
	CONSTRAINT "tasks_tombstone" CHECK(("tasks"."deletedAt" IS NULL) = ("tasks"."deletedBy" IS NULL)),
	CONSTRAINT "tasks_version" CHECK("tasks"."version" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tasks_workspace_id` ON `tasks` (`workspaceId`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `tasks_number` ON `tasks` (`projectId`,`number`);--> statement-breakpoint
CREATE UNIQUE INDEX `tasks_recurrence` ON `tasks` (`workspaceId`,`recurrenceSourceTaskId`);--> statement-breakpoint
CREATE UNIQUE INDEX `tasks_create_request` ON `tasks` (`workspaceId`,`createdBy`,`createRequestId`);--> statement-breakpoint
CREATE INDEX `tasks_project` ON `tasks` (`workspaceId`,`projectId`,`archivedAt`,`deletedAt`,`position`,`id`);--> statement-breakpoint
CREATE INDEX `tasks_assignee` ON `tasks` (`workspaceId`,`assigneeId`,`archivedAt`,`deletedAt`,`dueDate`,`id`);--> statement-breakpoint
CREATE INDEX `tasks_due` ON `tasks` (`workspaceId`,`dueDate`,`id`);--> statement-breakpoint
CREATE TABLE `teams` (
	`id` text PRIMARY KEY NOT NULL,
	`workspaceId` text NOT NULL,
	`name` text NOT NULL,
	`nameNormalized` text NOT NULL,
	`description` text NOT NULL,
	`icon` text NOT NULL,
	`color` text NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`deletedAt` integer,
	`deletedBy` text,
	`version` integer DEFAULT 1 NOT NULL,
	`lastMutationId` text,
	FOREIGN KEY (`workspaceId`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspaceId`,`deletedBy`) REFERENCES `workspaceMembers`(`workspaceId`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "teams_tombstone" CHECK(("teams"."deletedAt" IS NULL) = ("teams"."deletedBy" IS NULL)),
	CONSTRAINT "teams_version" CHECK("teams"."version" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `teams_workspace_id` ON `teams` (`workspaceId`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `teams_active_name` ON `teams` (`workspaceId`,`nameNormalized`) WHERE "teams"."deletedAt" IS NULL;--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`emailNormalized` text NOT NULL,
	`displayEmail` text NOT NULL,
	`title` text NOT NULL,
	`avatarColor` text NOT NULL,
	`timezone` text NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`lastMutationId` text,
	CONSTRAINT "users_version" CHECK("users"."version" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email` ON `users` (`emailNormalized`);--> statement-breakpoint
CREATE TABLE `workspaceMembers` (
	`id` text PRIMARY KEY NOT NULL,
	`workspaceId` text NOT NULL,
	`userId` text NOT NULL,
	`role` text NOT NULL,
	`status` text NOT NULL,
	`teamId` text,
	`lastSeenAt` integer,
	`removedAt` integer,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`lastMutationId` text,
	FOREIGN KEY (`workspaceId`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`teamId`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspaceId`,`teamId`) REFERENCES `teams`(`workspaceId`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "role_enum" CHECK("workspaceMembers"."role" IN ('Owner','Admin','Member','Guest')),
	CONSTRAINT "status_enum" CHECK("workspaceMembers"."status" IN ('active','invited')),
	CONSTRAINT "workspaceMembers_version" CHECK("workspaceMembers"."version" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspaceMembers_workspace_id` ON `workspaceMembers` (`workspaceId`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `members_workspace_user` ON `workspaceMembers` (`workspaceId`,`userId`);--> statement-breakpoint
CREATE INDEX `members_team` ON `workspaceMembers` (`workspaceId`,`teamId`,`id`);--> statement-breakpoint
CREATE TABLE `workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`iconColor` text NOT NULL,
	`brand` integer NOT NULL,
	`timezone` text NOT NULL,
	`planLabel` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`lastMutationId` text,
	CONSTRAINT "workspaces_brand" CHECK("workspaces"."brand" IN (0,1)),
	CONSTRAINT "workspaces_version" CHECK("workspaces"."version" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspaces_slug` ON `workspaces` (`slug`);