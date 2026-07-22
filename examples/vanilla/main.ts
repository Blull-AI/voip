import { createSoftphone, playDtmfTone, type SipCredentials } from '@blull/voip'

/**
 * Point this at YOUR backend, which holds the Blull API Token and returns one
 * agent's SIP credentials selected by server-side sipUserId. The API Token
 * never ships to the browser — only the fetched SIP credentials do.
 */
async function fetchCredentials(): Promise<SipCredentials> {
  const response = await fetch('/api/voip/credentials', { credentials: 'include' })
  if (!response.ok) throw new Error(`Failed to load SIP credentials (${response.status})`)
  return (await response.json()) as SipCredentials
}

const phone = createSoftphone({ credentialsProvider: fetchCredentials })

const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

phone.on('registrationStateChanged', (state) => {
  byId('status').textContent = state
})

phone.on('error', (error) => {
  byId('status').textContent = `error: ${error.message}`
})

phone.on('incomingCall', (call) => {
  byId('call-state').textContent = `ringing — ${call.remoteIdentity ?? 'unknown'}`
  call.on('stateChanged', (state) => {
    byId('call-state').textContent = state
  })
  // Auto-answer for the demo; in a real app, show accept/reject controls.
  void call.accept()
})

byId('connect').addEventListener('click', () => void phone.connect())

byId('call').addEventListener('click', async () => {
  const call = await phone.dial(byId<HTMLInputElement>('number').value)
  call.on('stateChanged', (state) => {
    byId('call-state').textContent = state
  })
})

byId('hangup').addEventListener('click', () => void phone.currentCall?.hangup())
byId('mute').addEventListener('click', () => phone.currentCall?.setMuted(true))

// Local keypad feedback + send the tone over the live call.
for (const key of '123') {
  byId(`key-${key}`).addEventListener('click', () => {
    playDtmfTone(key)
    phone.currentCall?.sendDtmf(key)
  })
}
