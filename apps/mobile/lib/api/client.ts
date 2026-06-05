import axios from 'axios'
import { API_BASE_URL } from '@/lib/config'
import { useAuthStore } from '@/lib/store/auth.store'

const api = axios.create({ baseURL: API_BASE_URL })

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

export default api
