import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const roles = sqliteTable("roles", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  department: text("department").notNull(),
  description: text("description").notNull(),
  permissionsJson: text("permissions_json").notNull(),
  privileged: integer("privileged", { mode: "boolean" }).notNull().default(false),
});

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  department: text("department").notNull(),
  manager: text("manager").notNull(),
  roleId: text("role_id").references(() => roles.id),
  status: text("status").notNull().default("active"),
  accessJson: text("access_json").notNull().default("[]"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const auditEvents = sqliteTable("audit_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  eventKey: text("event_key").notNull().unique(),
  userId: text("user_id").notNull(),
  userName: text("user_name").notNull(),
  action: text("action").notNull(),
  actor: text("actor").notNull(),
  fromRole: text("from_role"),
  toRole: text("to_role"),
  metadataJson: text("metadata_json").notNull(),
  previousHash: text("previous_hash").notNull(),
  eventHash: text("event_hash").notNull(),
  createdAt: text("created_at").notNull(),
});
