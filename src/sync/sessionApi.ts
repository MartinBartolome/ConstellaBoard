export interface CreatedSession {
  sessionId: string
  coachToken: string
  participantToken: string
  expiresAt: string
}
export async function createSession(): Promise<CreatedSession> {
  throw new Error('Server nicht konfiguriert')
}
