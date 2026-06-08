## Why

With `AUTH_MODE=sso` + user impersonation, **any** authenticated user reaches the
dashboard, but authorization is per-user Kubernetes RBAC. A user with no
RoleBinding (e.g. a freshly-onboarded SSO user) gets a 403 on every list/overview
call — every card renders "Failed to fetch data" with a stack of error toasts, and
**no** signal that this is an *authorization* state rather than a broken backend.
The dashboard never asks "what is this user allowed to do here?" up front.

ark-api already returns helpful 403 guidance ("a cluster administrator needs to
create a RoleBinding"), but the dashboard buries it in per-widget errors. There is
no permission-aware UI either: viewers see Create/Edit/Run controls that 403 on
click.

## What Changes

ark-api **reports** permissions; the dashboard **decides** how to render them. This
split is safe because the report is advisory (see below) and the API only owns the
parts a client cannot see.

- **ark-api** — `GET /v1/context` runs a `SelfSubjectRulesReview` (SSRR) **as the
  impersonated user (with groups)** via the existing `ImpersonatingClientPool` for
  the resolved namespace, and folds a `permissions` object into `ContextResponse`:

  ```jsonc
  "permissions": {
    "status": "ok" | "unavailable",   // authz REACHABILITY, not access policy
    "reason": "evaluationError: ...",  // hint when unavailable
    "rules":  {                        // ark.mckinsey.com effective verbs, wildcards expanded
      "agents":  ["get","list","create"],
      "models":  ["get","list"],
      "queries": ["get","list","create"]
    }
  }
  ```

  The API owns three things a client cannot derive itself:
  1. run SSRR **impersonated + groups** (comma-joined `Impersonate-Group` quirk);
  2. **normalize wildcards** — a `*` apiGroup/resource/verb (e.g. cluster-admin) is
     expanded so it is not silently missed;
  3. **reachability `status`** — SSRR `incomplete` / `evaluationError`, or a broken
     impersonation, yields `status: "unavailable"` + `reason` (never a bare
     `permissions: null`, never SA-fallback results).

  The API does **not** decide access — no `hasAccess`, no essential-set, no `denied`.

- **ark-dashboard** — extract a new `ContextProvider` **above** `NamespaceProvider`
  that owns the `useGetContext` call and exposes `{ identity, permissions, namespaces }`.
  The dashboard owns the policy and gates the app at the context level:
  - `status === "unavailable"` → `<ClusterUnavailable>` ("couldn't evaluate access
    for {namespace}" + `reason` hint);
  - `status === "ok"` but `rules` insufficient for the dashboard's essential resource
    set → `<AccessDenied>` (identity + namespace + RoleBinding guidance + missing
    resources);
  - otherwise → render the app.
  - `NamespaceProvider` becomes thin — derives `currentNamespace` from context, no
    longer owns the context fetch.
  - **User-info page** renders the `rules` map as a resource→verbs table — a
    convenient "what can I do here" self-check.

- SSRR is **advisory only** — the cluster 403 (enforced on every real route, #2376)
  stays the authoritative gate. The dashboard reasoning about `rules` is pure
  presentation; it can never grant access the server would reject. Returning a user
  their **own** effective rules (a self-review, == `kubectl auth can-i --list`) leaks
  nothing. Defense-in-depth UX, not an authorization decision.

Scope is **P1** only. Per-button verb gating (`usePermissions()` /
`SelfSubjectAccessReview`) is explicitly **out of scope** (future P2) — though the
dashboard already holds the full `rules` map, so P2 needs no new API call.

## Capabilities

### New Capabilities
- `dashboard-authz-preflight`: a single preflight that reports the authenticated
  user's effective `ark.mckinsey.com` permissions for the active namespace via SSRR
  (impersonated, wildcards expanded, reachability status), surfaced through
  `GET /v1/context`, and drives the dashboard's context-level gate
  (app / Access-Denied / Cluster-Unavailable) plus a user-info permissions table.

### Modified Capabilities
<!-- No existing capability's REQUIREMENTS change; api-impersonation enforcement is
     the foundation this builds on but its requirements are unchanged. -->

## Impact

- **ark-api**: `services/ark-api/src/ark_api/api/routes/context.py` (SSRR call,
  wildcard normalization, status derivation, `ContextResponse.permissions`), response
  model. Uses existing `ImpersonatingClientPool` and `ark-api-sa` impersonate grant
  (no new RBAC).
- **ark-dashboard**: new `providers/ContextProvider.tsx`; `providers/GlobalProviders.tsx`
  (wrap order); slimmed `providers/NamespaceProvider.tsx`; new `<AccessDenied>` +
  `<ClusterUnavailable>` components; user-info page permissions table;
  `lib/services/namespaces-hooks` / context types.
- **Foundation**: builds on `api-impersonation` (#2376) enforcement — the preflight
  report MUST match what the enforced routes actually permit.
- **Deployment**: forked ark-api + ark-dashboard images, applied via CI (corp proxy
  blocks local helm). No upstream CRD or cluster RBAC change.
