## Context

`GET /v1/context` is the dashboard's first call and its app-gating call
(`NamespaceProvider.useGetContext` → `isNamespaceResolved`). Today it returns
`{ namespace, cluster, read_only_mode }` and is served by `get_context_endpoint` in
`api/v1/namespaces.py`, using a plain service-account `ApiClient()` to read the
namespace's demo label. It carries **no** per-user authorization signal, so an
SSO user with no RoleBinding gets a 403 on every card and no explanation.

Foundation: `api-impersonation` (#2376) already enforces per-user RBAC on every real
route via `ImpersonationConfig` + impersonating clients. This change adds an
**advisory** preflight report on top of that enforcement — it must mirror what the
enforced routes actually permit.

## Goals / Non-Goals

**Goals**
- Report the impersonated user's effective `ark.mckinsey.com` permissions in
  `GET /v1/context`, with wildcard expansion and an explicit reachability status.
- Dashboard owns the access policy: gate app / Access-Denied / Cluster-Unavailable,
  plus a user-info permissions table.

**Non-Goals**
- Per-button verb gating / `SelfSubjectAccessReview` (future P2).
- Label-driven multi-namespace visibility (future).
- Changing enforcement — SSRR is advisory; the cluster 403 stays the real gate.

## Decisions

### D1 — Report, don't decide (thin API)
ark-api returns `permissions { status, reason, rules }`; the dashboard derives
`hasAccess` from its own essential-set. **Why:** SSRR is advisory and self-scoped, so
UI-side policy is not a security boundary (the server 403 is). Keeps the essential-set
a UI concern that can change without an API release, and P2 button-gating reads the
same `rules` with no new call. *Alternative (API returns `hasAccess`/`missing`)*:
bakes product policy into the API and needs an API change whenever the dashboard's
needs shift — rejected.

### D2 — `get_context` stays on the SA for env metadata, SSRR runs impersonated
The endpoint keeps using the SA `ApiClient()` for the namespace-label / read-only
check (env metadata, not a user resource), and additionally runs the SSRR through
`get_impersonating_api_client(impersonation)`. **Why:** matches the locked design —
context reports env metadata on the SA but reports *user* capability as the user.
Add `impersonation: ImpersonationConfig = Depends(get_impersonation_config)` to the
endpoint signature (currently absent).

### D3 — SSRR call
`AuthorizationV1Api(api).create_self_subject_rules_review(V1SelfSubjectRulesReview(
spec=V1SelfSubjectRulesReviewSpec(namespace=target_namespace)))`. Self-reviews are
allowed for any authenticated identity, and `ark-api-sa` already has `impersonate`,
so no new RBAC. Map `status.resource_rules` → `rules`; read `status.incomplete` /
`status.evaluation_error` for status.

### D4 — Wildcard + group-scope normalization (`rules` builder)
A small pure helper turns `resource_rules` into `{ resource: [verbs] }` for the
`ark.mckinsey.com` group:
- a rule matches when `api_groups` contains `ark.mckinsey.com` **or** `*`;
- for a matching rule, each entry in `resources` (or `*`) maps to the rule's `verbs`;
- a `*` resource is recorded under a sentinel key `"*"` meaning "all ark resources";
- a `*` verb is recorded as the literal `"*"` in the verb list (client treats as
  all-verbs). Verbs are merged/deduped across rules per resource.

**Why a `"*"` sentinel** rather than expanding against a hardcoded resource list:
ark-api should not need to know the full ark CRD set; the dashboard interprets `"*"`
as "any". Cluster-admin (`*/*/*`) therefore yields `rules = { "*": ["*"] }`,
`status: ok` — not a false no-access.

### D5 — Status derivation
- `incomplete == true` **or** `evaluation_error` set → `status: "unavailable"`,
  `reason` = the evaluation error / "authorization evaluation incomplete".
- SSRR call raises, or impersonation config is absent/unusable → `status:
  "unavailable"`, `reason` = exception summary; **never** fall back to SA SSRR (that
  would report the SA's broad access as the user's).
- otherwise → `status: "ok"`, `rules` populated (possibly `{}`).
Context resolution (namespace/cluster/read_only) never fails because of SSRR.

### D6 — Dashboard: ContextProvider above NamespaceProvider
Extract `providers/ContextProvider.tsx` that owns `useGetContext` and exposes
`{ identity, permissions, namespaces, isResolved }`. `GlobalProviders` wraps
`ContextProvider` **outside** `NamespaceProvider`. `NamespaceProvider` drops its
`useGetContext` call and derives `currentNamespace` from context.
Gate (in ContextProvider, once resolved):
- `permissions.status === "unavailable"` → `<ClusterUnavailable reason ns/>`
- `permissions.status === "ok"` && essential-set not satisfied by `rules` →
  `<AccessDenied identity ns missing/>`
- else → children.
Essential-set (UI constant, P1): `agents, models, queries, teams, tools`; satisfied
when each can be `list`-ed (a `"*"` resource key or `"*"` verb counts). **Why in UI:**
D1; lets the gate evolve without an API change.

### D7 — User-info page permissions table
The user-info page reads `permissions.rules` from context and renders a
resource→verbs table (a `"*"` row labelled "all"). No new fetch.

## Risks / Trade-offs

- **Comma-joined `Impersonate-Group` under-reports** → `client_utils` sets a single
  `Impersonate-Group: a,b` header; k8s expects **repeated** headers, so group-based
  bindings can be missed and a real user falsely Access-Denied. → Mitigation: for the
  SSRR client, set one `Impersonate-Group` header **per group** (verify against the
  #2376 impersonating client; fix the helper if it comma-joins). Add a test with two
  groups.
- **resourceNames / get-vs-list over-report** → a rule scoped to named resources or
  to `get` only still appears as a verb; UI may show a list that 403s. → Mitigation:
  advisory only; the real 403 still gates. Document; revisit in P2.
- **SSRR adds a call to context** → one extra authz round-trip on the hot path. →
  Mitigation: best-effort + cheap (single self-review); failures degrade to
  `unavailable`, never block context.

## Migration Plan

1. ark-api: add `permissions` to `ContextResponse` (optional field, default `None`),
   implement helper + SSRR, wire into `get_context_endpoint`. Unit tests.
2. ark-dashboard: extract `ContextProvider`, slim `NamespaceProvider`, add
   `<AccessDenied>` / `<ClusterUnavailable>`, user-info table. Component tests.
3. Build forked ark-api + ark-dashboard images; deploy via CI (corp proxy blocks
   local helm). Verify on demo cluster with a no-RoleBinding user, a viewer, and an
   admin.
Rollback: `permissions` is additive/optional — older dashboards ignore it; revert
image overrides to disable.

## Open Questions

- Does the #2376 impersonating client already emit repeated `Impersonate-Group`
  headers, or must the helper be fixed? (Resolve during impl — see Risks.)
- User-info page location/route in the current dashboard nav (confirm during impl).
