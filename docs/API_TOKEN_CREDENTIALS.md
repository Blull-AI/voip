# SIP credentials with a Blull API Token

Use this server-to-server endpoint to obtain the SIP credentials for one
operator's ramal. The Blull API Token must remain on your server.

## Request

```http
POST /voip/credentials
Content-Type: application/json
x-api-key: blull_sk_...

{
  "sipUserId": "550e8400-e29b-41d4-a716-446655440000"
}
```

You can alternatively send the API Token as:

```http
Authorization: Bearer blull_sk_...
```

For a reseller API key acting inside an authorized child tenant, also send:

```http
x-blull-tenant-id: <child-tenant-uuid>
```

## Response

```json
{
  "extension": "1001",
  "password": "...",
  "sipUri": "sip:1001@empresa-a.blull.com.br",
  "sipDomain": "empresa-a.blull.com.br",
  "displayName": "Agent",
  "wssUrl": "wss://voip.blull.com.br:7443",
  "iceServers": [{ "urls": "stun:stun.blull.com.br:3478" }]
}
```

The endpoint returns credentials only when the SIP user is active and belongs
to the tenant resolved from the API Token. Requests are limited to 30 per
minute per API key.

Possible errors:

- `400` — invalid request body.
- `401` — missing, invalid, or revoked API Token.
- `403` — VoIP is unavailable for the tenant, or a reseller key cannot act
  inside the requested child tenant.
- `404` — the SIP user is unavailable in the resolved tenant.
- `429` — rate limit exceeded.

## Associate operators with ramais

Provision one Blull SIP user per operator and save its stable `sipUserId` in
your backend:

```
your operator id  ──►  Blull sipUserId  ──►  extension
```

When the SDK calls your credentials endpoint, identify the operator from your
normal server-side session, derive the associated `sipUserId`, and call Blull.
Do not let the browser choose an arbitrary `sipUserId`; otherwise one operator
could request another operator's SIP password.

Return only the resulting `SipCredentials` to the browser. The SDK keeps the
password in memory and fetches credentials again whenever `connect()` or
`reconnect()` needs a new SIP registration.

## Security

- Never include the Blull API Token in browser JavaScript, mobile bundles,
  public environment variables, logs, or client-side storage.
- Keep returned SIP passwords in memory only. Do not save them in
  `localStorage`, `sessionStorage`, IndexedDB, or cookies.
- A reseller key may authorize access to multiple child tenants; store and
  handle it as a privileged secret.
