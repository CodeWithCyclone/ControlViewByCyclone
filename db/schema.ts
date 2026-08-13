import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  boolean,
  varchar,
} from "drizzle-orm/pg-core";

// Roles: "admin" | "mod" | "user" | custom string in customRole
// Status: "pending" | "approved" | "rejected"
export const users = pgTable("users", {
  id: serial().primaryKey(),
  username: varchar("username", { length: 64 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: varchar("role", { length: 32 }).notNull().default("user"), // admin | mod | user
  customRole: varchar("custom_role", { length: 64 }), // optional label, informational
  status: varchar("status", { length: 16 }).notNull().default("pending"), // pending | approved | rejected
  internetAccess: boolean("internet_access").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const sessions = pgTable("sessions", {
  id: serial().primaryKey(),
  token: varchar("token", { length: 128 }).notNull().unique(),
  userId: integer("user_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const devices = pgTable("devices", {
  id: serial().primaryKey(),
  userId: integer("user_id").references(() => users.id),
  fingerprint: varchar("fingerprint", { length: 128 }).notNull().unique(),
  loginCount: integer("login_count").notNull().default(0),
  lastActiveAt: timestamp("last_active_at", { withTimezone: true }),
  totalActiveSeconds: integer("total_active_seconds").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// Single-row table holding global site settings.
export const siteSettings = pgTable("site_settings", {
  id: serial().primaryKey(),
  maintenanceMode: boolean("maintenance_mode").notNull().default(false),
  maintenanceNotice: text("maintenance_notice").notNull().default(
    "The site is currently under maintenance. Please check back later."
  ),
  contentType: varchar("content_type", { length: 8 }).notNull().default("url"), // url | html
  contentPayload: text("content_payload").notNull().default("https://example.com"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const notifications = pgTable("notifications", {
  id: serial().primaryKey(),
  targetUserId: integer("target_user_id"), // null = broadcast to all
  message: text("message").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
});

// Tracks which notifications a given device/session has already seen so we don't re-toast them.
export const notificationReads = pgTable("notification_reads", {
  id: serial().primaryKey(),
  notificationId: integer("notification_id").notNull().references(() => notifications.id),
  userId: integer("user_id").notNull().references(() => users.id),
  readAt: timestamp("read_at", { withTimezone: true }).defaultNow(),
});
