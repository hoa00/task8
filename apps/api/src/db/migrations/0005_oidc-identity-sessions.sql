CREATE TABLE `oidcAppSessions` (
	`id` text PRIMARY KEY NOT NULL,
	`sidHash` text NOT NULL,
	`linkId` text NOT NULL,
	`userId` text NOT NULL,
	`issuer` text NOT NULL,
	`subject` text NOT NULL,
	`clientId` text NOT NULL,
	`providerSid` text NOT NULL,
	`bundle` text NOT NULL,
	`createdAt` integer NOT NULL,
	`expiresAt` integer NOT NULL,
	`authorityValidatedAt` integer NOT NULL,
	`accessExpiresAt` integer NOT NULL,
	`revokedAt` integer,
	`revision` integer DEFAULT 1 NOT NULL,
	`leaseOwner` text,
	`leaseUntil` integer DEFAULT 0 NOT NULL,
	`refreshInput` text,
	`refreshAttemptAt` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`linkId`,`userId`,`issuer`,`subject`) REFERENCES `oidcIdentityLinks`(`id`,`userId`,`issuer`,`subject`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "oidcAppSessions_lifetime" CHECK("oidcAppSessions"."expiresAt"="oidcAppSessions"."createdAt"+28800000 AND "oidcAppSessions"."revision">0),
	CONSTRAINT "oidcAppSessions_refresh" CHECK(("oidcAppSessions"."refreshInput" IS NULL AND "oidcAppSessions"."refreshAttemptAt"=0) OR ("oidcAppSessions"."refreshInput" IS NOT NULL AND "oidcAppSessions"."refreshAttemptAt">0))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `oidcAppSessions_sidHash` ON `oidcAppSessions` (`sidHash`);--> statement-breakpoint
CREATE INDEX `oidcAppSessions_expiry` ON `oidcAppSessions` (`expiresAt`,`id`);--> statement-breakpoint
CREATE TABLE `oidcIdentityLinks` (
	`id` text PRIMARY KEY NOT NULL,
	`issuer` text NOT NULL,
	`subject` text NOT NULL,
	`userId` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`createdAt` integer NOT NULL,
	`createdBy` text NOT NULL,
	`migrationBatchId` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "oidcIdentityLinks_status" CHECK("oidcIdentityLinks"."status" IN ('active','revoked')),
	CONSTRAINT "oidcIdentityLinks_subject" CHECK(length("oidcIdentityLinks"."subject") BETWEEN 1 AND 255),
	CONSTRAINT "oidcIdentityLinks_revision" CHECK("oidcIdentityLinks"."revision">0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `oidcIdentityLinks_external` ON `oidcIdentityLinks` (`issuer`,`subject`);--> statement-breakpoint
CREATE UNIQUE INDEX `oidcIdentityLinks_user_issuer` ON `oidcIdentityLinks` (`issuer`,`userId`);--> statement-breakpoint
CREATE UNIQUE INDEX `oidcIdentityLinks_binding` ON `oidcIdentityLinks` (`id`,`userId`,`issuer`,`subject`);