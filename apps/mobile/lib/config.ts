// Dev: Android emulator → 10.0.2.2  |  iOS simulator → localhost  |  Physical device → your machine's LAN IP
const DEV_API_BASE = 'http://192.168.1.249:5000'
const PROD_API_BASE = 'https://api-production-35f8.up.railway.app'

const API_BASE_ROOT = __DEV__ ? DEV_API_BASE : PROD_API_BASE

export const API_BASE_URL = `${API_BASE_ROOT}/api`
export const API_BASE = API_BASE_ROOT
