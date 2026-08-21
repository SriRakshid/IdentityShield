import { asc, desc, eq, sql } from "drizzle-orm";
import { getD1, getDb } from "../../../db";
import { auditEvents, roles, users } from "../../../db/schema";

export const dynamic = "force-dynamic";

const ROLE_SEED = [
  {
    id: "support_analyst",
    name: "Support Analyst",
    department: "Customer Operations",
    description: "Resolves customer cases without security or administrative access.",
    permissions: ["tickets.read", "tickets.update", "knowledge.read", "customers.read"],
    privileged: false,
  },
  {
    id: "soc_analyst",
    name: "SOC Analyst",
    department: "Security Operations",
    description: "Investigates security alerts and maintains incident cases.",
    permissions: ["siem.read", "alerts.investigate", "cases.update", "threatintel.read"],
    privileged: false,
  },
  {
    id: "finance_specialist",
    name: "Finance Specialist",
    department: "Finance",
    description: "Reviews billing records and prepares controlled financial reports.",
    permissions: ["billing.read", "invoices.approve", "reports.export"],
    privileged: false,
  },
  {
    id: "people_ops",
    name: "People Operations",
    department: "People",
    description: "Manages employee profiles and standard onboarding workflows.",
    permissions: ["directory.read", "profiles.update", "onboarding.manage"],
    privileged: false,
  },
  {
    id: "application_admin",
    name: "Application Administrator",
    department: "Platform Engineering",
    description: "Configures applications and assigns roles under privileged controls.",
    permissions: ["apps.configure", "roles.assign", "audit.export", "directory.read"],
    privileged: true,
  },
] as const;

const USER_SEED = [
  { id: "usr_maya_patel", name: "Maya Patel", email: "maya.patel@northstar.example", department: "Customer Operations", manager: "Priya Shah", roleId: "support_analyst" },
  { id: "usr_noah_kim", name: "Noah Kim", email: "noah.kim@northstar.example", department: "Security Operations", manager: "Avery Brooks", roleId: "soc_analyst" },
  { id: "usr_elena_torres", name: "Elena Torres", email: "elena.torres@northstar.example", department: "People", manager: "Rina Das", roleId: "people_ops" },
  { id: "usr_david_okafor", name: "David Okafor", email: "david.okafor@northstar.example", department: "Finance", manager: "Marta Silva", roleId: "finance_specialist" },
] as const;

type AuditMetadata = {
  addedPermissions?: string[];
  removedPermissions?: string[];
  note?: string;
};

function parseJsonArray(value: string | null | undefined) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function parseMetadata(value: string): AuditMetadata {
  try {
    return JSON.parse(value) as AuditMetadata;
  } catch {
    return {};
  }
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function canonicalAuditPayload(event: {
  eventKey: string;
  userId: string;
  userName: string;
  action: string;
  actor: string;
  fromRole: string | null;
  toRole: string | null;
  metadataJson: string;
  previousHash: string;
  createdAt: string;
}) {
  return JSON.stringify([
    event.eventKey,
    event.userId,
    event.userName,
    event.action,
    event.actor,
    event.fromRole,
    event.toRole,
    event.metadataJson,
    event.previousHash,
    event.createdAt,
  ]);
}

async function ensureSchema() {
  const d1 = await getD1();
  await d1.batch([
    d1.prepare(`CREATE TABLE IF NOT EXISTS roles (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      department TEXT NOT NULL,
      description TEXT NOT NULL,
      permissions_json TEXT NOT NULL,
      privileged INTEGER DEFAULT 0 NOT NULL
    )`),
    d1.prepare(`CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      department TEXT NOT NULL,
      manager TEXT NOT NULL,
      role_id TEXT REFERENCES roles(id),
      status TEXT DEFAULT 'active' NOT NULL,
      access_json TEXT DEFAULT '[]' NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    d1.prepare(`CREATE TABLE IF NOT EXISTS audit_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      event_key TEXT NOT NULL UNIQUE,
      user_id TEXT NOT NULL,
      user_name TEXT NOT NULL,
      action TEXT NOT NULL,
      actor TEXT NOT NULL,
      from_role TEXT,
      to_role TEXT,
      metadata_json TEXT NOT NULL,
      previous_hash TEXT NOT NULL,
      event_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`),
    d1.prepare("CREATE INDEX IF NOT EXISTS users_status_idx ON users(status)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS audit_user_idx ON audit_events(user_id)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS audit_created_idx ON audit_events(created_at)"),
  ]);
}

async function recordAudit(input: {
  userId: string;
  userName: string;
  action: string;
  actor: string;
  fromRole?: string | null;
  toRole?: string | null;
  metadata?: AuditMetadata;
  createdAt?: string;
}) {
  const db = await getDb();
  const [latest] = await db
    .select({ eventHash: auditEvents.eventHash })
    .from(auditEvents)
    .orderBy(desc(auditEvents.id))
    .limit(1);

  const event = {
    eventKey: crypto.randomUUID(),
    userId: input.userId,
    userName: input.userName,
    action: input.action,
    actor: input.actor,
    fromRole: input.fromRole ?? null,
    toRole: input.toRole ?? null,
    metadataJson: JSON.stringify(input.metadata ?? {}),
    previousHash: latest?.eventHash ?? "GENESIS",
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
  const eventHash = await sha256(canonicalAuditPayload(event));
  await db.insert(auditEvents).values({ ...event, eventHash });
}

async function ensureSeeded() {
  const db = await getDb();
  const [{ count: roleCount }] = await db.select({ count: sql<number>`count(*)` }).from(roles);
  if (Number(roleCount) === 0) {
    await db.insert(roles).values(ROLE_SEED.map((role) => ({
      id: role.id,
      name: role.name,
      department: role.department,
      description: role.description,
      permissionsJson: JSON.stringify(role.permissions),
      privileged: role.privileged,
    })));
  }

  const [{ count: userCount }] = await db.select({ count: sql<number>`count(*)` }).from(users);
  if (Number(userCount) === 0) {
    const now = new Date().toISOString();
    await db.insert(users).values(USER_SEED.map((user) => {
      const role = ROLE_SEED.find((candidate) => candidate.id === user.roleId)!;
      return {
        ...user,
        status: "active",
        accessJson: JSON.stringify(role.permissions),
        createdAt: now,
        updatedAt: now,
      };
    }));
  }

  const [{ count: auditCount }] = await db.select({ count: sql<number>`count(*)` }).from(auditEvents);
  if (Number(auditCount) === 0) {
    for (const [index, user] of USER_SEED.entries()) {
      const role = ROLE_SEED.find((candidate) => candidate.id === user.roleId)!;
      await recordAudit({
        userId: user.id,
        userName: user.name,
        action: "USER_ONBOARDED",
        actor: "iam.automation",
        toRole: role.name,
        metadata: {
          addedPermissions: [...role.permissions],
          note: "Baseline identity created from an approved onboarding request.",
        },
        createdAt: new Date(Date.now() - (24 - index * 2) * 60 * 60 * 1000).toISOString(),
      });
    }
  }
}

async function verifyAuditChain() {
  const db = await getDb();
  const events = await db.select().from(auditEvents).orderBy(asc(auditEvents.id));
  let expectedPrevious = "GENESIS";
  for (const event of events) {
    if (event.previousHash !== expectedPrevious) return false;
    const expectedHash = await sha256(canonicalAuditPayload({
      eventKey: event.eventKey,
      userId: event.userId,
      userName: event.userName,
      action: event.action,
      actor: event.actor,
      fromRole: event.fromRole,
      toRole: event.toRole,
      metadataJson: event.metadataJson,
      previousHash: event.previousHash,
      createdAt: event.createdAt,
    }));
    if (expectedHash !== event.eventHash) return false;
    expectedPrevious = event.eventHash;
  }
  return true;
}

async function getLabState() {
  const db = await getDb();
  const roleRows = await db.select().from(roles).orderBy(asc(roles.name));
  const userRows = await db.select({
    id: users.id,
    name: users.name,
    email: users.email,
    department: users.department,
    manager: users.manager,
    roleId: users.roleId,
    roleName: roles.name,
    status: users.status,
    accessJson: users.accessJson,
    createdAt: users.createdAt,
    updatedAt: users.updatedAt,
  }).from(users).leftJoin(roles, eq(users.roleId, roles.id)).orderBy(asc(users.name));
  const auditRows = await db.select().from(auditEvents).orderBy(desc(auditEvents.id)).limit(60);

  const roleMap = new Map(roleRows.map((role) => [role.id, new Set(parseJsonArray(role.permissionsJson))]));
  let orphanedPermissions = 0;
  for (const user of userRows) {
    const allowed = user.roleId ? roleMap.get(user.roleId) ?? new Set<string>() : new Set<string>();
    orphanedPermissions += parseJsonArray(user.accessJson).filter((item) => !allowed.has(item)).length;
  }
  const permissionsRevoked = auditRows.reduce((total, event) => total + (parseMetadata(event.metadataJson).removedPermissions?.length ?? 0), 0);

  return {
    users: userRows.map((user) => ({ ...user, roleName: user.roleName ?? "No assigned role", access: parseJsonArray(user.accessJson) })),
    roles: roleRows.map((role) => ({ ...role, permissions: parseJsonArray(role.permissionsJson) })),
    events: auditRows.map((event) => ({ ...event, metadata: parseMetadata(event.metadataJson) })),
    stats: {
      activeIdentities: userRows.filter((user) => user.status === "active").length,
      roleChanges: auditRows.filter((event) => event.action === "ROLE_CHANGED").length,
      permissionsRevoked,
      orphanedPermissions,
      chainVerified: await verifyAuditChain(),
    },
  };
}

async function findRole(roleId: string) {
  const db = await getDb();
  const [role] = await db.select().from(roles).where(eq(roles.id, roleId)).limit(1);
  return role;
}

async function findUser(userId: string) {
  const db = await getDb();
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return user;
}

function errorResponse(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

export async function GET() {
  try {
    await ensureSchema();
    await ensureSeeded();
    return Response.json(await getLabState());
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "The identity lab could not be loaded.", 500);
  }
}

export async function POST(request: Request) {
  try {
    await ensureSchema();
    await ensureSeeded();
    const payload = (await request.json()) as Record<string, unknown>;
    const action = typeof payload.action === "string" ? payload.action : "";
    const actor = "lab.operator";
    const db = await getDb();

    if (action === "add_user") {
      const name = typeof payload.name === "string" ? payload.name.trim() : "";
      const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
      const manager = typeof payload.manager === "string" ? payload.manager.trim() : "";
      const roleId = typeof payload.roleId === "string" ? payload.roleId : "";
      const role = await findRole(roleId);
      if (!name || !manager || !/^\S+@\S+\.\S+$/.test(email) || !role) return errorResponse("Name, valid email, manager, and approved role are required.");
      const [duplicate] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
      if (duplicate) return errorResponse("An identity with this email already exists.", 409);

      const now = new Date().toISOString();
      const userId = `usr_${crypto.randomUUID()}`;
      const permissions = parseJsonArray(role.permissionsJson);
      await db.insert(users).values({
        id: userId,
        name,
        email,
        manager,
        department: role.department,
        roleId: role.id,
        status: "active",
        accessJson: JSON.stringify(permissions),
        createdAt: now,
        updatedAt: now,
      });
      await recordAudit({ userId, userName: name, action: "USER_ONBOARDED", actor, toRole: role.name, metadata: { addedPermissions: permissions, note: "Identity provisioned after role-policy validation." } });
      return Response.json({ state: await getLabState(), selectedUserId: userId }, { status: 201 });
    }

    if (action === "transfer_role") {
      const userId = typeof payload.userId === "string" ? payload.userId : "";
      const roleId = typeof payload.roleId === "string" ? payload.roleId : "";
      const user = await findUser(userId);
      const nextRole = await findRole(roleId);
      if (!user || !nextRole) return errorResponse("Select a valid identity and target role.", 404);
      if (user.status !== "active") return errorResponse("Offboarded identities cannot be transferred.");
      if (user.roleId === nextRole.id) return errorResponse("Choose a different target role.");

      const previousRole = user.roleId ? await findRole(user.roleId) : null;
      const currentAccess = parseJsonArray(user.accessJson);
      const nextAccess = parseJsonArray(nextRole.permissionsJson);
      const removedPermissions = currentAccess.filter((permission) => !nextAccess.includes(permission));
      const addedPermissions = nextAccess.filter((permission) => !currentAccess.includes(permission));
      await db.update(users).set({ roleId: nextRole.id, department: nextRole.department, accessJson: JSON.stringify(nextAccess), updatedAt: new Date().toISOString() }).where(eq(users.id, user.id));
      await recordAudit({
        userId: user.id,
        userName: user.name,
        action: "ROLE_CHANGED",
        actor,
        fromRole: previousRole?.name ?? "No assigned role",
        toRole: nextRole.name,
        metadata: { removedPermissions, addedPermissions, note: "Legacy access removed before target-role permissions were granted." },
      });
      return Response.json({ state: await getLabState(), selectedUserId: user.id });
    }

    if (action === "offboard_user") {
      const userId = typeof payload.userId === "string" ? payload.userId : "";
      const user = await findUser(userId);
      if (!user) return errorResponse("Select a valid identity.", 404);
      if (user.status === "offboarded") return errorResponse("This identity is already offboarded.");
      const previousRole = user.roleId ? await findRole(user.roleId) : null;
      const removedPermissions = parseJsonArray(user.accessJson);
      await db.update(users).set({ status: "offboarded", roleId: null, accessJson: "[]", updatedAt: new Date().toISOString() }).where(eq(users.id, user.id));
      await recordAudit({
        userId: user.id,
        userName: user.name,
        action: "USER_OFFBOARDED",
        actor,
        fromRole: previousRole?.name ?? "No assigned role",
        metadata: { removedPermissions, note: "Account disabled and all effective permissions revoked." },
      });
      return Response.json({ state: await getLabState(), selectedUserId: user.id });
    }

    return errorResponse("Unsupported lifecycle action.");
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "The lifecycle action failed.", 500);
  }
}
