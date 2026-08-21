"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Role = {
  id: string;
  name: string;
  department: string;
  description: string;
  permissions: string[];
  privileged: boolean;
};

type Identity = {
  id: string;
  name: string;
  email: string;
  department: string;
  manager: string;
  roleId: string | null;
  roleName: string;
  status: "active" | "offboarded";
  access: string[];
};

type Permission = {
  id: string;
  label: string;
  system: string;
  ownerDepartment: string;
  classification: "standard" | "sensitive" | "privileged";
  description: string;
};

type SodRule = {
  id: string;
  left: string;
  right: string;
  severity: string;
  rationale: string;
};

type RoleAnalysis = {
  roleId: string;
  permissionCount: number;
  sensitivePermissions: number;
  sodFindings: SodRule[];
  riskTier: string;
};

type Decision = {
  id?: number;
  decisionKey: string;
  decisionType: "ACCESS_TEST" | "ROLE_CHANGE_EVALUATION";
  subjectId: string;
  subjectName: string;
  roleId: string;
  roleName: string;
  permission: string;
  decision: "ALLOW" | "DENY";
  rationale: string;
  control: string;
  createdAt: string;
};

type RbacState = {
  roles: Role[];
  users: Identity[];
  permissions: Permission[];
  sodRules: SodRule[];
  analyses: RoleAnalysis[];
  history: Decision[];
  stats: {
    approvedRoles: number;
    entitlementBindings: number;
    privilegedRoles: number;
    sodFindings: number;
    orphanedPermissions: number;
    policyExceptions: number;
    decisionsTested: number;
    deniedDecisions: number;
  };
};

type IconName = "grid" | "users" | "roles" | "pulse" | "key" | "ledger" | "arrow" | "shield" | "check" | "x" | "play" | "lock" | "download";

const iconPaths: Record<IconName, React.ReactNode> = {
  grid: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
  roles: <><circle cx="12" cy="8" r="4"/><path d="M4.93 19.07a10 10 0 0 1 14.14 0M12 12v9"/></>,
  pulse: <path d="M3 12h4l2.5-7 5 14 2.5-7h4"/>,
  key: <><circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.7 12.3 8-8M15 8l3 3M17 6l3 3"/></>,
  ledger: <><path d="M6 3h12a2 2 0 0 1 2 2v16H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/><path d="M8 7h8M8 11h8M8 15h5"/></>,
  arrow: <path d="m9 18 6-6-6-6"/>,
  shield: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/>,
  check: <path d="m5 12 4 4L19 6"/>,
  x: <path d="m6 6 12 12M18 6 6 18"/>,
  play: <path d="m8 5 11 7-11 7V5Z"/>,
  lock: <><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
  download: <><path d="M12 3v12m0 0 4-4m-4 4-4-4"/><path d="M5 20h14"/></>,
};

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{iconPaths[name]}</svg>;
}

function initials(name: string) {
  return name.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase();
}

function formatTime(timestamp: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(timestamp));
}

const EMPTY_STATE: RbacState = {
  roles: [],
  users: [],
  permissions: [],
  sodRules: [],
  analyses: [],
  history: [],
  stats: { approvedRoles: 0, entitlementBindings: 0, privilegedRoles: 0, sodFindings: 0, orphanedPermissions: 0, policyExceptions: 0, decisionsTested: 0, deniedDecisions: 0 },
};

const PROPOSAL_SUGGESTIONS: Record<string, string> = {
  support_analyst: "tickets.escalate",
  soc_analyst: "cases.close",
  finance_specialist: "payments.release",
  people_ops: "payroll.admin",
  application_admin: "audit.delete",
};

export default function RbacLab() {
  const [lab, setLab] = useState<RbacState>(EMPTY_STATE);
  const [selectedRoleId, setSelectedRoleId] = useState("support_analyst");
  const [testUserId, setTestUserId] = useState("usr_maya_patel");
  const [testPermission, setTestPermission] = useState("tickets.read");
  const [proposalPermission, setProposalPermission] = useState("tickets.escalate");
  const [accessResult, setAccessResult] = useState<Decision | null>(null);
  const [proposalResult, setProposalResult] = useState<Decision | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"access" | "proposal" | "">("");
  const [error, setError] = useState("");

  const selectedRole = lab.roles.find((role) => role.id === selectedRoleId) ?? lab.roles[0];
  const selectedAnalysis = lab.analyses.find((analysis) => analysis.roleId === selectedRole?.id);
  const selectedUser = lab.users.find((user) => user.id === testUserId) ?? lab.users[0];
  const permissionMap = useMemo(() => new Map(lab.permissions.map((permission) => [permission.id, permission])), [lab.permissions]);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const response = await fetch("/api/rbac-lab", { cache: "no-store" });
        const data = (await response.json()) as RbacState & { error?: string };
        if (!response.ok) throw new Error(data.error || "Unable to load the RBAC lab.");
        if (!active) return;
        setLab(data);
        setSelectedRoleId(data.roles.find((role) => role.id === "support_analyst")?.id ?? data.roles[0]?.id ?? "");
        setTestUserId(data.users.find((user) => user.id === "usr_maya_patel")?.id ?? data.users[0]?.id ?? "");
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : "Unable to load the RBAC lab.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, []);

  function chooseRole(roleId: string) {
    setSelectedRoleId(roleId);
    setProposalPermission(PROPOSAL_SUGGESTIONS[roleId] ?? "");
    setProposalResult(null);
  }

  async function runDecision(kind: "access" | "proposal") {
    try {
      setBusy(kind);
      setError("");
      const payload = kind === "access"
        ? { action: "test_access", userId: selectedUser?.id, permission: testPermission }
        : { action: "evaluate_change", roleId: selectedRole?.id, permission: proposalPermission };
      const response = await fetch("/api/rbac-lab", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as { state?: RbacState; result?: Decision; error?: string };
      if (!response.ok || !data.state || !data.result) throw new Error(data.error || "The policy evaluation failed.");
      setLab(data.state);
      if (kind === "access") setAccessResult(data.result);
      else setProposalResult(data.result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The policy evaluation failed.");
    } finally {
      setBusy("");
    }
  }

  function exportEvidence() {
    const evidence = {
      exportedAt: new Date().toISOString(),
      lab: "IdentityShield — Least-Privilege Role Engineering Lab",
      policyMetrics: lab.stats,
      roles: lab.roles,
      segregationOfDutiesRules: lab.sodRules,
      decisions: lab.history,
    };
    const blob = new Blob([JSON.stringify(evidence, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "identityshield-rbac-evidence.json";
    link.click();
    URL.revokeObjectURL(link.href);
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><Icon name="shield" size={22} /><span /></div>
          <div><strong>IdentityShield</strong><small>ACCESS CONTROL PLANE</small></div>
        </div>
        <nav className="primary-nav" aria-label="Primary navigation">
          <p className="nav-label">WORKSPACE</p>
          <Link href="/"><Icon name="grid" />Overview</Link>
          <Link href="/"><Icon name="users" />Lifecycle<span>01</span></Link>
          <Link href="#decision-history"><Icon name="ledger" />Evidence log</Link>
          <p className="nav-label">CONTROL LABS</p>
          <Link href="/rbac" className="active"><Icon name="roles" />Role engineering<small>02</small></Link>
          <button className="future"><Icon name="pulse" />Identity threats<small>03</small></button>
          <button className="future"><Icon name="key" />Privileged access<small>04</small></button>
        </nav>
        <div className="operator-card">
          <div className="operator-avatar">LO</div>
          <div><strong>Lab operator</strong><span><i /> Session protected</span></div>
          <button aria-label="Operator options">•••</button>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="crumbs"><span>Control labs</span><Icon name="arrow" size={14} /><strong>Least-privilege role engineering</strong></div>
          <div className="environment"><span className="status-dot" />SYNTHETIC ENVIRONMENT <b>LAB 02</b></div>
        </header>

        <div className="content rbac-content">
          <section className="hero-strip rbac-hero">
            <div>
              <p className="eyebrow">ACCESS GOVERNANCE / LEAST PRIVILEGE</p>
              <h1>Least-privilege role engineering</h1>
              <p>Design job roles, inspect every entitlement mapping, and test authorization decisions against least-privilege and segregation-of-duties controls.</p>
            </div>
            <div className="lab-objective">
              <span>LAB OBJECTIVE</span><strong>Prove access is role-appropriate</strong>
              <div className="objective-flow"><b>DEFINE</b><i /><b>MAP</b><i /><b>TEST</b><i /><b>EVIDENCE</b></div>
            </div>
          </section>

          {error && <div className="error-banner"><Icon name="x" />{error}<button onClick={() => setError("")} aria-label="Dismiss error">×</button></div>}

          <section className="metrics" aria-label="RBAC control metrics">
            <Metric label="Approved roles" value={loading ? "—" : String(lab.stats.approvedRoles).padStart(2, "0")} detail="CATALOGUED" tone="cyan" />
            <Metric label="Policy bindings" value={loading ? "—" : String(lab.stats.entitlementBindings).padStart(2, "0")} detail="ENTITLEMENTS" tone="violet" />
            <Metric label="SoD findings" value={loading ? "—" : String(lab.stats.sodFindings).padStart(2, "0")} detail={lab.stats.sodFindings === 0 ? "POLICY CLEAN" : "REVIEW NOW"} tone="orange" />
            <Metric label="Policy exceptions" value={loading ? "—" : String(lab.stats.policyExceptions).padStart(2, "0")} detail={lab.stats.policyExceptions === 0 ? "NO FINDINGS" : "ATTENTION"} tone="lime" />
          </section>

          <section className="panel role-catalogue">
            <div className="panel-head">
              <div><span className="step-tag">STEP 01</span><h2>Approved job-role catalogue</h2></div>
              <span className="catalogue-status"><Icon name="shield" size={14} />{lab.stats.privilegedRoles} privileged role isolated</span>
            </div>
            <div className="role-card-grid">
              {loading ? <ListSkeleton /> : lab.roles.map((role) => {
                const analysis = lab.analyses.find((item) => item.roleId === role.id);
                return (
                  <button key={role.id} className={`role-card ${selectedRole?.id === role.id ? "selected" : ""}`} onClick={() => chooseRole(role.id)}>
                    <span className="role-card-top"><i>{role.name.split(" ").map((part) => part[0]).join("").slice(0, 3)}</i><b className={`risk-chip ${analysis?.riskTier}`}>{analysis?.riskTier}</b></span>
                    <strong>{role.name}</strong>
                    <small>{role.department}</small>
                    <p>{role.description}</p>
                    <span className="role-card-foot"><b>{role.permissions.length}</b> permissions <i /> <b>{analysis?.sensitivePermissions ?? 0}</b> controlled</span>
                  </button>
                );
              })}
            </div>
            {selectedRole && <div className="selected-role-policy">
              <div><span className="step-tag">SELECTED POLICY</span><h3>{selectedRole.name}</h3><p>{selectedRole.department} · {selectedRole.privileged ? "Privileged administration boundary" : "Standard workforce boundary"}</p></div>
              <div className="policy-permissions">{selectedRole.permissions.map((permission) => <code key={permission}>{permission}</code>)}</div>
              <span className={`policy-health ${(selectedAnalysis?.sodFindings.length ?? 0) === 0 ? "healthy" : "failed"}`}><Icon name={(selectedAnalysis?.sodFindings.length ?? 0) === 0 ? "check" : "x"} />{(selectedAnalysis?.sodFindings.length ?? 0) === 0 ? "No SoD conflict" : "SoD review required"}</span>
            </div>}
          </section>

          <section className="panel matrix-panel">
            <div className="panel-head">
              <div><span className="step-tag">STEP 02</span><h2>Exact permission matrix</h2></div>
              <div className="matrix-legend"><span><i className="standard" />Standard</span><span><i className="sensitive" />Sensitive</span><span><i className="privileged" />Privileged</span></div>
            </div>
            <div className="matrix-scroll">
              <div className="permission-matrix" role="table" aria-label="Role permission matrix">
                <div className="matrix-row matrix-header" role="row">
                  <span>ENTITLEMENT / SYSTEM</span>
                  {lab.roles.map((role) => <span key={role.id} className={selectedRole?.id === role.id ? "selected-column" : ""} title={role.name}>{role.name.replace("Application Administrator", "App Administrator")}</span>)}
                </div>
                {loading ? <ListSkeleton /> : lab.permissions.map((permission) => (
                  <div className="matrix-row" role="row" key={permission.id}>
                    <span className="permission-name"><i className={permission.classification} /><strong>{permission.id}</strong><small>{permission.system} · {permission.label}</small></span>
                    {lab.roles.map((role) => {
                      const granted = role.permissions.includes(permission.id);
                      return <span key={role.id} className={`${selectedRole?.id === role.id ? "selected-column" : ""} ${granted ? "granted" : "not-granted"}`} aria-label={`${role.name}: ${granted ? "granted" : "not granted"}`}>{granted ? <Icon name="check" size={14} /> : "—"}</span>;
                    })}
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="rbac-test-grid">
            <article className="panel decision-panel">
              <div className="panel-head"><div><span className="step-tag">STEP 03</span><h2>Access decision simulator</h2></div><span className="live-control"><i />LIVE POLICY</span></div>
              <div className="decision-body">
                <div className="decision-form">
                  <label>IDENTITY<select value={selectedUser?.id ?? ""} onChange={(event) => { setTestUserId(event.target.value); setAccessResult(null); }}>{lab.users.map((user) => <option key={user.id} value={user.id}>{user.name} · {user.roleName}</option>)}</select></label>
                  <label>REQUESTED ENTITLEMENT<select value={testPermission} onChange={(event) => { setTestPermission(event.target.value); setAccessResult(null); }}>{lab.permissions.map((permission) => <option key={permission.id} value={permission.id}>{permission.id} · {permission.classification}</option>)}</select></label>
                </div>
                {selectedUser && <div className="decision-subject"><span className={`avatar avatar-${selectedUser.name.length % 4}`}>{initials(selectedUser.name)}</span><div><strong>{selectedUser.name}</strong><small>{selectedUser.roleName} · {selectedUser.status}</small></div><span>{selectedUser.access.length} effective permissions</span></div>}
                <button className="primary-action decision-run" disabled={!selectedUser || !testPermission || busy !== ""} onClick={() => runDecision("access")}><Icon name="play" />{busy === "access" ? "Evaluating policy…" : "Run access decision"}</button>
                <DecisionResult result={accessResult} placeholder="Run a test to prove whether this identity should receive the requested access." permission={permissionMap.get(testPermission)} />
              </div>
            </article>

            <article className="panel decision-panel">
              <div className="panel-head"><div><span className="step-tag">STEP 04</span><h2>Proposed role-change evaluator</h2></div><span className="guardrail"><Icon name="lock" size={13} />SoD guardrail</span></div>
              <div className="decision-body">
                <div className="decision-form">
                  <label>ROLE POLICY<select value={selectedRole?.id ?? ""} onChange={(event) => chooseRole(event.target.value)}>{lab.roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></label>
                  <label>PROPOSED ENTITLEMENT<select value={proposalPermission} onChange={(event) => { setProposalPermission(event.target.value); setProposalResult(null); }}>{lab.permissions.map((permission) => <option key={permission.id} value={permission.id}>{permission.id} · {permission.ownerDepartment}</option>)}</select></label>
                </div>
                <div className="sod-strip">
                  {lab.sodRules.map((rule) => <span key={rule.id}><b>{rule.id}</b><code>{rule.left}</code><i>×</i><code>{rule.right}</code></span>)}
                </div>
                <button className="primary-action decision-run" disabled={!selectedRole || !proposalPermission || busy !== ""} onClick={() => runDecision("proposal")}><Icon name="shield" />{busy === "proposal" ? "Checking guardrails…" : "Evaluate policy change"}</button>
                <DecisionResult result={proposalResult} placeholder="Evaluate a proposed entitlement before changing the role policy." permission={permissionMap.get(proposalPermission)} />
              </div>
            </article>
          </section>

          <section className="panel decision-history" id="decision-history">
            <div className="panel-head">
              <div><span className="step-tag">STEP 05</span><h2>Authorization decision evidence</h2></div>
              <div className="ledger-actions"><span className="integrity verified"><Icon name="check" />{lab.stats.decisionsTested} tests retained</span><button onClick={exportEvidence}><Icon name="download" />Export evidence</button></div>
            </div>
            <div className="decision-table" role="table" aria-label="RBAC decision history">
              <div className="decision-row decision-header" role="row"><span>TIME / TEST</span><span>SUBJECT / ROLE</span><span>ENTITLEMENT</span><span>DECISION</span><span>CONTROL</span></div>
              {loading ? <ListSkeleton /> : lab.history.slice(0, 12).map((decision) => (
                <div className="decision-row" role="row" key={decision.decisionKey}>
                  <span><code>{formatTime(decision.createdAt)}</code><small>{decision.decisionType === "ACCESS_TEST" ? "access request" : "role proposal"}</small></span>
                  <span><strong>{decision.subjectName}</strong><small>{decision.roleName}</small></span>
                  <span><code>{decision.permission}</code><small>{permissionMap.get(decision.permission)?.system ?? "Controlled catalogue"}</small></span>
                  <span><b className={`decision-chip ${decision.decision.toLowerCase()}`}>{decision.decision === "ALLOW" ? <Icon name="check" size={12} /> : <Icon name="x" size={12} />}{decision.decision}</b></span>
                  <span><code>{decision.control}</code><small>{decision.rationale}</small></span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}

function Metric({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: string }) {
  return <article className={`metric ${tone}`}><div><span>{label}</span><strong>{value}</strong></div><small><i />{detail}</small></article>;
}

function DecisionResult({ result, placeholder, permission }: { result: Decision | null; placeholder: string; permission?: Permission }) {
  if (!result) return <div className="decision-result empty"><Icon name="shield" size={23} /><div><strong>Awaiting control test</strong><p>{placeholder}</p></div></div>;
  return <div className={`decision-result ${result.decision.toLowerCase()}`}>
    <span className="decision-result-icon"><Icon name={result.decision === "ALLOW" ? "check" : "x"} size={21} /></span>
    <div><span>POLICY DECISION · {result.control}</span><h3>{result.decision} <small>{permission?.label ?? result.permission}</small></h3><p>{result.rationale}</p></div>
  </div>;
}

function ListSkeleton() {
  return <div className="skeleton-wrap" aria-label="Loading"><i /><i /><i /></div>;
}
