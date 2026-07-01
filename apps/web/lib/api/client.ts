import axios from 'axios'

// Cloud/dev builds always set NEXT_PUBLIC_API_URL (baked in at build time),
// so this resolves exactly as before for them. The offline/local install
// build deliberately leaves it unset instead of baking in a LAN IP that
// would go stale on every network change — the browser already knows the
// right host (it's the same machine serving this page, just a different
// port), so derive the API origin from that at runtime instead.
function resolveBaseURL(): string | undefined {
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL
  if (typeof window !== 'undefined') {
    return `${window.location.protocol}//${window.location.hostname}:5000/api`
  }
  return undefined
}

const api = axios.create({
  baseURL: resolveBaseURL(),
})

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Only force-redirect on 401 when there was an existing session token —
    // i.e. the session expired. Do NOT redirect on a failed login attempt
    // (wrong password also returns 401 but there is no token to expire).
    if (error.response?.status === 401 && typeof window !== 'undefined') {
      const hadToken = !!localStorage.getItem('token')
      if (hadToken) {
        localStorage.removeItem('token')
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  }
)

export default api
