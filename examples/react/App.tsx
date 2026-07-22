import { type SipCredentials, SoftphoneProvider, useSoftphone } from '@blull/voip/react'
import { useState } from 'react'

/** Your backend derives the operator's sipUserId and fetches that ramal's credentials from Blull. */
async function fetchCredentials(): Promise<SipCredentials> {
  const response = await fetch('/api/voip/credentials', { credentials: 'include' })
  if (!response.ok) throw new Error(`Failed to load SIP credentials (${response.status})`)
  return (await response.json()) as SipCredentials
}

function Dialer() {
  const {
    registrationState,
    call,
    callState,
    remoteIdentity,
    isMuted,
    dial,
    hangup,
    toggleMute,
    accept,
    reject,
  } = useSoftphone()
  const [number, setNumber] = useState('')

  const isRinging = call?.direction === 'inbound' && callState === 'ringing'
  const isInCall = callState !== null && callState !== 'ended'

  return (
    <div>
      <p>Status: {registrationState}</p>

      {isRinging ? (
        <div>
          <p>Incoming call from {remoteIdentity ?? 'unknown'}</p>
          <button type="button" onClick={() => void accept()}>
            Accept
          </button>
          <button type="button" onClick={() => void reject()}>
            Reject
          </button>
        </div>
      ) : isInCall ? (
        <div>
          <p>
            {callState} — {remoteIdentity}
          </p>
          <button type="button" onClick={() => toggleMute()}>
            {isMuted ? 'Unmute' : 'Mute'}
          </button>
          <button type="button" onClick={() => void hangup()}>
            Hang up
          </button>
        </div>
      ) : (
        <div>
          <input
            value={number}
            onChange={(event) => setNumber(event.target.value)}
            placeholder="(11) 91234-5678"
          />
          <button type="button" onClick={() => void dial(number)}>
            Call
          </button>
        </div>
      )}
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
