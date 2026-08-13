CREATE TABLE "devices" (
	"id" serial PRIMARY KEY,
	"user_id" integer,
	"fingerprint" varchar(128) NOT NULL UNIQUE,
	"login_count" integer DEFAULT 0 NOT NULL,
	"last_active_at" timestamp with time zone,
	"total_active_seconds" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "notification_reads" (
	"id" serial PRIMARY KEY,
	"notification_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"read_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY,
	"target_user_id" integer,
	"message" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" serial PRIMARY KEY,
	"token" varchar(128) NOT NULL UNIQUE,
	"user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_settings" (
	"id" serial PRIMARY KEY,
	"maintenance_mode" boolean DEFAULT false NOT NULL,
	"maintenance_notice" text DEFAULT 'The site is currently under maintenance. Please check back later.' NOT NULL,
	"content_type" varchar(8) DEFAULT 'url' NOT NULL,
	"content_payload" text DEFAULT 'https://example.com' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY,
	"username" varchar(64) NOT NULL UNIQUE,
	"password_hash" text NOT NULL,
	"role" varchar(32) DEFAULT 'user' NOT NULL,
	"custom_role" varchar(64),
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"internet_access" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "notification_reads" ADD CONSTRAINT "notification_reads_notification_id_notifications_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "notifications"("id");--> statement-breakpoint
ALTER TABLE "notification_reads" ADD CONSTRAINT "notification_reads_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id");