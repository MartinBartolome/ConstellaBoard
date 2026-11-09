import type { BoardOp, BoardState } from '../domain/types'
import type { Permissions } from '../domain/permissions'
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './config'
import { ensureAnonymousUser, supabase } from './supabaseClient'

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message)
  }
}

export interface PublicParticipant {
  id: string
  clientId: string
  role: 'coach' | 'participant'
  displayName: string
  color: string
  permissions: Permissions
}

export interface PublicSession {
  id: string
  status: 'active' | 'ended'
  expiresAt: string
  inactivityMinutes: number
  hasAccessCode: boolean
}

export interface JoinResult {
  participant: PublicParticipant
  session: PublicSession
}

export interface CreatedSession {
  sessionId: string
  coachToken: string
  participantToken: string
  expiresAt: string
}

async function call<T>(fn: string, body: Record<string, unknown>): Promise<T> {
  await ensureAnonymousUser()
  const { data } = await supabase().auth.getSession()
  const token = data.session?.access_token
  let res: Response
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    })
  } catch {
    throw new ApiError(0, 'network', 'Keine Verbindung zum Server.')
  }
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) throw new ApiError(res.status, String(json.error ?? 'error'), String(json.message ?? 'Unbekannter Fehler.'))
  return json as T
}

export function createSession(opts: { accessCode?: string; inactivityMinutes?: number } = {}): Promise<CreatedSession> {
  return call('create-session', opts)
}

export function joinSession(sessionId: string, token: string, extra: { accessCode?: string; displayName?: string } = {}): Promise<JoinResult> {
  return call('join-session', { sessionId, token, ...extra })
}

export function validateMembership(sessionId: string, active: boolean): Promise<JoinResult> {
  return call('validate-token', { sessionId, active })
}

export function getBoardState(sessionId: string): Promise<{ state: BoardState; version: number }> {
  return call('get-board-state', { sessionId })
}

export function updateBoardState(sessionId: string, ops: BoardOp[]): Promise<{ version: number; rejected: number }> {
  return call('update-board-state', { sessionId, ops })
}

export function closeSession(sessionId: string): Promise<{ ended: boolean }> {
  return call('close-session', { sessionId })
}

export function listParticipants(sessionId: string): Promise<{ participants: PublicParticipant[] }> {
  return call('manage-participant', { sessionId, action: 'list' })
}

export function setParticipantPermissions(sessionId: string, participantId: string, permissions: Permissions): Promise<{ participant: PublicParticipant }> {
  return call('manage-participant', { sessionId, action: 'permissions', participantId, permissions })
}

export function removeParticipant(sessionId: string, participantId: string): Promise<{ removed: boolean }> {
  return call('manage-participant', { sessionId, action: 'remove', participantId })
}
