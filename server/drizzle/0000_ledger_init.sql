CREATE TABLE "match_hands" (
	"match_id" text NOT NULL,
	"participant_id" text NOT NULL,
	"ordinal" integer NOT NULL,
	"dealt_at_ms" double precision NOT NULL,
	"offered" text[] NOT NULL,
	"taken" text,
	"taken_at_ms" double precision,
	"redrawn" boolean NOT NULL,
	CONSTRAINT "match_hands_match_id_participant_id_ordinal_pk" PRIMARY KEY("match_id","participant_id","ordinal")
);
--> statement-breakpoint
CREATE TABLE "match_participants" (
	"match_id" text NOT NULL,
	"participant_id" text NOT NULL,
	"role" text NOT NULL,
	"hull_id" text NOT NULL,
	"shift" text NOT NULL,
	"placement" integer NOT NULL,
	"kills" integer NOT NULL,
	"damage_dealt" double precision NOT NULL,
	"beacon_xp_ms" double precision NOT NULL,
	"drops_taken" integer NOT NULL,
	"cards" text[] NOT NULL,
	"banked_levels" integer NOT NULL,
	"index_bonus" jsonb NOT NULL,
	CONSTRAINT "match_participants_match_id_participant_id_pk" PRIMARY KEY("match_id","participant_id")
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" text PRIMARY KEY NOT NULL,
	"mode" text NOT NULL,
	"protocol_version" integer NOT NULL,
	"game_version" text NOT NULL,
	"ended_at_epoch_ms" double precision NOT NULL,
	"activated_at_ms" double precision NOT NULL,
	"duration_s" double precision NOT NULL,
	"ended_by" text NOT NULL,
	"outcome" text NOT NULL,
	"winner_id" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "match_hands" ADD CONSTRAINT "match_hands_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_participants" ADD CONSTRAINT "match_participants_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE no action ON UPDATE no action;