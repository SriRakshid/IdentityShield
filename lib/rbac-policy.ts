export const ROLE_SEED = [
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

export const USER_SEED = [
  { id: "usr_maya_patel", name: "Maya Patel", email: "maya.patel@northstar.example", department: "Customer Operations", manager: "Priya Shah", roleId: "support_analyst" },
  { id: "usr_noah_kim", name: "Noah Kim", email: "noah.kim@northstar.example", department: "Security Operations", manager: "Avery Brooks", roleId: "soc_analyst" },
  { id: "usr_elena_torres", name: "Elena Torres", email: "elena.torres@northstar.example", department: "People", manager: "Rina Das", roleId: "people_ops" },
  { id: "usr_david_okafor", name: "David Okafor", email: "david.okafor@northstar.example", department: "Finance", manager: "Marta Silva", roleId: "finance_specialist" },
] as const;

export type PermissionClassification = "standard" | "sensitive" | "privileged";

export type PermissionDefinition = {
  id: string;
  label: string;
  system: string;
  ownerDepartment: string;
  classification: PermissionClassification;
  description: string;
};

export const PERMISSION_CATALOG: PermissionDefinition[] = [
  { id: "tickets.read", label: "Read tickets", system: "Service Desk", ownerDepartment: "Customer Operations", classification: "standard", description: "View assigned customer-support tickets." },
  { id: "tickets.update", label: "Update tickets", system: "Service Desk", ownerDepartment: "Customer Operations", classification: "standard", description: "Add notes and change ticket workflow states." },
  { id: "tickets.escalate", label: "Escalate tickets", system: "Service Desk", ownerDepartment: "Customer Operations", classification: "standard", description: "Escalate a case to a specialist queue." },
  { id: "knowledge.read", label: "Read knowledge base", system: "Knowledge Hub", ownerDepartment: "Customer Operations", classification: "standard", description: "View approved troubleshooting content." },
  { id: "customers.read", label: "Read customer profiles", system: "Customer 360", ownerDepartment: "Customer Operations", classification: "sensitive", description: "View customer profile and service context." },
  { id: "siem.read", label: "Read SIEM events", system: "Security Analytics", ownerDepartment: "Security Operations", classification: "sensitive", description: "Search normalized security telemetry." },
  { id: "alerts.investigate", label: "Investigate alerts", system: "Security Analytics", ownerDepartment: "Security Operations", classification: "sensitive", description: "Open investigations and document alert disposition." },
  { id: "cases.update", label: "Update incident cases", system: "Incident Response", ownerDepartment: "Security Operations", classification: "standard", description: "Maintain security case notes and status." },
  { id: "cases.close", label: "Close incident cases", system: "Incident Response", ownerDepartment: "Security Operations", classification: "sensitive", description: "Close a reviewed incident case." },
  { id: "threatintel.read", label: "Read threat intelligence", system: "Threat Intel", ownerDepartment: "Security Operations", classification: "standard", description: "View curated indicators and adversary context." },
  { id: "billing.read", label: "Read billing records", system: "Finance Cloud", ownerDepartment: "Finance", classification: "sensitive", description: "View billing accounts and transaction detail." },
  { id: "invoices.approve", label: "Approve invoices", system: "Finance Cloud", ownerDepartment: "Finance", classification: "sensitive", description: "Approve validated invoices for payment processing." },
  { id: "reports.export", label: "Export finance reports", system: "Finance Cloud", ownerDepartment: "Finance", classification: "sensitive", description: "Export controlled finance reports." },
  { id: "payments.release", label: "Release payments", system: "Treasury Gateway", ownerDepartment: "Finance", classification: "privileged", description: "Release approved payments to the banking gateway." },
  { id: "directory.read", label: "Read employee directory", system: "People Directory", ownerDepartment: "Shared Services", classification: "standard", description: "View standard employee directory attributes." },
  { id: "profiles.update", label: "Update employee profiles", system: "People Directory", ownerDepartment: "People", classification: "sensitive", description: "Maintain approved employee profile attributes." },
  { id: "onboarding.manage", label: "Manage onboarding", system: "People Workflow", ownerDepartment: "People", classification: "standard", description: "Coordinate standard employee onboarding tasks." },
  { id: "payroll.admin", label: "Administer payroll", system: "Payroll Core", ownerDepartment: "People", classification: "privileged", description: "Change payroll configuration and pay instructions." },
  { id: "apps.configure", label: "Configure applications", system: "Application Registry", ownerDepartment: "Platform Engineering", classification: "privileged", description: "Change managed application configuration." },
  { id: "roles.assign", label: "Assign application roles", system: "Application Registry", ownerDepartment: "Platform Engineering", classification: "privileged", description: "Assign approved application roles to identities." },
  { id: "audit.export", label: "Export audit evidence", system: "Audit Vault", ownerDepartment: "Shared Services", classification: "sensitive", description: "Export immutable audit evidence for review." },
  { id: "audit.delete", label: "Delete audit records", system: "Audit Vault", ownerDepartment: "Platform Engineering", classification: "privileged", description: "Delete retained audit material under break-glass control." },
  { id: "data.export.bulk", label: "Bulk export enterprise data", system: "Data Exchange", ownerDepartment: "Data Governance", classification: "privileged", description: "Export large multi-system datasets." },
];

export const SOD_RULES = [
  { id: "SOD-FIN-01", left: "invoices.approve", right: "payments.release", severity: "critical", rationale: "Invoice approval and payment release must be performed by different people." },
  { id: "SOD-HR-01", left: "profiles.update", right: "payroll.admin", severity: "high", rationale: "Employee profile maintenance must be separated from payroll administration." },
  { id: "SOD-IAM-01", left: "roles.assign", right: "audit.delete", severity: "critical", rationale: "Role assignment cannot be combined with the ability to remove its audit evidence." },
  { id: "SOD-DATA-01", left: "reports.export", right: "data.export.bulk", severity: "high", rationale: "Routine reporting and unrestricted bulk export require separate approval paths." },
] as const;

export function parseJsonArray(value: string | null | undefined) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function findPermission(permissionId: string) {
  return PERMISSION_CATALOG.find((permission) => permission.id === permissionId);
}

export function findSodConflict(existingPermissions: string[], candidate: string) {
  const existing = new Set(existingPermissions);
  return SOD_RULES.find((rule) =>
    (rule.left === candidate && existing.has(rule.right)) ||
    (rule.right === candidate && existing.has(rule.left))
  );
}
