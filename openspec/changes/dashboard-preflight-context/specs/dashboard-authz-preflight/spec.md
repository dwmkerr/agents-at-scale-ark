## ADDED Requirements

### Requirement: Context reports the user's effective ark permissions

`GET /v1/context` SHALL include a `permissions` object reporting the authenticated
user's effective permissions for the `ark.mckinsey.com` API group in the resolved
namespace. The permissions SHALL be obtained from a Kubernetes
`SelfSubjectRulesReview` (SSRR) executed **as the impersonated user**, not as the
ark-api service account. The report is advisory: it SHALL NOT be used as an
authorization decision, and the API SHALL continue to enforce RBAC on every real
route independently.

The `permissions` object SHALL have the shape:

```jsonc
{
  "status": "ok" | "unavailable",
  "reason": "<string|null>",
  "rules":  { "<resource>": ["<verb>", ...], ... }
}
```

#### Scenario: User with a binding sees their effective verbs

- **WHEN** an impersonated user with a RoleBinding granting list/get on `agents` and
  `models` requests `GET /v1/context`
- **THEN** `permissions.status` is `"ok"`
- **AND** `permissions.rules` contains `agents` and `models` mapped to the granted
  verbs (e.g. `["get","list"]`)

#### Scenario: User with no ark access gets empty rules, not an error

- **WHEN** an impersonated user with no RoleBinding for `ark.mckinsey.com` requests
  `GET /v1/context`
- **THEN** `permissions.status` is `"ok"`
- **AND** `permissions.rules` is empty (`{}`)
- **AND** context resolution still succeeds (namespace/identity are returned)

### Requirement: Permissions are computed as the impersonated user with groups

The SSRR SHALL be executed through the impersonating client carrying both the
user identity and the user's groups. Group-based bindings SHALL be reflected in the
result. If the impersonating client is unavailable (impersonation cannot be
established), the API SHALL NOT fall back to evaluating the service account's
permissions.

#### Scenario: Group-based binding is reflected

- **WHEN** a user's access to `ark.mckinsey.com` resources comes only from a binding
  to one of their groups
- **THEN** `permissions.rules` includes the verbs granted via that group

#### Scenario: Impersonation unavailable does not leak service-account access

- **WHEN** the impersonating client cannot be established for the request
- **THEN** `permissions.status` is `"unavailable"`
- **AND** `permissions.rules` does NOT contain the service account's permissions

### Requirement: Wildcard rules are expanded

The API SHALL expand wildcard SSRR rules when building `permissions.rules`. A wildcard
`*` apiGroup, resource, or verb (for example a cluster-admin ClusterRole) SHALL be
treated as covering `ark.mckinsey.com` resources and SHALL NOT be silently omitted. A
wildcard verb SHALL be represented such that a client can determine that all verbs are
permitted.

#### Scenario: cluster-admin is not falsely reported as no-access

- **WHEN** an impersonated cluster-admin (ClusterRole with `apiGroups:["*"]`,
  `resources:["*"]`, `verbs:["*"]`) requests `GET /v1/context`
- **THEN** `permissions.status` is `"ok"`
- **AND** `permissions.rules` reflects full verb access to ark resources (the wildcard
  is expanded, not dropped)

### Requirement: Unreachable or incomplete authorization yields an unavailable status

The API SHALL report `permissions.status` as `"unavailable"` with a `reason` hint
when the SSRR result is marked `incomplete`, carries an `evaluationError`, or the
review call itself fails — rather than reporting `"ok"` with empty rules. Context
resolution (identity, namespace) SHALL still succeed.

#### Scenario: Authorizer cannot evaluate all rules

- **WHEN** the SSRR returns `status.incomplete = true` (e.g. a webhook authorizer is
  down)
- **THEN** `permissions.status` is `"unavailable"`
- **AND** `permissions.reason` contains the evaluation error or incomplete hint
- **AND** the user is NOT reported as having empty/no access

### Requirement: Dashboard gates the application on the permissions report

The dashboard SHALL resolve the context (identity, namespace, permissions) in a
single `ContextProvider` that wraps the namespace provider, and SHALL gate rendering
of the application on `permissions.status` and `permissions.rules`. The namespace
provider SHALL derive the current namespace from the resolved context and SHALL NOT
issue its own context request.

#### Scenario: Unavailable status shows a cluster-unavailable page

- **WHEN** the resolved context has `permissions.status === "unavailable"`
- **THEN** the dashboard renders a Cluster-Unavailable page stating access could not
  be evaluated for the namespace, including the `reason` hint
- **AND** the dashboard does NOT render the resource cards

#### Scenario: No essential access shows an access-denied page

- **WHEN** `permissions.status === "ok"` but `permissions.rules` does not satisfy the
  dashboard's essential resource set
- **THEN** the dashboard renders an Access-Denied page showing the signed-in identity,
  the namespace, and guidance to have an administrator create a RoleBinding
- **AND** the dashboard does NOT render the broken resource cards

#### Scenario: Sufficient access renders the app

- **WHEN** `permissions.status === "ok"` and `permissions.rules` satisfies the
  essential resource set
- **THEN** the dashboard renders the application normally

### Requirement: User-info page displays the permissions table

The dashboard's user-info page SHALL render the resolved `permissions.rules` as a
resource-to-verbs table, giving the signed-in user a self-check of what they can do
in the current namespace.

#### Scenario: User views their permissions

- **WHEN** a signed-in user opens the user-info page
- **THEN** they see a table listing each `ark.mckinsey.com` resource and the verbs they
  are permitted on it for the current namespace
