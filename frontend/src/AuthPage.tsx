import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ApiError, login, register } from './api'
import { useSession } from './session'
import { safeNext } from './ui'

export function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const { session, signIn } = useSession()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!session) return
    navigate(mode === 'login' ? next : '/', { replace: true })
  }, [mode, navigate, next, session])

  const emailOk = email.trim().length > 0
  const passwordOk = mode === 'login' ? password.trim().length > 0 : password.length >= 8
  const confirmOk = mode === 'login' || confirm === password
  const canSubmit = emailOk && passwordOk && confirmOk && !busy

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!canSubmit) return
    setBusy(true)
    setError('')
    try {
      const result =
        mode === 'login'
          ? await login(email.trim().toLowerCase(), password)
          : await register(email.trim().toLowerCase(), password)
      signIn(result.token, result.user)
      navigate(mode === 'login' ? next : '/', { replace: true })
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        setError('Email or password is wrong.')
        setPassword('')
      } else if (caught instanceof ApiError && caught.status === 409) {
        setError('An account with that email already exists.')
      } else if (caught instanceof ApiError && caught.status === 400) {
        setError(caught.detail)
      } else if (caught instanceof ApiError && caught.status === 0) {
        setError(mode === 'login' ? "Couldn't sign in — try again." : "Couldn't create the account — try again.")
      } else {
        setError(mode === 'login' ? "Couldn't sign in — try again." : "Couldn't create the account — try again.")
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="auth-page">
      <form className="auth-card" onSubmit={(event) => void submit(event)}>
        <h1>My Workspace</h1>
        <label>
          Email
          <input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label>
          Password
          <input
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {mode === 'register' && password.length > 0 && password.length < 8 ? (
          <p className="field-error">Password must be at least 8 characters.</p>
        ) : null}
        {mode === 'register' ? (
          <label>
            Confirm password
            <input
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
            />
          </label>
        ) : null}
        {mode === 'register' && confirm.length > 0 && confirm !== password ? (
          <p className="field-error">Passwords don’t match.</p>
        ) : null}
        {error ? <p className="field-error">{error}</p> : null}
        <button type="submit" disabled={!canSubmit}>
          {busy
            ? mode === 'login'
              ? 'Signing in…'
              : 'Creating account…'
            : mode === 'login'
              ? 'Sign in'
              : 'Create account'}
        </button>
        {mode === 'login' ? (
          <Link to="/sign-up">Create an account</Link>
        ) : (
          <Link to="/sign-in">Already have an account</Link>
        )}
      </form>
    </main>
  )
}
