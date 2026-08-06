CREATE TABLE "audio_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"language_id" uuid,
	"text" text NOT NULL,
	"voice" varchar(64) DEFAULT 'alloy' NOT NULL,
	"cache_key" varchar(64) NOT NULL,
	"provider" varchar(32) DEFAULT 'mock' NOT NULL,
	"url" text NOT NULL,
	"format" varchar(16) DEFAULT 'mp3' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "audio_text" text;--> statement-breakpoint
ALTER TABLE "audio_assets" ADD CONSTRAINT "audio_assets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audio_assets" ADD CONSTRAINT "audio_assets_language_id_languages_id_fk" FOREIGN KEY ("language_id") REFERENCES "public"."languages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "audio_assets_cache_key_idx" ON "audio_assets" USING btree ("cache_key");