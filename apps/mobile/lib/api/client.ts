import axios from 'axios'
import { API_BASE_URL } from '@/lib/config'
import { useAuthStore } from '@/lib/store/auth.store'

// 15s timeout: with none, an unreachable server (wrong LAN IP, router isolation) left
// the login spinner running for a minute-plus before failing. Fifteen seconds is long
// enough for a slow first response and short enough that "cannot reach the server"
// arrives while the user is still looking at the screen.
const api = axios.create({ baseURL: API_BASE_URL, timeout: 15000 })

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

export default api
