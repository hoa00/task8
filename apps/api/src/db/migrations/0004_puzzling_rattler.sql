CREATE TABLE `authSessions` (
	`id` text PRIMARY KEY NOT NULL,
	`sidHash` text NOT NULL,
	`identityId` text NOT NULL,
	`userId` text NOT NULL,
	`accessCiphertext` text,
	`refreshCiphertext` text,
	`accessExpiresAt` integer NOT NULL,
	`refreshExpiresAt` integer NOT NULL,
	`expiresAt` integer NOT NULL,
	`tokenVersion` integer NOT NULL,
	`authGeneration` integer NOT NULL,
	`createdAt` integer NOT NULL,
	`revokedAt` integer,
	FOREIGN KEY (`identityId`,`userId`) REFERENCES `authIdentities`(`id`,`userId`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "authSessions_version" CHECK("authSessions"."tokenVersion" > 0 AND "authSessions"."authGeneration" > 0),
	CONSTRAINT "authSessions_credential_state" CHECK(("authSessions"."revokedAt" IS NULL AND "authSessions"."accessCiphertext" IS NOT NULL AND "authSessions"."refreshCiphertext" IS NOT NULL) OR ("authSessions"."revokedAt" IS NOT NULL AND "authSessions"."accessCiphertext" IS NULL AND "authSessions"."refreshCiphertext" IS NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `authSessions_sidHash` ON `authSessions` (`sidHash`);--> statement-breakpoint
CREATE INDEX `authSessions_expiry` ON `authSessions` (`expiresAt`,`id`);