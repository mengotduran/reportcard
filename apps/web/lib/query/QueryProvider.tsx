'use client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'

// Defaults are tuned for the real deployment, not for a laptop next to the server:
// a warm request from Cameroon to the API costs ~400-500ms before any work happens,
// so the win is not making each request faster, it is not making the request at all.
//
// staleTime is therefore deliberately generous. Reference data (terms, classes,
// subjects, school settings) barely changes during a session, and re-reading it on
// every navigation was costing a full round trip per page per list.
//
// refetchOnWindowFocus is OFF on purpose and should stay off: several screens hold
// an unsaved edit buffer (the marks grid especially), and a blind refetch when the
// user tabs back would throw their typing away. Freshness there comes from the
// socket signals in lib/socket.ts, which invalidate precisely what changed.
export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000,
        gcTime: 30 * 60 * 1000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        // This connection drops sockets mid-response often enough that one retry
        // is worth it, but more than that just makes a dead endpoint feel slower.
        retry: 1,
      },
    },
  })
}

export default function QueryProvider({ children }: { children: ReactNode }) {
  // useState so the client is created once per mount and never shared between
  // users on the server.
  const [client] = useState(makeQueryClient)
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
