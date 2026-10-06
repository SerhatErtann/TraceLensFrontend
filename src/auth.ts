import { reactive } from 'vue'
import { api, type AuthStatus } from './api'

/** Oturum durumu; router guard ve menü buradan okur. */
export const auth = reactive<AuthStatus & { loaded: boolean }>({
  loaded: false,
  authenticated: false,
  username: null,
  setupRequired: false,
  registrationOpen: false
})

export async function refreshAuth() {
  Object.assign(auth, await api.authStatus(), { loaded: true })
}

export function markLoggedOut() {
  auth.authenticated = false
  auth.username = null
}
