CREATE TABLE `oidcLinkAudit` (
	`id` text PRIMARY KEY NOT NULL,
	`manifestId` text NOT NULL,
	`entryId` text NOT NULL,
	`linkId` text NOT NULL,
	`kind` text NOT NULL,
	`actor` text NOT NULL,
	`correlation` text NOT NULL,
	`beforeRevision` integer NOT NULL,
	`afterRevision` integer NOT NULL,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`linkId`) REFERENCES `oidcIdentityLinks`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "oidcLinkAudit_kind" CHECK("oidcLinkAudit"."kind" IN ('apply','revoke','rollback'))
);
--> statement-breakpoint
CREATE TABLE `oidcLinkOperations` (
	`manifestId` text NOT NULL,
	`manifestDigest` text NOT NULL,
	`entryId` text NOT NULL,
	`linkId` text NOT NULL,
	`issuer` text NOT NULL,
	`subject` text NOT NULL,
	`localUserId` text NOT NULL,
	`outcome` text NOT NULL,
	`revision` integer NOT NULL,
	`actor` text NOT NULL,
	`correlation` text NOT NULL,
	`createdAt` integer NOT NULL,
	`marker` text NOT NULL,
	`revokedAt` integer,
	`revokedRevision` integer,
	`revokeKind` text,
	`revokeActor` text,
	`revokeCorrelation` text,
	`revokeMarker` text,
	PRIMARY KEY(`manifestId`, `entryId`),
	FOREIGN KEY (`linkId`) REFERENCES `oidcIdentityLinks`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "oidc_link_operation_revision" CHECK("oidcLinkOperations"."revision" >= 1),
	CONSTRAINT "oidc_link_operation_outcome" CHECK("oidcLinkOperations"."outcome" IN ('created-by-this-operation','already-linked'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `oidc_link_operation_marker` ON `oidcLinkOperations` (`marker`);