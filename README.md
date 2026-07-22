# @blull/voip

> Embed Blull browser calling in any website — a WebRTC softphone over SIP.

`@blull/voip` turns a browser into a softphone that registers to the **Blull
VoIP server** and makes/receives real phone calls over SIP (secure WebSocket +
WebRTC). It exposes a small, typed API: `connect`, `dial`, `accept`/`reject`,
`hangup`, `mute`, DTMF, and device selection — with events for registration and
call state. There is a framework-agnostic core and an optional React adapter.

- **Framework-agnostic core** — `@blull/voip`
- **React adapter** — `@blull/voip/react` (`<SoftphoneProvider>` + `useSoftphone()`)

## Install

```bash
npm install @blull/voip
# React adapter also needs react >= 18 (a peer dependency you already have)
```

## Security model — where the API Token lives

The SDK **never** sees your Blull API Token. You give it a `credentialsProvider`:
an `async` function that returns one agent's [`SipCredentials`](#sipcredentials).
Wire that to **your own backend**, which holds the `blull_sk_…` API Token, calls
Blull to fetch the selected SIP user's credentials, and returns only those to
the browser.

```
Browser (SDK)  ──credentialsProvider()──►  Your backend  ──API Token──►  Blull
     ▲                                          │
     └──────────────  SipCredentials  ──────────┘   (token stays server-side)
```

> The API Token is a tenant-scoped secret (a reseller `all_children` key is
> admin-wide across child tenants). **Never** ship it in browser JavaScript.
>
> Blull exposes `POST /voip/credentials` for API-Token integrations. It accepts
> `{ "sipUserId": "…" }`; reseller keys select an authorized child tenant with
> `x-blull-tenant-id`. See the complete
> [backend contract](docs/BACKEND_CHANGE_REQUEST.md).

### Associate each operator with a ramal

Provision one Blull SIP user (ramal) per operator and store the stable
`sipUserId` in your backend:

```
your operator 42  ──►  sipUserId a1…  ──►  extension 1001
your operator 77  ──►  sipUserId b2…  ──►  extension 1002
```

When the browser asks your backend for credentials, derive `sipUserId` from the
authenticated operator's server-side session. **Do not accept an arbitrary
`sipUserId` from the browser**: otherwise one operator could request another
operator's SIP password.

```ts
// Runs on YOUR server. Never expose BLULL_API_TOKEN to the browser.
app.get('/api/voip/credentials', requireSession, async (req, res) => {
  const sipUserId = await findSipUserIdForOperator(req.user.id)

  const response = await fetch(`${process.env.BLULL_API_URL}/voip/credentials`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.BLULL_API_TOKEN!,
    },
    body: JSON.stringify({ sipUserId }),
  })

  if (!response.ok) {
    return res.status(response.status).json({ error: 'SIP credentials unavailable' })
  }

  return res.json(await response.json())
})
```

For a reseller key acting inside a child tenant, also send
`x-blull-tenant-id: <child-tenant-uuid>` in the server-to-server request.
The API validates that the `sipUserId` belongs to the resolved tenant.

The SDK registers the returned extension over WSS. Calls routed to that
extension reach that operator's registered browser; carrier, DID, and queue
routing remain part of the tenant's PBX configuration.

## Quick start (React)

```tsx
'use client'

import { type SipCredentials, SoftphoneProvider, useSoftphone } from '@blull/voip/react'
import { useState } from 'react'

async function fetchCredentials(): Promise<SipCredentials> {
  const res = await fetch('/api/voip/credentials', { credentials: 'include' })
  if (!res.ok) throw new Error('Failed to load SIP credentials')
  return res.json()
}

function Dialer() {
  const { registrationState, callState, remoteIdentity, isMuted, dial, hangup, toggleMute } = useSoftphone()
  const [number, setNumber] = useState('')

  if (callState && callState !== 'ended') {
    return (
      <div>
        <p>{callState} — {remoteIdentity}</p>
        <button onClick={() => toggleMute()}>{isMuted ? 'Unmute' : 'Mute'}</button>
        <button onClick={() => void hangup()}>Hang up</button>
      </div>
    )
  }
  return (
    <div>
      <p>{registrationState}</p>
      <input value={number} onChange={(e) => setNumber(e.target.value)} />
      <button onClick={() => void dial(number)}>Call</button>
    </div>
  )
}

export function App() {
  return (
    <SoftphoneProvider config={{ credentialsProvider: fetchCredentials }}>
      <Dialer />
    </SoftphoneProvider>
  )
}
```

`<SoftphoneProvider>` connects on mount and disconnects on unmount by default
(`autoConnect`). See [`examples/react/App.tsx`](examples/react/App.tsx) for
inbound-call handling.

## Quick start (vanilla / any framework)

```ts
import { createSoftphone } from '@blull/voip'

const phone = createSoftphone({ credentialsProvider: fetchCredentials })

phone.on('registrationStateChanged', (state) => console.log('registration:', state))
phone.on('incomingCall', (call) => void call.accept())

await phone.connect()

const call = await phone.dial('(11) 91234-5678')
call.on('stateChanged', (state) => {
  if (state === 'in-call') console.log('connected')
  if (state === 'ended') console.log('call over')
})

// later…
call.setMuted(true)
call.sendDtmf('1')
await call.hangup()
```

Full page in [`examples/vanilla`](examples/vanilla).

## API

### `createSoftphone(config): Softphone`

| `config` field        | Type                                   | Default                        | Notes |
| --------------------- | -------------------------------------- | ------------------------------ | ----- |
| `credentialsProvider` | `() => Promise<SipCredentials>`        | **required**                   | Returns one agent's SIP credentials. |
| `remoteAudioElement`  | `HTMLAudioElement`                     | a hidden one is created        | Sink for the far-end audio. |
| `media.inputDeviceId` | `string`                               | browser default                | Microphone `deviceId`. |
| `media.outputDeviceId`| `string`                               | browser default                | Speaker `deviceId` (`setSinkId`). |
| `media.ringback`      | `boolean`                              | `true`                         | Local ringback tone while dialing. |
| `normalizePhoneNumber`| `(raw: string) => string`              | Brazilian ninth-digit          | Return `''` to reject a number. |
| `logLevel`            | `'debug' \| 'warn' \| 'error' \| 'silent'` | `'warn'`                   | SDK log verbosity. |

### `Softphone`

| Member                          | Description |
| ------------------------------- | ----------- |
| `connect()`                     | Fetch credentials, open WSS, REGISTER. |
| `disconnect()`                  | Unregister, tear down, end any call. |
| `reconnect()`                   | Re-fetch credentials and re-register. |
| `dial(target)` → `Promise<Call>`| Place an outbound call. |
| `currentCall`                   | The active `Call` or `null`. |
| `registrationState`             | `idle \| connecting \| registering \| registered \| unregistered \| failed`. |
| `isRegistered`                  | `registrationState === 'registered'`. |
| `listDevices()`                 | Audio input/output devices. |
| `setInputDevice(id)` / `setOutputDevice(id)` | Choose mic / speaker (applies live). |
| `on(event, handler)`            | `registrationStateChanged`, `incomingCall`, `error`. Returns an unsubscribe fn. |

### `Call`

| Member                | Description |
| --------------------- | ----------- |
| `direction`           | `'inbound' \| 'outbound'`. |
| `state`               | `dialing \| ringing \| in-call \| ended`. |
| `remoteIdentity`      | Far-end name/number, when known. |
| `isMuted`             | Microphone mute flag. |
| `accept()` / `reject()` | Answer / decline an inbound call. |
| `hangup()`            | End the call in any phase (BYE/CANCEL/REJECT). |
| `setMuted(bool)`      | Mute/unmute the microphone. |
| `sendDtmf(tones)`     | Send DTMF over the live call (IVR, codes). |
| `setInputDevice(id)`  | Switch the microphone mid-call. |
| `on(event, handler)`  | `stateChanged`, `muteChanged`. Returns an unsubscribe fn. |

### `SipCredentials`

The exact shape your `credentialsProvider` must return (mirrors Blull's
`POST /voip/credentials` and `GET /voip/credentials/me` responses):

```ts
interface SipCredentials {
  extension: string      // SIP username / ramal
  password: string       // plaintext — keep it in memory only
  sipUri: string         // e.g. sip:1001@empresa-a.blull.com.br
  sipDomain: string      // e.g. empresa-a.blull.com.br
  displayName: string
  wssUrl: string         // e.g. wss://voip.blull.com.br:7443
  iceServers?: { urls: string; username?: string; credential?: string }[]
}
```

### Helpers

`ensureBrazilMobileNinthDigit`, `sanitizeDialString`, `playDtmfTone` (local
keypad feedback), `listAudioDevices`, `requestMicrophoneAccess`, `isBrowser`.

## Notes

- **Browser-only.** WebRTC/`getUserMedia`/WebSocket run in the browser. The
  package is SSR-safe to *import* (Next.js RSC/SSR); the DOM-touching calls throw
  only if invoked on the server. Mount the React provider in a client component.
- **HTTPS + mic permission.** `getUserMedia` requires a secure context and the
  user granting microphone access.
- **One call at a time.** A second inbound INVITE while a call is live is
  auto-rejected; `dial()` throws if a call is in progress.
- Mirrors the softphone shipped in the Blull dashboard, generalised for
  third-party sites.

## Development

```bash
pnpm install
pnpm build       # tsdown → dist/ (ESM + .d.ts)
pnpm test        # vitest
pnpm typecheck   # tsc --noEmit
pnpm lint        # biome
pnpm check       # lint + typecheck + test
```

### Publishing and source privacy

Development happens in the private source repository. The public
[`Blull-AI/voip`](https://github.com/Blull-AI/voip) repository is a curated
allowlist containing only this README, the license, documentation, and usage
examples. `pnpm sync:public` replaces its tracked contents with that allowlist,
so stale source files are removed as well as new ones being excluded.

The npm package is independently restricted by `package.json#files` to `dist/`
without source maps. Consumers receive the compiled JavaScript and declaration
files, not `src/`, tests, build configuration, or internal scripts.

Maintainers release with `pnpm release`. It requires `origin` to point to the
private repository, runs typechecking and tests, validates the npm tarball,
pushes the source and release tag privately, publishes to npm, and finally syncs
the curated public repository. Do not point `origin` at the public repository.

## License

MIT © BLULL
