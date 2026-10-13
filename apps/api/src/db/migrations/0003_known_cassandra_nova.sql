CREATE TABLE `authIdentities` (
	`id` text PRIMARY KEY NOT NULL,
	`providerKey` text NOT NULL,
	`tenant` text NOT NULL,
	`subject` text NOT NULL,
	`userId` text NOT NULL,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "authIdentities_provider" CHECK("authIdentities"."providerKey" = 'ict24h-identity')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `authIdentities_external` ON `authIdentities` (`providerKey`,`tenant`,`subject`);--> statement-breakpoint
CREATE UNIQUE INDEX `authIdentities_id_user` ON `authIdentities` (`id`,`userId`);