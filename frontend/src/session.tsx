import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { getToken, logout, setToken, setUnauthorizedHandler } from './api'
import {
  clearAuthorKeys,
  isReportDirty,
  setReportDirty,
  suppressLeaveGuard,
} from './reportGuard'
import type { User } from './types'
import { toast } from './toast'

type Session = {
  token: string
  user: User
}

type SessionValue = {
  session: Session | null
  signIn: (token: string, user: User) => void
  signOut: () => Promise<void>
}

const SessionContext = createContext<SessionValue | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [session, setSession] = useState<Session | null>(null)

  useEffect(() => {
    setUnauthorizedHandler(() => {
      if (isReportDirty()) {
        window.alert('Your session ended. Unsaved report edits will be lost.')
        setReportDirty(false)
      }
      suppressLeaveGuard()
      setToken(null)
      setSession(null)
      clearAuthorKeys()
      toast('Your session ended. Sign in again.')
      const next = `${location.pathname}${location.search}`
      const safe = next.startsWith('/') && !next.startsWith('//') ? next : '/'
      navigate(`/sign-in?next=${encodeURIComponent(safe)}`, { replace: true })
    })
    return () => setUnauthorizedHandler(null)
  }, [location.pathname, location.search, navigate])

  const value = useMemo<SessionValue>(
    () => ({
      session,
      signIn: (nextToken, user) => {
        setToken(nextToken)
        setSession({ token: nextToken, user })
      },
      signOut: async () => {
        if (isReportDirty()) {
          const leave = window.confirm(
            'You have unsaved changes to this report — leave anyway?',
          )
          if (!leave) return
          setReportDirty(false)
          suppressLeaveGuard()
        }
        try {
          if (getToken()) await logout()
        } catch {
          /* Drop the token even when logout never reaches the server. */
        }
        setToken(null)
        setSession(null)
        clearAuthorKeys()
        navigate('/sign-in', { replace: true })
      },
    }),
    [navigate, session],
  )

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  )
}

export function useSession() {
  const value = useContext(SessionContext)
  if (!value) throw new Error('SessionProvider is missing')
  return value
}

export function AccountBar() {
  const { session, signOut } = useSession()
  if (!session) return null
  return (
    <div className="account">
      <span>{session.user.email}</span>
      <button type="button" onClick={() => void signOut()}>
        Sign out
      </button>
    </div>
  )
}
