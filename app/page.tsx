"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
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
  updatedAt: string;
};

type AuditEvent = {
  id: number;
  eventKey: string;
  userId: string;
  userName: string;
  action: string;
  actor: string;
  fromRole: string | null;
  toRole: string | null;
  eventHash: string;
  createdAt: string;
  metadata: {
    addedPermissions?: string[];
    removedPermissions?: string[];
    note?: string;
  };
};

type LabState = {
  users: Identity[];
  roles: Role[];
  events: AuditEvent[];
  stats: {
    activeIdentities: number;
    roleChanges: number;
    permissionsRevoked: number;
    orphanedPermissions: number;
    chainVerified: boolean;
  };
};

type IconName = "grid" | "users" | "roles" | "pulse" | "key" | "ledger" | "search" | "plus" | "arrow" | "shield" | "download" | "check" | "x";

const iconPaths: Record<IconName, React.ReactNode> = {
  grid: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
  roles: <><circle cx="12" cy="8" r="4"/><path d="M4.93 19.07a10 10 0 0 1 14.14 0M12 12v9"/></>,
  pulse: <path d="M3 12h4l2.5-7 5 14 2.5-7h4"/>,
  key: <><circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.7 12.3 8-8M15 8l3 3M17 6l3 3"/></>,
  ledger: <><path d="M6 3h12a2 2 0 0 1 2 2v16H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/><path d="M8 7h8M8 11h8M8 15h5"/></>,
  search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
  plus: <path d="M12 5v14M5 12h14"/>,
  arrow: <path d="m9 18 6-6-6-6"/>,
  shield: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/>,
  download: <><path d="M12 3v12m0 0 4-4m-4 4-4-4"/><path d="M5 20h14"/></>,
  check: <path d="m5 12 4 4L19 6"/>,
  x: <path d="m6 6 12 12M18 6 6 18"/>,
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

function actionLabel(action: string) {
  return action.toLowerCase().replaceAll("_", " ");
}

const EMPTY_STATE: LabState = {
  users: [], roles: [], events: [],
  stats: { activeIdentities: 0, roleChanges: 0, permissionsRevoked: 0, orphanedPermissions: 0, chainVerified: true },
};

export default function Home() {
  const [lab, setLab] = useState<LabState>(EMPTY_STATE);
  const [selectedId, setSelectedId] = useState("");
  const [targetRoleId, setTargetRoleId] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "offboarded">("all");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [showOffboard, setShowOffboard] = useState(false);

  const selected = lab.users.find((user) => user.id === selectedId) ?? lab.users[0];
  const resolvedTargetRoleId = targetRoleId || lab.roles.find((role) => role.id !== selected?.roleId)?.id || "";
  const targetRole = lab.roles.find((role) => role.id === resolvedTargetRoleId);
  const filteredUsers = lab.users.filter((user) => {
    const matchesStatus = statusFilter === "all" || user.status === statusFilter;
    const query = search.toLowerCase();
    const matchesSearch = !query || `${user.name} ${user.email} ${user.roleName}`.toLowerCase().includes(query);
    return matchesStatus && matchesSearch;
  });
  const accessDelta = useMemo(() => {
    if (!selected || !targetRole) return { added: [], removed: [] };
    return {
      added: targetRole.permissions.filter((permission) => !selected.access.includes(permission)),
      removed: selected.access.filter((permission) => !targetRole.permissions.includes(permission)),
    };
  }, [selected, targetRole]);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const response = await fetch("/api/identity-lab", { cache: "no-store" });
        const data = (await response.json()) as LabState & { error?: string };
        if (!response.ok) throw new Error(data.error || "Unable to load the identity lab.");
        if (!active) return;
        setLab(data);
        if (data.users[0]) setSelectedId((current) => current || data.users[0].id);
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : "Unable to load the identity lab.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, []);

  async function runAction(payload: Record<string, unknown>, successMessage: string) {
    try {
      setBusy(true);
      setError("");
      const response = await fetch("/api/identity-lab", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as { state?: LabState; selectedUserId?: string; error?: string };
      if (!response.ok || !data.state) throw new Error(data.error || "The lifecycle action failed.");
      setLab(data.state);
      if (data.selectedUserId) setSelectedId(data.selectedUserId);
      setTargetRoleId("");
      setToast(successMessage);
      window.setTimeout(() => setToast(""), 3600);
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The lifecycle action failed.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function applyRoleChange() {
    if (!selected || !targetRole) return;
    await runAction({ action: "transfer_role", userId: selected.id, roleId: targetRole.id }, `${selected.name} moved to ${targetRole.name}. Legacy access was revoked.`);
  }

  async function confirmOffboard() {
    if (!selected) return;
    const success = await runAction({ action: "offboard_user", userId: selected.id }, `${selected.name} was offboarded and all access was removed.`);
    if (success) setShowOffboard(false);
  }

  function exportEvidence() {
    const evidence = { exportedAt: new Date().toISOString(), lab: "IdentityShield — User Lifecycle Management", chainVerified: lab.stats.chainVerified, events: lab.events };
    const blob = new Blob([JSON.stringify(evidence, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "identityshield-audit-evidence.json";
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
          <Link href="/" className="active"><Icon name="users" />Lifecycle<span>01</span></Link>
          <Link href="#audit-ledger"><Icon name="ledger" />Evidence log</Link>
          <p className="nav-label">CONTROL LABS</p>
          <Link href="/rbac"><Icon name="roles" />Role policies<small>02</small></Link>
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
          <div className="crumbs"><span>Control labs</span><Icon name="arrow" size={14} /><strong>User lifecycle</strong></div>
          <div className="environment"><span className="status-dot" />SYNTHETIC ENVIRONMENT <b>LAB 01</b></div>
        </header>

        <div className="content">
          <section className="hero-strip">
            <div>
              <p className="eyebrow">IDENTITY GOVERNANCE / JOINER–MOVER–LEAVER</p>
              <h1>Lifecycle control room</h1>
              <p>Provision identities, enforce clean role transitions, and prove access removal through a chained audit ledger.</p>
            </div>
            <div className="lab-objective">
              <span>LAB OBJECTIVE</span><strong>Complete the access lifecycle</strong>
              <div className="objective-flow"><b>ADD USER</b><i /><b>MOVE ROLE</b><i /><b>REVOKE</b><i /><b>VERIFY</b></div>
            </div>
          </section>

          {error && <div className="error-banner"><Icon name="x" />{error}<button onClick={() => setError("")} aria-label="Dismiss error">×</button></div>}
          {toast && <div className="toast"><span><Icon name="check" /></span>{toast}</div>}

          <section className="metrics" aria-label="Lab metrics">
            <Metric label="Active identities" value={loading ? "—" : String(lab.stats.activeIdentities).padStart(2, "0")} detail="IN POLICY" tone="cyan" />
            <Metric label="Role transitions" value={loading ? "—" : String(lab.stats.roleChanges).padStart(2, "0")} detail="THIS LAB" tone="violet" />
            <Metric label="Access revoked" value={loading ? "—" : String(lab.stats.permissionsRevoked).padStart(2, "0")} detail="PERMISSIONS" tone="orange" />
            <Metric label="Orphaned access" value={loading ? "—" : String(lab.stats.orphanedPermissions).padStart(2, "0")} detail={lab.stats.orphanedPermissions === 0 ? "NO FINDINGS" : "REVIEW NOW"} tone="lime" />
          </section>

          <section className="lab-grid">
            <article className="panel identity-panel">
              <div className="panel-head">
                <div><span className="step-tag">STEP 01</span><h2>Select an identity</h2></div>
                <button className="primary-small" onClick={() => setShowAdd(true)}><Icon name="plus" />Add identity</button>
              </div>
              <div className="identity-tools">
                <label className="search-box"><Icon name="search" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search identities" aria-label="Search identities" /></label>
                <div className="filters" role="group" aria-label="Identity status filter">
                  {(["all", "active", "offboarded"] as const).map((filter) => <button key={filter} className={statusFilter === filter ? "selected" : ""} onClick={() => setStatusFilter(filter)}>{filter}</button>)}
                </div>
              </div>
              <div className="identity-list">
                {loading ? <ListSkeleton /> : filteredUsers.map((user) => (
                  <button key={user.id} className={`identity-row ${selected?.id === user.id ? "selected" : ""}`} onClick={() => { setSelectedId(user.id); setTargetRoleId(""); }}>
                    <span className={`avatar avatar-${user.name.length % 4}`}>{initials(user.name)}</span>
                    <span className="identity-main"><strong>{user.name}</strong><small>{user.email}</small></span>
                    <span className="identity-role"><strong>{user.roleName}</strong><small>{user.department}</small></span>
                    <span className={`state ${user.status}`}><i />{user.status}</span><Icon name="arrow" size={16} />
                  </button>
                ))}
                {!loading && filteredUsers.length === 0 && <div className="empty-list">No identities match this view.</div>}
              </div>
            </article>

            <article className="panel workflow-panel">
              <div className="panel-head"><div><span className="step-tag">STEP 02</span><h2>Change role</h2></div>{selected && <span className={`state ${selected.status}`}><i />{selected.status}</span>}</div>
              {selected ? <>
                <div className="selected-profile">
                  <span className={`avatar large avatar-${selected.name.length % 4}`}>{initials(selected.name)}</span>
                  <div><p>SELECTED IDENTITY</p><strong>{selected.name}</strong><span>{selected.department} · Manager: {selected.manager}</span></div>
                </div>
                <div className="role-route">
                  <div><label>CURRENT ROLE</label><strong>{selected.roleName}</strong><span>{selected.access.length} effective permissions</span></div>
                  <span className="route-arrow">→</span>
                  <div><label htmlFor="target-role">TARGET ROLE</label><select id="target-role" value={resolvedTargetRoleId} disabled={selected.status !== "active"} onChange={(event) => setTargetRoleId(event.target.value)}><option value="">Select role</option>{lab.roles.filter((role) => role.id !== selected.roleId).map((role) => <option key={role.id} value={role.id}>{role.name}{role.privileged ? " · privileged" : ""}</option>)}</select><span>{targetRole?.department ?? "Choose an approved policy"}</span></div>
                </div>
                <div className="delta-head"><div><span className="step-tag">STEP 03</span><h3>Review access delta</h3></div><span className="policy-pass"><Icon name="shield" size={14} />Policy check passed</span></div>
                <div className="permission-columns">
                  <PermissionList title="REVOKE BEFORE GRANT" permissions={accessDelta.removed} kind="removed" empty="No legacy permissions" />
                  <PermissionList title="GRANT FROM POLICY" permissions={accessDelta.added} kind="added" empty="No new permissions" />
                </div>
                <div className="workflow-actions">
                  <button className="danger-ghost" disabled={selected.status !== "active" || busy} onClick={() => setShowOffboard(true)}>Offboard identity</button>
                  <button className="primary-action" disabled={!targetRole || selected.status !== "active" || busy} onClick={applyRoleChange}>{busy ? "Applying controls…" : "Apply role change"}<Icon name="arrow" /></button>
                </div>
              </> : <div className="empty-workflow">Select an identity to begin.</div>}
            </article>
          </section>

          <section className="panel ledger-panel" id="audit-ledger">
            <div className="panel-head">
              <div><span className="step-tag">STEP 04</span><h2>Verify the audit ledger</h2></div>
              <div className="ledger-actions"><span className={`integrity ${lab.stats.chainVerified ? "verified" : "failed"}`}><Icon name={lab.stats.chainVerified ? "check" : "x"} />Hash chain {lab.stats.chainVerified ? "verified" : "failed"}</span><button onClick={exportEvidence}><Icon name="download" />Export evidence</button></div>
            </div>
            <div className="ledger-table" role="table" aria-label="Lifecycle audit events">
              <div className="ledger-row ledger-header" role="row"><span>EVENT / TIME</span><span>IDENTITY</span><span>CONTROL ACTION</span><span>ACCESS DELTA</span><span>INTEGRITY</span></div>
              {loading ? <ListSkeleton /> : lab.events.slice(0, 8).map((event) => (
                <div className="ledger-row" role="row" key={event.eventKey}>
                  <span><code>EVT-{String(event.id).padStart(4, "0")}</code><small>{formatTime(event.createdAt)}</small></span>
                  <span><strong>{event.userName}</strong><small>by {event.actor}</small></span>
                  <span><b className={`action action-${event.action.toLowerCase()}`}>{actionLabel(event.action)}</b><small>{event.fromRole && `${event.fromRole} → `}{event.toRole}</small></span>
                  <span className="delta-summary"><b className="minus">−{event.metadata.removedPermissions?.length ?? 0}</b><b className="plus">+{event.metadata.addedPermissions?.length ?? 0}</b></span>
                  <span className="hash"><i /><code>{event.eventHash.slice(0, 10)}…</code></span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </section>

      {showAdd && <AddIdentityModal roles={lab.roles} busy={busy} onClose={() => setShowAdd(false)} onSubmit={async (values) => { const success = await runAction({ action: "add_user", ...values }, `${values.name} was provisioned with policy-based access.`); if (success) setShowAdd(false); }} />}
      {showOffboard && selected && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setShowOffboard(false); }}><div className="modal confirm-modal" role="dialog" aria-modal="true" aria-labelledby="offboard-title"><button className="modal-close" onClick={() => setShowOffboard(false)} aria-label="Close"><Icon name="x" /></button><span className="warning-icon"><Icon name="key" /></span><p className="eyebrow">DESTRUCTIVE LIFECYCLE ACTION</p><h2 id="offboard-title">Remove all access for {selected.name}?</h2><p>This disables the identity, removes its assigned role, and revokes <strong>{selected.access.length} effective permissions</strong>. The evidence remains in the audit ledger.</p><div className="modal-actions"><button className="secondary-button" onClick={() => setShowOffboard(false)}>Cancel</button><button className="danger-button" disabled={busy} onClick={confirmOffboard}>{busy ? "Revoking access…" : `Revoke ${selected.access.length} permissions`}</button></div></div></div>}
    </main>
  );
}

function Metric({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: string }) {
  return <article className={`metric ${tone}`}><div><span>{label}</span><strong>{value}</strong></div><small><i />{detail}</small></article>;
}

function PermissionList({ title, permissions, kind, empty }: { title: string; permissions: string[]; kind: "added" | "removed"; empty: string }) {
  return <div className={`permission-list ${kind}`}><p>{title}<span>{permissions.length}</span></p><div>{permissions.length ? permissions.map((permission) => <span key={permission}><Icon name={kind === "added" ? "plus" : "x"} size={13} />{permission}</span>) : <em>{empty}</em>}</div></div>;
}

function ListSkeleton() {
  return <div className="skeleton-wrap" aria-label="Loading"><i /><i /><i /></div>;
}

function AddIdentityModal({ roles, busy, onClose, onSubmit }: { roles: Role[]; busy: boolean; onClose: () => void; onSubmit: (values: { name: string; email: string; manager: string; roleId: string }) => Promise<void> }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [manager, setManager] = useState("");
  const [roleId, setRoleId] = useState(roles.find((role) => !role.privileged)?.id ?? "");

  async function submit(event: FormEvent) {
    event.preventDefault();
    await onSubmit({ name, email, manager, roleId });
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}><form className="modal add-modal" role="dialog" aria-modal="true" aria-labelledby="add-title" onSubmit={submit}><button type="button" className="modal-close" onClick={onClose} aria-label="Close"><Icon name="x" /></button><p className="eyebrow">JOINER WORKFLOW</p><h2 id="add-title">Provision a new identity</h2><p>Create the identity from an approved role policy. Direct permission grants are intentionally blocked.</p><div className="form-grid"><label>Full name<input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Aisha Rahman" /></label><label>Work email<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="aisha@northstar.example" /></label><label>Manager<input required value={manager} onChange={(event) => setManager(event.target.value)} placeholder="Manager name" /></label><label>Approved role<select required value={roleId} onChange={(event) => setRoleId(event.target.value)}>{roles.map((role) => <option key={role.id} value={role.id}>{role.name}{role.privileged ? " · privileged" : ""}</option>)}</select></label></div><div className="policy-note"><Icon name="shield" /><div><strong>Least-privilege policy enforced</strong><span>Access is derived only from the selected role.</span></div></div><div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button type="submit" className="primary-action" disabled={busy}>{busy ? "Provisioning…" : "Provision identity"}<Icon name="plus" /></button></div></form></div>;
}
