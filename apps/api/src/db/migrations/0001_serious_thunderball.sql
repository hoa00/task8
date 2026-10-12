-- BR-07A: derived read keys only; preserve every existing row, FK and Wrangler ledger.
ALTER TABLE `users` ADD `readKeys` text DEFAULT '{}' NOT NULL CONSTRAINT `users_readKeys` CHECK(json_valid(`readKeys`));
--> statement-breakpoint
ALTER TABLE `projects` ADD `readKeys` text DEFAULT '{}' NOT NULL CONSTRAINT `projects_readKeys` CHECK(json_valid(`readKeys`));
--> statement-breakpoint
ALTER TABLE `tasks` ADD `readKeys` text DEFAULT '{}' NOT NULL CONSTRAINT `tasks_readKeys` CHECK(json_valid(`readKeys`));
--> statement-breakpoint
ALTER TABLE `files` ADD `readKeys` text DEFAULT '{}' NOT NULL CONSTRAINT `files_readKeys` CHECK(json_valid(`readKeys`));
--> statement-breakpoint
ALTER TABLE `comments` ADD `readKeys` text DEFAULT '{}' NOT NULL CONSTRAINT `comments_readKeys` CHECK(json_valid(`readKeys`));
