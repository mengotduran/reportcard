import api from './client'

export interface DemoLogin {
  email: string
  password: string
}

export interface DemoCredentials {
  admin: DemoLogin
  classMaster: DemoLogin
}

// Returns the demo school logins, or null if the demo tenant isn't available.
export const getDemoCredentialsApi = async (): Promise<DemoCredentials | null> => {
  try {
    const res = await api.get('/demo/credentials')
    return res.data?.logins ?? null
  } catch {
    return null
  }
}
