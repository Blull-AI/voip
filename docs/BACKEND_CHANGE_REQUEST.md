# Backend contract — API-Token SIP credentials for `@blull/voip`

> **Status:** implemented in `new-backend-monorepo` on 2026-07-22. Deployment of
> that backend version is required before an integration can call the endpoint.

## Why

The SDK is a browser softphone: it needs per-agent SIP registration credentials
(`extension`, `password`, `sipUri`, `sipDomain`, `displayName`, `wssUrl`,
`iceServers`) which it uses to REGISTER over WSS.

The session-authenticated Blull application obtains those credentials from:

```
GET /voip/credentials/me      @Auth()  →  keyed to { userId, tenantId } of the logged-in user
```

That endpoint is guarded by the user-session guard (`@Auth()`) and always returns
*the calling user's own* extension. A third-party website embedding the SDK has
**no logged-in Blull user** — it authenticates with a **tenant API Token**
(`blull_sk_…`) or a **reseller API key** (acting inside a child tenant via the
`x-blull-tenant-id` header) and needs credentials for **a specific agent /
SIP user (ramal)**, chosen by the integrator's backend.

Third-party integrations use the API-Token endpoint below instead.

## Endpoint

```
POST /voip/credentials
Auth: API Token (tenant `blull_sk_…`; or reseller key + `x-blull-tenant-id`)
Content-Type: application/json

{ "sipUserId": "550e8400-e29b-41d4-a716-446655440000" }
```

**Response** — identical shape to `GET /voip/credentials/me` (reuse
`SipCredentialsResponseDto`):

```json
{
  "extension": "1001",
  "password": "…",
  "sipUri": "sip:1001@empresa-a.blull.com.br",
  "sipDomain": "empresa-a.blull.com.br",
  "displayName": "Agent",
  "wssUrl": "wss://voip.blull.com.br:7443",
  "iceServers": [{ "urls": "stun:stun.blull.com.br:3478" }]
}
```

### Behaviour

- Resolve the tenant from the API Token (or from `x-blull-tenant-id` for a reseller
  `all_children` / `specific` key, validating the child is in scope).
- Resolve the SIP user by `sipUserId` **within that tenant**; return 404 when it
  is absent or inactive. Looking up by `{ tenantId, sipUserId }` is the
  multi-tenant guard — an API Token can never fetch another tenant's ramal.
- Return the same payload as `GET /voip/credentials/me`; both endpoints use the
  shared SIP-credential assembly service.
- Require API-key authentication. A normal Blull user JWT is not accepted by
  this endpoint.
- Rate-limit to 30 requests per minute, tracked by a hash of the API-key secret.
- Require the resolved tenant's parent `voip` feature flag and active VoIP
  settings. Reuse `VoipNotConfiguredForTenantError` and
  `SipCredentialsNotAvailableError` for unavailable credentials.
- The current implementation returns the SIP user's configured password,
  decrypted in memory from its encrypted-at-rest value. Short-lived or one-time
  SIP registration secrets remain a future hardening option; the SDK never
  persists the returned password and re-fetches credentials on `connect()`.

## Operator-to-ramal association

The API Token identifies the tenant; `sipUserId` identifies the exact SIP user
and extension. For a third-party product, the integrator's backend owns the
mapping from its authenticated operator to Blull's SIP user:

```
integrator operator id  ──►  Blull sipUserId  ──►  extension
```

The browser calls the integrator's own credentials endpoint using its normal
application session. That backend derives `sipUserId` from the authenticated
operator, calls Blull server-to-server, and returns only `SipCredentials`.
The browser must not be allowed to select an arbitrary `sipUserId`.

## Security notes for integrators (also in the SDK README)

- The API Token is a powerful tenant-scoped secret; a reseller `all_children`
  key is admin-wide across child tenants. It **must stay on the integrator's
  server** — never ship it in browser JavaScript.
- The integrator's backend derives `sipUserId` from its authenticated operator,
  calls this endpoint, and returns only the resulting
  `SipCredentials` to the browser. That is exactly what the SDK's
  `credentialsProvider` consumes.

## Session-authenticated alternative

The Blull application can continue using `GET /voip/credentials/me`, which
resolves the ramal linked to the logged-in Blull `{ userId, tenantId }`. The
API-Token endpoint is for third-party server-to-server integrations that choose
the operator through an explicit `sipUserId`.
