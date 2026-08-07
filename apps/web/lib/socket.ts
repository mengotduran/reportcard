import { io, Socket } from 'socket.io-client'

/**
 * One shared socket for the whole tab. Carries SIGNALS only ("something changed, refetch"),
 * never data — see apps/api/src/config/socket.ts for why.
 *
 * Callers subscribe with `onRealtime`; nobody outside this module touches the socket.
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

/**
 * The socket connects to the API's ORIGIN, not its /api path, so this mirrors
 * lib/api/client.ts and then strips the suffix.
 *
 * The runtime fallback is essential, not a nicety: the offline/local-install build
 * deliberately ships with NEXT_PUBLIC_API_URL unset so it never bakes in a LAN IP that goes
 * stale. Reading the env var alone would work in cloud and break on every offline install.
 */
function resolveSocketOrigin(): string | undefined {
  const configured = process.env.NEXT_PUBLIC_API_URL
  if (configured) return configured.replace(/\/api\/?$/, '')
  if (typeof window !== 'undefined') return `${window.location.protocol}//${window.location.hostname}:5000`
  return undefined
}

let socket: Socket | null = null
let currentToken: string | null = null

/**
 * Subscriptions live here, not only on the socket instance.
 *
 * Child effects run BEFORE parent effects in React, so a page inside the dashboard layout
 * subscribes before the layout has connected. Attaching straight to `socket` would silently
 * drop those handlers — the page would look wired up and simply never fire. Handlers are
 * registered here and (re)attached whenever a socket comes into existence, which also means
 * they survive a reconnect under a new token.
 */
const handlers = new Map<RealtimeEvent, Set<() => void>>()

function attachAll(s: Socket) {
  for (const [event, set] of handlers) for (const h of set) s.on(event, h)
}

/** Idempotent: called on every render path that cares, connects at most once per token. */
export function connectSocket(token: string): Socket | null {
  const origin = resolveSocketOrigin()
  if (!origin) return null
  // A new token means a different user (or a refreshed session) — the old connection is
  // still in rooms for the previous identity, so it has to go rather than be reused.
  if (socket && currentToken !== token) disconnectSocket()
  if (socket) return socket

  currentToken = token
  socket = io(origin, {
    auth: { token },
    transports: ['websocket', 'polling'],
    // Socket.IO's own backoff. Capped so a server restart is picked up in seconds rather
    // than after an ever-doubling wait.
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
 * Subscribe to a signal. Safe to call before the socket exists. Returns an unsubscribe
 * function for effect cleanup.
 */
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
