CREATE TABLE "weaknesses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"language_id" uuid NOT NULL,
	"category" varchar(32) NOT NULL,
	"key" varchar(128) NOT NULL,
	"label" varchar(160) NOT NULL,
	"vocabulary_item_id" uuid,
	"grammar_concept_id" uuid,
	"mistake_count" integer DEFAULT 0 NOT NULL,
	"correct_count" integer DEFAULT 0 NOT NULL,
	"last_mistake_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mistakes" ADD COLUMN "lesson_id" uuid;--> statement-breakpoint
ALTER TABLE "mistakes" ADD COLUMN "exercise_type" varchar(32);--> statement-breakpoint
ALTER TABLE "vocabulary_items" ADD COLUMN "category" varchar(64) DEFAULT 'general' NOT NULL;--> statement-breakpoint
ALTER TABLE "weaknesses" ADD CONSTRAINT "weaknesses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weaknesses" ADD CONSTRAINT "weaknesses_language_id_languages_id_fk" FOREIGN KEY ("language_id") REFERENCES "public"."languages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weaknesses" ADD CONSTRAINT "weaknesses_vocabulary_item_id_vocabulary_items_id_fk" FOREIGN KEY ("vocabulary_item_id") REFERENCES "public"."vocabulary_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weaknesses" ADD CONSTRAINT "weaknesses_grammar_concept_id_grammar_concepts_id_fk" FOREIGN KEY ("grammar_concept_id") REFERENCES "public"."grammar_concepts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "weaknesses_uid_cat_key_idx" ON "weaknesses" USING btree ("user_id","category","key");--> statement-breakpoint
CREATE INDEX "weaknesses_resolved_idx" ON "weaknesses" USING btree ("user_id","resolved_at");--> statement-breakpoint
ALTER TABLE "mistakes" ADD CONSTRAINT "mistakes_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "exercise_attempts_uid_answered_idx" ON "exercise_attempts" USING btree ("user_id","answered_at");--> statement-breakpoint
CREATE INDEX "user_grammar_next_review_idx" ON "user_grammar_progress" USING btree ("user_id","next_review_date");--> statement-breakpoint
CREATE INDEX "user_vocabulary_next_review_idx" ON "user_vocabulary" USING btree ("user_id","next_review_date");