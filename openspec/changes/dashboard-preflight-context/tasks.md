## 1. ark-api: permissions model + helper

- [ ] 1.1 Add `permissions: PermissionsResponse | None = None` to `ContextResponse`; define `PermissionsResponse { status: Literal["ok","unavailable"]; reason: str | None; rules: dict[str, list[str]] }` in `models/context.py`.
- [ ] 1.2 Add pure helper `build_ark_rules(resource_rules)` that maps SSRR `resource_rules` to `{resource: [verbs]}` for group `ark.mckinsey.com`/`*`, records `*` resource under sentinel `"*"`, keeps `*` verb literal, merges/dedupes verbs.
- [ ] 1.3 Unit-test the helper: namespaced binding, group-only binding, wildcard `*/*/*` → `{"*":["*"]}`, no rules → `{}`.

## 2. ark-api: SSRR wiring in /context

- [ ] 2.1 Add `impersonation = Depends(get_impersonation_config)` to `get_context_endpoint`; keep SA `ApiClient()` for the namespace-label/read-only check.
- [ ] 2.2 Run `create_self_subject_rules_review` (namespace=target) via `get_impersonating_api_client(impersonation)`; build `rules` from the result.
- [ ] 2.3 Derive `status`: `incomplete`/`evaluation_error` → `unavailable`+reason; call raises or impersonation absent → `unavailable`+reason (never SA fallback); else `ok`. Attach `permissions` to `ContextResponse`.
- [ ] 2.4 Verify `Impersonate-Group` is emitted as repeated headers (one per group), not comma-joined; fix the SSRR client path if needed. Test with two groups.
- [ ] 2.5 Endpoint tests: viewer (rules populated, ok), no-binding user (`{}`, ok), incomplete SSRR (`unavailable`), cluster-admin (`{"*":["*"]}`, ok).

## 3. ark-dashboard: ContextProvider + gate

- [ ] 3.1 Extend context types/hooks (`lib/services` + `useGetContext`) with `permissions {status, reason, rules}`.
- [ ] 3.2 Create `providers/ContextProvider.tsx` owning `useGetContext`, exposing `{identity, permissions, namespaces, isResolved}`.
- [ ] 3.3 Wrap order in `GlobalProviders.tsx`: `ContextProvider` outside `NamespaceProvider`.
- [ ] 3.4 Slim `NamespaceProvider`: drop `useGetContext`, derive `currentNamespace` from context.
- [ ] 3.5 Add `<ClusterUnavailable>` and `<AccessDenied>` components; gate in ContextProvider (unavailable → ClusterUnavailable; ok & essential-set unmet → AccessDenied; else children). Essential-set constant `agents,models,queries,teams,tools`, satisfied by `list` (`"*"` resource/verb counts).
- [ ] 3.6 Provider/gate tests: unavailable, denied (no rules), allowed (viewer), wildcard admin.

## 4. ark-dashboard: user-info permissions table

- [ ] 4.1 Render `permissions.rules` as a resource→verbs table on the user-info page (`"*"` row labelled "all").
- [ ] 4.2 Test the table renders rows from context rules.

## 5. Build + deploy + verify

- [ ] 5.1 Build forked ark-api + ark-dashboard images; push overrides via CI (corp proxy blocks local helm).
- [ ] 5.2 Verify on demo cluster: no-RoleBinding user → AccessDenied; viewer → app + read-only; admin → app; user-info table correct.
