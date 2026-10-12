CREATE INDEX `activity_visible_history` ON `activity` (`workspaceId`,`revertedAt`,`createdAt`,`id`);--> statement-breakpoint
CREATE INDEX `comments_visible_history` ON `comments` (`workspaceId`,`taskId`,`deletedAt`,`createdAt`,`id`);--> statement-breakpoint
CREATE INDEX `files_page_name` ON `files` (`workspaceId`,`projectId`,`deletedAt`,("readKeys" ->> '$.name.locale'),`id`);--> statement-breakpoint
CREATE INDEX `files_page_type` ON `files` (`workspaceId`,`projectId`,`deletedAt`,("readKeys" ->> '$.fileType.locale'),`id`);--> statement-breakpoint
CREATE INDEX `files_page_recent` ON `files` (`workspaceId`,`projectId`,`deletedAt`,(-"createdAt"),`id`);--> statement-breakpoint
CREATE INDEX `files_page_size` ON `files` (`workspaceId`,`projectId`,`deletedAt`,(CASE WHEN "sizeBytes" IS NULL THEN 1 ELSE -"sizeBytes" END),`id`);--> statement-breakpoint
CREATE INDEX `notifications_recipient_history` ON `notifications` (`workspaceId`,`recipientId`,`createdAt`,`id`);--> statement-breakpoint
CREATE INDEX `projects_catalog_name` ON `projects` (`workspaceId`,`deletedAt`,("readKeys" ->> '$.name.locale'),`id`) WHERE "projects"."archivedAt" IS NULL OR "projects"."archivedAt"=0;--> statement-breakpoint
CREATE INDEX `tasks_active_manual` ON `tasks` (`workspaceId`,`deletedAt`,`archivedAt`,`position`,`id`);--> statement-breakpoint
CREATE INDEX `tasks_active_title` ON `tasks` (`workspaceId`,`deletedAt`,`archivedAt`,("readKeys" ->> '$.title.foldedUtf16'),`id`);