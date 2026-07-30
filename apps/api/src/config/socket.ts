import { Server as HttpServer } from 'http'
import { Server, Socket } from 'socket.io'
import { verifyToken } from '../utils/jwt'

/**
 * Real-time SIGNALS to connected clients. Deliberately not real-time DATA.
 *
 * Every event is a bare "something you can see has changed, go refetch" — never the changed
 * record. That is a security decision, not a stylistic one: all authorization (school
 * scoping, role checks, published-card freezes) lives in the REST controllers, and pushing
 * payloads through rooms would mean re-implementing every one of those checks here, where
 * the failure mode is silent cross-tenant leakage. A signal can only ever prompt a fetch
 * the recipient was already entitled to make.
 *
 * Rooms mirror the notification model exactly:
 *   user:{userId}     one person (their own absences, their own courses)
 *   school:{schoolId} everyone at a school (currently used for admin fan-out)
 *
 * Clients keep polling as a slower fallback, so a socket that fails to reconnect degrades to
 * stale-by-a-couple-of-minutes rather than silently frozen forever.
 */

/** Event names. Kept as a union so a typo can't invent a channel nobody listens on. */
export type RealtimeEvent =
  // The recipient's notification list and/or unread count changed.
  | 'notifications:changed'
  // An absence the recipient can see was created, removed, or LOCKED. The lock matters as
  // much as the row: once an admin has reviewed a teacher's list, that teacher can no longer
  // retract, and without this their screen keeps offering a delete button that the API will
  // now refuse. Separate from notifications:changed because the two do not coincide — an
  // admin merely opening a list writes no notification at all.
  | 'absences:changed'

let io: Server | null = null

export const userRoom = (userId: string) => `user:${userId}`
export const schoolRoom = (schoolId: string) => `school:${schoolId}`

export function initSocket(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    // Express uses a wildcard `cors()` and Socket.IO does NOT inherit it — it has its own
    // handshake, so without this every browser connection is rejected by CORS while the
    // REST calls beside it succeed. Same permissiveness as the REST layer, deliberately:
    // tightening one without the other would only give a false sense of security.
    cors: { origin: '*', methods: ['GET', 'POST'] },
    // Falls back to HTTP long-polling where WebSockets are blocked. Not hypothetical for
    // this deployment: Railway already blocks outbound SMTP, so assume middleboxes.
    transports: ['websocket', 'polling'],
  })

  // Same token, same secret, same verify function as the REST middleware, so there is one
  // auth story rather than two that can drift.
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token
    if (!token || typeof token !== 'string') return next(new Error('No token'))
    try {
      const user = verifyToken(token)
      socket.data.user = user
      next()
    } catch {
      next(new Error('Invalid token'))
    }
  })

  io.on('connection', (socket: Socket) => {
    const user = socket.data.user as { id: string; schoolId: string | null } | undefined
    if (!user) { socket.disconnect(true); return }
    // Joined server-side from the verified token — never from anything the client sends, or
    // a client could subscribe itself to another school's room.
    socket.join(userRoom(user.id))
    if (user.schoolId) socket.join(schoolRoom(user.schoolId))
  })

  return io
}

/** No-op when sockets aren't running (scripts, tests), so callers never need to check. */
function emit(room: string, event: RealtimeEvent) {
  io?.to(room).emit(event)
}

export function emitToUser(userId: string, event: RealtimeEvent) {
  emit(userRoom(userId), event)
}

export function emitToUsers(userIds: string[], event: RealtimeEvent) {
  for (const id of userIds) emit(userRoom(id), event)
}

export function emitToSchool(schoolId: string, event: RealtimeEvent) {
  emit(schoolRoom(schoolId), event)
}
