CREATE TABLE "generated_exercises" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"language_id" uuid NOT NULL,
	"type" varchar(32) NOT NULL,
	"instruction_sk" text NOT NULL,
	"sentence_es" text,
	"options" jsonb,
	"correct_answer" text NOT NULL,
	"explanation" text DEFAULT '' NOT NULL,
	"grammar_concept_id" uuid,
	"vocabulary_item_id" uuid,
	"difficulty" varchar(16) DEFAULT 'easy' NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" varchar(16) DEFAULT 'active' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"correct_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "exercise_attempts" ALTER COLUMN "lesson_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "exercise_attempts" ALTER COLUMN "exercise_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "exercise_attempts" ADD COLUMN "language_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "exercise_attempts" ADD COLUMN "generated_exercise_id" uuid;--> statement-breakpoint
ALTER TABLE "exercise_attempts" ADD COLUMN "source" varchar(16) DEFAULT 'curriculum' NOT NULL;--> statement-breakpoint
ALTER TABLE "generated_exercises" ADD CONSTRAINT "generated_exercises_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generated_exercises" ADD CONSTRAINT "generated_exercises_language_id_languages_id_fk" FOREIGN KEY ("language_id") REFERENCES "public"."languages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generated_exercises" ADD CONSTRAINT "generated_exercises_grammar_concept_id_grammar_concepts_id_fk" FOREIGN KEY ("grammar_concept_id") REFERENCES "public"."grammar_concepts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generated_exercises" ADD CONSTRAINT "generated_exercises_vocabulary_item_id_vocabulary_items_id_fk" FOREIGN KEY ("vocabulary_item_id") REFERENCES "public"."vocabulary_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "generated_exercises_uid_status_idx" ON "generated_exercises" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "generated_exercises_uid_created_idx" ON "generated_exercises" USING btree ("user_id","created_at");--> statement-breakpoint
ALTER TABLE "exercise_attempts" ADD CONSTRAINT "exercise_attempts_language_id_languages_id_fk" FOREIGN KEY ("language_id") REFERENCES "public"."languages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_attempts" ADD CONSTRAINT "exercise_attempts_generated_exercise_id_generated_exercises_id_fk" FOREIGN KEY ("generated_exercise_id") REFERENCES "public"."generated_exercises"("id") ON DELETE cascade ON UPDATE no action;