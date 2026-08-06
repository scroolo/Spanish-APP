CREATE TABLE "speaking_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"language_id" uuid NOT NULL,
	"exercise_id" uuid,
	"target_es" text NOT NULL,
	"recognized" text,
	"evaluation" varchar(16) NOT NULL,
	"recorded_seconds" integer DEFAULT 0 NOT NULL,
	"provider" varchar(32) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "speaking_attempts" ADD CONSTRAINT "speaking_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "speaking_attempts" ADD CONSTRAINT "speaking_attempts_language_id_languages_id_fk" FOREIGN KEY ("language_id") REFERENCES "public"."languages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "speaking_attempts" ADD CONSTRAINT "speaking_attempts_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "speaking_attempts_uid_created_idx" ON "speaking_attempts" USING btree ("user_id","created_at");