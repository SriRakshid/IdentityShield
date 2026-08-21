import { asc, desc, eq, sql } from "drizzle-orm";
import { getD1, getDb } from "../../../db";
import { accessDecisions, roles, users } from "../../../db/schema";
import {
  findPermission,
  findSodConflict,
  parseJsonArray,
  PERMISSION_CATALOG,
  ROLE_SEED,
  SOD_RULES,
  USER_SEED,
} from "../../../lib/rbac-policy";

export const dynamic = "force-dynamic";

type RoleRow = typeof roles.$inferSelect;
type UserRow = typeof users.$inferSelect;

type DecisionInput = {
  decisionType: "ACCESS_TEST" | "ROLE_CHANGE_EVALUATION";
  subjectId: string;
  subjectName: string;
  roleId: string;
  roleName: string;
  permission: string;
  decision: "ALLOW" | "DENY";
  rationale: string;
  control: string;
  createdAt?: string;
};

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
    d1.prepare(`CREATE TABLE IF NOT EXISTS access_decisions (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      decision_key TEXT NOT NULL UNIQUE,
      decision_type TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      subject_name TEXT NOT NULL,
      role_id TEXT NOT NULL,
      role_name TEXT NOT NULL,
      permission TEXT NOT NULL,
      decision TEXT NOT NULL,
      rationale TEXT NOT NULL,
      control TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`),
    d1.prepare("CREATE INDEX IF NOT EXISTS access_decisions_created_idx ON access_decisions(created_at)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS access_decisions_subject_idx ON access_decisions(subject_id)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS access_decisions_result_idx ON access_decisions(decision)"),
  ]);
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

  const [{ count: decisionCount }] = await db.select({ count: sql<number>`count(*)` }).from(accessDecisions);
  if (Number(decisionCount) === 0) {
    const now = Date.now();
    await db.insert(accessDecisions).values([
      {
        decisionKey: "rbac-baseline-001",
        decisionType: "ACCESS_TEST",
        subjectId: "usr_maya_patel",
        subjectName: "Maya Patel",
        roleId: "support_analyst",
        roleName: "Support Analyst",
        permission: "tickets.read",
        decision: "ALLOW",
        rationale: "The permission is explicitly mapped to the Support Analyst role.",
        control: "RBAC-POLICY-MATCH",
        createdAt: new Date(now - 26 * 60 * 1000).toISOString(),
      },
      {
        decisionKey: "rbac-baseline-002",
        decisionType: "ACCESS_TEST",
        subjectId: "usr_maya_patel",
        subjectName: "Maya Patel",
        roleId: "support_analyst",
        roleName: "Support Analyst",
        permission: "roles.assign",
        decision: "DENY",
        rationale: "A non-privileged support role cannot cross the privileged administration boundary.",
        control: "PRIVILEGED-BOUNDARY",
        createdAt: new Date(now - 18 * 60 * 1000).toISOString(),
      },
      {
        decisionKey: "rbac-baseline-003",
        decisionType: "ACCESS_TEST",
        subjectId: "usr_noah_kim",
        subjectName: "Noah Kim",
        roleId: "soc_analyst",
        roleName: "SOC Analyst",
        permission: "alerts.investigate",
        decision: "ALLOW",
        rationale: "The permission is explicitly mapped to the SOC Analyst role.",
        control: "RBAC-POLICY-MATCH",
        createdAt: new Date(now - 11 * 60 * 1000).toISOString(),
      },
      {
        decisionKey: "rbac-baseline-004",
        decisionType: "ROLE_CHANGE_EVALUATION",
        subjectId: "finance_specialist",
        subjectName: "Finance Specialist",
        roleId: "finance_specialist",
        roleName: "Finance Specialist",
        permission: "payments.release",
        decision: "DENY",
        rationale: "Invoice approval and payment release must be performed by different people.",
        control: "SOD-FIN-01",
        createdAt: new Date(now - 4 * 60 * 1000).toISOString(),
      },
    ]);
  }
}

function evaluateAccess(user: UserRow, role: RoleRow | undefined, permissionId: string): Omit<DecisionInput, "decisionType" | "subjectId" | "subjectName" | "roleId" | "roleName" | "permission"> {
  const permission = findPermission(permissionId);
  if (!permission) {
    return { decision: "DENY", rationale: "The requested entitlement is not present in the approved permission catalogue.", control: "CATALOG-VALIDATION" };
  }
  if (user.status !== "active") {
    return { decision: "DENY", rationale: "The identity is not active, so authorization stops before role evaluation.", control: "IDENTITY-STATUS" };
  }
  if (!role) {
    return { decision: "DENY", rationale: "The identity has no active role policy from which access can be derived.", control: "ROLE-REQUIRED" };
  }

  const approved = parseJsonArray(role.permissionsJson);
  if (approved.includes(permissionId)) {
    return { decision: "ALLOW", rationale: `The entitlement is explicitly mapped to the ${role.name} role.`, control: "RBAC-POLICY-MATCH" };
  }
  if (permission.classification === "privileged" && !role.privileged) {
    return { decision: "DENY", rationale: `${role.name} is a non-privileged role and cannot cross the administrative access boundary.`, control: "PRIVILEGED-BOUNDARY" };
  }
  return { decision: "DENY", rationale: `The entitlement is not part of the approved ${role.name} permission set.`, control: "LEAST-PRIVILEGE" };
}

function evaluateRoleChange(role: RoleRow, permissionId: string): Omit<DecisionInput, "decisionType" | "subjectId" | "subjectName" | "roleId" | "roleName" | "permission"> {
  const permission = findPermission(permissionId);
  if (!permission) {
    return { decision: "DENY", rationale: "Only entitlements in the controlled permission catalogue can be evaluated.", control: "CATALOG-VALIDATION" };
  }

  const approved = parseJsonArray(role.permissionsJson);
  if (approved.includes(permissionId)) {
    return { decision: "ALLOW", rationale: `The entitlement is already approved for ${role.name}; no policy expansion is required.`, control: "EXISTING-POLICY" };
  }

  const conflict = findSodConflict(approved, permissionId);
  if (conflict) {
    return { decision: "DENY", rationale: conflict.rationale, control: conflict.id };
  }
  if (permission.classification === "privileged" && !role.privileged) {
    return { decision: "DENY", rationale: `A privileged entitlement cannot be added to the non-privileged ${role.name} role.`, control: "PRIVILEGED-BOUNDARY" };
  }
  if (permission.ownerDepartment !== "Shared Services" && permission.ownerDepartment !== role.department) {
    return { decision: "DENY", rationale: `${permission.label} belongs to ${permission.ownerDepartment}, outside the ${role.department} role boundary.`, control: "DEPARTMENT-BOUNDARY" };
  }
  return { decision: "ALLOW", rationale: `The entitlement stays inside the ${role.department} boundary and introduces no segregation-of-duties conflict.`, control: "LEAST-PRIVILEGE-REVIEW" };
}

async function recordDecision(input: DecisionInput) {
  const db = await getDb();
  const row = {
    ...input,
    decisionKey: crypto.randomUUID(),
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
  await db.insert(accessDecisions).values(row);
  return row;
}

async function getState() {
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
  }).from(users).leftJoin(roles, eq(users.roleId, roles.id)).orderBy(asc(users.name));
  const historyRows = await db.select().from(accessDecisions).orderBy(desc(accessDecisions.id)).limit(60);

  const analyses = roleRows.map((role) => {
    const permissions = parseJsonArray(role.permissionsJson);
    const sodFindings = SOD_RULES.filter((rule) => permissions.includes(rule.left) && permissions.includes(rule.right));
    const sensitivePermissions = permissions.filter((permissionId) => findPermission(permissionId)?.classification !== "standard").length;
    return {
      roleId: role.id,
      permissionCount: permissions.length,
      sensitivePermissions,
      sodFindings,
      riskTier: role.privileged ? "privileged" : sensitivePermissions > 0 ? "controlled" : "standard",
    };
  });

  const roleMap = new Map(roleRows.map((role) => [role.id, new Set(parseJsonArray(role.permissionsJson))]));
  let orphanedPermissions = 0;
  for (const user of userRows) {
    const approved = user.roleId ? roleMap.get(user.roleId) ?? new Set<string>() : new Set<string>();
    orphanedPermissions += parseJsonArray(user.accessJson).filter((permission) => !approved.has(permission)).length;
  }
  const knownPermissions = new Set(PERMISSION_CATALOG.map((permission) => permission.id));
  const unmappedPermissions = roleRows.reduce((total, role) => total + parseJsonArray(role.permissionsJson).filter((permission) => !knownPermissions.has(permission)).length, 0);
  const sodFindingCount = analyses.reduce((total, analysis) => total + analysis.sodFindings.length, 0);

  return {
    roles: roleRows.map((role) => ({ ...role, permissions: parseJsonArray(role.permissionsJson) })),
    users: userRows.map((user) => ({ ...user, roleName: user.roleName ?? "No assigned role", access: parseJsonArray(user.accessJson) })),
    permissions: PERMISSION_CATALOG,
    sodRules: SOD_RULES,
    analyses,
    history: historyRows,
    stats: {
      approvedRoles: roleRows.length,
      entitlementBindings: roleRows.reduce((total, role) => total + parseJsonArray(role.permissionsJson).length, 0),
      privilegedRoles: roleRows.filter((role) => role.privileged).length,
      sodFindings: sodFindingCount,
      orphanedPermissions,
      policyExceptions: sodFindingCount + orphanedPermissions + unmappedPermissions,
      decisionsTested: historyRows.length,
      deniedDecisions: historyRows.filter((decision) => decision.decision === "DENY").length,
    },
  };
}

function errorResponse(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

export async function GET() {
  try {
    await ensureSchema();
    await ensureSeeded();
    return Response.json(await getState());
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "The RBAC lab could not be loaded.", 500);
  }
}

export async function POST(request: Request) {
  try {
    await ensureSchema();
    await ensureSeeded();
    const payload = (await request.json()) as Record<string, unknown>;
    const action = typeof payload.action === "string" ? payload.action : "";
    const permission = typeof payload.permission === "string" ? payload.permission : "";
    const db = await getDb();

    if (action === "test_access") {
      const userId = typeof payload.userId === "string" ? payload.userId : "";
      const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!user || !permission) return errorResponse("Select an identity and entitlement to test.", 404);
      const [role] = user.roleId ? await db.select().from(roles).where(eq(roles.id, user.roleId)).limit(1) : [];
      const evaluation = evaluateAccess(user, role, permission);
      const result = await recordDecision({
        decisionType: "ACCESS_TEST",
        subjectId: user.id,
        subjectName: user.name,
        roleId: role?.id ?? "unassigned",
        roleName: role?.name ?? "No assigned role",
        permission,
        ...evaluation,
      });
      return Response.json({ state: await getState(), result }, { status: 201 });
    }

    if (action === "evaluate_change") {
      const roleId = typeof payload.roleId === "string" ? payload.roleId : "";
      const [role] = await db.select().from(roles).where(eq(roles.id, roleId)).limit(1);
      if (!role || !permission) return errorResponse("Select a role and proposed entitlement to evaluate.", 404);
      const evaluation = evaluateRoleChange(role, permission);
      const result = await recordDecision({
        decisionType: "ROLE_CHANGE_EVALUATION",
        subjectId: role.id,
        subjectName: role.name,
        roleId: role.id,
        roleName: role.name,
        permission,
        ...evaluation,
      });
      return Response.json({ state: await getState(), result }, { status: 201 });
    }

    return errorResponse("Unsupported RBAC action.");
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "The RBAC control test failed.", 500);
  }
}
