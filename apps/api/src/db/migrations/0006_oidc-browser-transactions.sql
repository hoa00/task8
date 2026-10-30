CREATE TABLE `oidcLoginTransactions` (
	`id` text PRIMARY KEY NOT NULL,
	`stateHash` text NOT NULL,
	`bindingHash` text NOT NULL,
	`secret` text NOT NULL,
	`issuer` text NOT NULL,
	`clientId` text NOT NULL,
	`redirectUri` text NOT NULL,
	`returnTo` text NOT NULL,
	`priorHash` text,
	`createdAt` integer NOT NULL,
	`expiresAt` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	CONSTRAINT "oidcLoginTransactions_status" CHECK("oidcLoginTransactions"."status" IN ('pending','claimed','succeeded','failed')),
	CONSTRAINT "oidcLoginTransactions_lifetime" CHECK("oidcLoginTransactions"."expiresAt"="oidcLoginTransactions"."createdAt"+600000)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `oidcLoginTransactions_state` ON `oidcLoginTransactions` (`stateHash`);--> statement-breakpoint
CREATE INDEX `oidcLoginTransactions_expiry` ON `oidcLoginTransactions` (`expiresAt`);--> statement-breakpoint
CREATE TABLE `oidcLogoutTransactions` (
	`stateHash` text PRIMARY KEY NOT NULL,
	`bindingHash` text NOT NULL,
	`expiresAt` integer NOT NULL,
	`consumedAt` integer
);
--> statement-breakpoint
CREATE INDEX `oidcLogoutTransactions_expiry` ON `oidcLogoutTransactions` (`expiresAt`);