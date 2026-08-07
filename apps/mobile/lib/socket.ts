import { io, Socket } from 'socket.io-client'
import { API_BASE } from './config'

/**
 * One shared socket for the app. Carries SIGNALS only ("something changed, refetch"), never
 * data — see apps/api/src/config/socket.ts for why.
 *
 * Twin of apps/web/lib/socket.ts. The URL resolution differs (mobile has no window.location,
 * it reads the configured API base) but the event names and semantics must stay identical.
 */
/**
 * Must stay in step with RealtimeEvent in apps/api/src/config/socket.ts. Kept as a union so
 * a typo cannot subscribe to a channel the server never emits.
 *
 *   notifications:changed  the viewer's notification list / unread count changed
 *   absences:changed       an absence they can see was created, removed, or LOCKED by an
 *                          admin reviewing it (which withdraws their ability to retract)
 *   marks:changed          marks were saved for a class. Fires ONCE PER REPORT CARD, so a
 *                          class of 40 saved in one click fires up to 40 times — always
 *                          debounce (see MARKS_REFRESH_DEBOUNCE_MS) instead of refetching
 *                          per signal. Never blind-refetch a grid holding unsaved edits.
 *   timetable:changed      the viewer's own timetable was rearranged by an admin; refetch
 *                          the timetable itself, not just its absences
 */
export type RealtimeEvent = 'notifications:changed' | 'absences:changed' | 'marks:changed' | 'timetable:changed'

/** Trailing debounce for marks:changed, which arrives once per student in a class save.
 *  Long enough to collapse one Save click into a single refetch, short enough to still feel
 *  immediate. */
export const MARKS_REFRESH_DEBOUNCE_MS = 1200

let socket: Socket | null = null
let currentToken: string | null = null

/**
 * Subscriptions live here, not only on the socket instance.
 *
 * Child effects run BEFORE parent effects in React, so a screen inside the tab layout
 * subscribes before the layout has connected. Attaching straight to `socket` would silently
 * drop those handlers — the screen would look wired up and simply never fire. Handlers are
 * registered here and (re)attached whenever a socket comes into existence, which also means
 * they survive a reconnect under a new token.
 */
const handlers = new Map<RealtimeEvent, Set<() => void>>()

function attachAll(s: Socket) {
  for (const [event, set] of handlers) for (const h of set) s.on(event, h)
}

/** Idempotent: safe to call on every focus, connects at most once per token. */
export function connectSocket(token: string): Socket | null {
  // API_BASE is the origin without the /api suffix, which is what Socket.IO wants.
  if (!API_BASE) return null
  // A new token means a different user (or a refreshed session) — the old connection is
  // still in rooms for the previous identity, so it has to go rather than be reused.
  if (socket && currentToken !== token) disconnectSocket()
  if (socket) return socket

  currentToken = token
  socket = io(API_BASE, {
    auth: { token },
    // WebSocket first, long-polling as a fallback for networks that block it. Mobile
    // carriers here are exactly the case that needs the fallback.
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
  })
  attachAll(socket)
  return socket
}

export function disconnectSocket() {
  socket?.removeAllListeners()
  socket?.disconnect()
  socket = null
  currentToken = null
}

/**
 * Nudge the socket after the app returns from the background.
 *
 * iOS suspends the process, so the OS may have torn the connection down without the JS
 * runtime ever being told: socket.io still believes it is connected and its own backoff never
 * fires. Reconnecting explicitly on foreground is what stops the app coming back from a
 * pocket showing stale data indefinitely.
 */
export function reconnectIfNeeded() {
  if (socket && !socket.connected) socket.connect()
}

/**
 * Subscribe to a signal. Safe to call before the socket exists. Returns an unsubscribe
 * function for effect cleanup.
 */
export function onRealtime(event: RealtimeEvent, handler: () => void): () => void {
  let set = handlers.get(event)
  if (!set) { set = new Set(); handlers.set(event, set) }
  set.add(handler)
  socket?.on(event, handler)
  return () => {
    set!.delete(handler)
    socket?.off(event, handler)
  }
}

/**
 * Same as `onRealtime`, but collapses a burst into a single trailing call.
 *
 * Exists for `marks:changed`, which is emitted once per report card: saving a class of 40
 * delivers 40 signals in well under a second, and refetching per signal would turn one
 * teacher's Save into 40 round trips on every other open screen in the school.
 */
export function onRealtimeDebounced(
  event: RealtimeEvent,
  handler: () => void,
  ms = MARKS_REFRESH_DEBOUNCE_MS,
): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null
  const unsubscribe = onRealtime(event, () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(handler, ms)
  })
  return () => {
    if (timer) clearTimeout(timer)
    unsubscribe()
  }
}
