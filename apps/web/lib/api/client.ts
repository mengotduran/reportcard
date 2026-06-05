import axios from 'axios'

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
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
