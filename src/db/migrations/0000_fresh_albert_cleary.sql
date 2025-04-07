CREATE TYPE "public"."content_type" AS ENUM('snapshot', 'update');--> statement-breakpoint
CREATE TABLE "content" (
	"cid" text PRIMARY KEY NOT NULL,
	"type" "content_type" NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "docs" (
	"pub_key" text PRIMARY KEY NOT NULL,
	"snapshot_cid" text NOT NULL,
	"update_cids" text[] DEFAULT '{}',
	"owner_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
