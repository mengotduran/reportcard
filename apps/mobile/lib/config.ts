// Dev: Android emulator → 10.0.2.2  |  iOS simulator → localhost  |  Physical device → your machine's LAN IP
//
// LAN, deliberately. Start Metro with `npx expo start` and NOT `--tunnel`, with the phone on
// the same Wi-Fi. Requires ufw to allow the LAN subnet on both ports (Metro 8081 and this
// one), since the default input policy is DROP:
//   sudo ufw allow from 192.168.1.0/24 to any port 5000 proto tcp
//   sudo ufw allow from 192.168.1.0/24 to any port 8081 proto tcp
//
// Plain http is fine here: Expo Go permits cleartext in development. A standalone/dev-client
// build would need ios.infoPlist.NSAppTransportSecurity + android.usesCleartextTraffic, which
// app.json does NOT set — so if this ever moves off Expo Go, use a tunnel instead.
//
// Why NOT a tunnel by default, having been burnt twice: quick tunnels (trycloudflare, ngrok
// via `expo start --tunnel`) mint a NEW hostname on every run and die with the process. A
// stale hostname here makes every request fail while the persisted login still shows the
// user's name and school — so the app looks like a school whose data vanished, not like an
// app that cannot reach its server. If the phone must be off-network, get a fresh hostname
// and put it here, and remember it will go stale again on the next restart.
const DEV_API_BASE = 'http://192.168.1.249:5000'
const PROD_API_BASE = 'https://api-production-35f8.up.railway.app'

const API_BASE_ROOT = __DEV__ ? DEV_API_BASE : PROD_API_BASE

export const API_BASE_URL = `${API_BASE_ROOT}/api`
export const API_BASE = API_BASE_ROOT

// The web app, for the one thing this app cannot do itself: the parent portal.
//
// Parents have no screens here at all — every tab is written against a staff user with a
// school, and a parent's account has neither. Their whole app is the website, so a parent
// who installs Bulletin from the Play Store is handed off to it rather than being dropped
// into a staff app where every screen answers 403. See the PARENT branch in app/login.tsx.
//
// In development this points at the web dev server on the same LAN address as the API
// above, so the hand-off is testable from a real phone.
const DEV_WEB_BASE = 'http://192.168.1.249:3000'
const PROD_WEB_BASE = 'https://usebulletin.org'

export const WEB_BASE = __DEV__ ? DEV_WEB_BASE : PROD_WEB_BASE
export const PARENT_PORTAL_URL = `${WEB_BASE}/parent`
// Asking for access needs the school and class pickers and an emailed link, so sign-up
// stays on the website. The app is for signing in once that is done.
export const PARENT_SIGNUP_URL = `${WEB_BASE}/parent/signup`
