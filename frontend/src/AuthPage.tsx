import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ApiError, login, register } from './api'
import { useSession } from './session'
import { safeNext } from './ui'

function LogoSVG({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 40 40"
      fill="none"
      className={className}
    >
      <rect width="40" height="40" rx="10" fill="#0F172A" />
      <path
        d="M12 14C12 12.8954 12.8954 12 14 12H20C21.1046 12 22 12.8954 22 14V20C22 21.1046 21.1046 22 20 22H14C12.8954 22 12 21.1046 12 20V14Z"
        fill="#F8FAFC"
      />
      <path
        d="M20 20C20 18.8954 20.8954 18 22 18H26C27.1046 18 28 18.8954 28 20V26C28 27.1046 27.1046 28 26 28H22C20.8954 28 20 27.1046 20 26V20Z"
        fill="#94A3B8"
      />
      <path d="M14 24H18V28H14V24Z" fill="#CBD5E1" />
    </svg>
  )
}

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
  const [showPassword, setShowPassword] = useState(false)

  useEffect(() => {
    if (!session) return
    navigate(mode === 'login' ? next : '/', { replace: true })
  }, [mode, navigate, next, session])

  const emailOk = email.trim().length > 0
  const passwordOk =
    mode === 'login' ? password.trim().length > 0 : password.length >= 8
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
        setError(
          mode === 'login'
            ? "Couldn't sign in — try again."
            : "Couldn't create the account — try again.",
        )
      } else {
        setError(
          mode === 'login'
            ? "Couldn't sign in — try again."
            : "Couldn't create the account — try again.",
        )
      }
    } finally {
      setBusy(false)
    }
  }

  const submitLabel = busy
    ? mode === 'login'
      ? 'Signing in…'
      : 'Creating account…'
    : mode === 'login'
      ? 'Sign in'
      : 'Create account'

  return (
    <main
      className="min-h-screen w-full flex items-center justify-center"
      style={{
        padding: 'var(--spacing-margin-mobile)',
        background: 'var(--color-surface)',
      }}
    >
      <div className="relative w-full" style={{ maxWidth: '460px' }}>
        {/* Ambient blur circles */}
        <div
          className="absolute pointer-events-none -z-10 rounded-full blur-3xl"
          style={{
            top: '-4rem',
            left: '-4rem',
            width: '14rem',
            height: '14rem',
            background:
              'color-mix(in srgb, var(--color-surface-dim) 40%, transparent)',
          }}
        />
        <div
          className="absolute pointer-events-none -z-10 rounded-full blur-3xl"
          style={{
            bottom: '-4rem',
            right: '-4rem',
            width: '15rem',
            height: '15rem',
            background:
              'color-mix(in srgb, var(--color-secondary-fixed) 30%, transparent)',
          }}
        />

        {/* Auth card */}
        <div
          className="shadow-sm"
          style={{
            background: 'var(--color-surface-container-lowest)',
            borderRadius: '0.75rem',
            padding: '1.5rem',
          }}
        >
          {/* Header */}
          <div className="flex flex-col gap-4" style={{ marginBottom: '2rem' }}>
            <div className="flex items-center justify-between w-full">
              {/* Logo box */}
              <div
                className="flex items-center justify-center shadow-sm"
                style={{
                  width: '2.75rem',
                  height: '2.75rem',
                  borderRadius: '0.5rem',
                  background: 'var(--color-surface-container)',
                  padding: '0.375rem',
                }}
              >
                <LogoSVG className="w-full h-full" />
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.25rem',
              }}
            >
              <h1
                style={{
                  margin: 0,
                  fontSize: '1.5rem',
                  fontWeight: 600,
                  lineHeight: '2rem',
                  letterSpacing: '-0.02em',
                  color: 'var(--color-on-surface)',
                }}
              >
                My Workspace
              </h1>
            </div>
          </div>

          {/* Form */}
          <form
            onSubmit={(event) => void submit(event)}
            style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}
          >
            {/* Email */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.375rem',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <label
                  htmlFor="email"
                  style={{
                    fontSize: '0.75rem',
                    lineHeight: '1rem',
                    letterSpacing: '0.01em',
                    fontWeight: 500,
                    color: 'var(--color-on-surface-variant)',
                  }}
                >
                  Email
                </label>
                <span
                  aria-hidden="true"
                  style={{
                    fontFamily: 'var(--font-family-mono)',
                    fontSize: '0.6875rem',
                    color: 'var(--color-outline)',
                  }}
                >
                  SYS.ID
                </span>
              </div>
              <div
                style={{
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <span
                  className="material-symbols-outlined"
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    left: '0.875rem',
                    color: 'var(--color-outline)',
                    pointerEvents: 'none',
                    fontSize: '18px',
                  }}
                >
                  alternate_email
                </span>
                <input
                  id="email"
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  style={{
                    width: '100%',
                    height: '2.75rem',
                    paddingLeft: '2.5rem',
                    paddingRight: '1rem',
                    background: 'var(--color-surface-container-low)',
                    color: 'var(--color-on-surface)',
                    border: 'none',
                    borderRadius: '0.5rem',
                    outline: 'none',
                    fontSize: '0.875rem',
                    lineHeight: '1.375rem',
                  }}
                />
              </div>
            </div>

            {/* Password */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.375rem',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <label
                  htmlFor="password"
                  style={{
                    fontSize: '0.75rem',
                    lineHeight: '1rem',
                    letterSpacing: '0.01em',
                    fontWeight: 500,
                    color: 'var(--color-on-surface-variant)',
                  }}
                >
                  Password
                </label>
                {mode === 'login' && (
                  <a
                    href="#forgot"
                    style={{
                      fontSize: '0.75rem',
                      lineHeight: '1rem',
                      color: 'var(--color-secondary)',
                      textDecoration: 'none',
                    }}
                  >
                    Forgot password?
                  </a>
                )}
              </div>
              <div
                style={{
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <span
                  className="material-symbols-outlined"
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    left: '0.875rem',
                    color: 'var(--color-outline)',
                    pointerEvents: 'none',
                    fontSize: '18px',
                  }}
                >
                  lock_open
                </span>
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={
                    mode === 'login' ? 'current-password' : 'new-password'
                  }
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="••••••••••••"
                  style={{
                    width: '100%',
                    height: '2.75rem',
                    paddingLeft: '2.5rem',
                    paddingRight: '2.75rem',
                    background: 'var(--color-surface-container-low)',
                    color: 'var(--color-on-surface)',
                    border: 'none',
                    borderRadius: '0.5rem',
                    outline: 'none',
                    fontSize: '0.875rem',
                    lineHeight: '1.375rem',
                  }}
                />
                <button
                  type="button"
                  aria-label="Toggle password visibility"
                  onClick={() => setShowPassword((s) => !s)}
                  style={{
                    position: 'absolute',
                    right: '0.75rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'none',
                    border: 'none',
                    padding: '0.25rem',
                    borderRadius: '0.25rem',
                    color: 'var(--color-outline)',
                    cursor: 'pointer',
                  }}
                >
                  <span
                    className="material-symbols-outlined"
                    aria-hidden="true"
                    style={{ fontSize: '18px' }}
                  >
                    {showPassword ? 'visibility_off' : 'visibility'}
                  </span>
                </button>
              </div>
            </div>

            {mode === 'register' &&
            password.length > 0 &&
            password.length < 8 ? (
              <p className="field-error">
                Password must be at least 8 characters.
              </p>
            ) : null}

            {/* Confirm password (register only) */}
            {mode === 'register' ? (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.375rem',
                }}
              >
                <label
                  htmlFor="confirm"
                  style={{
                    fontSize: '0.75rem',
                    lineHeight: '1rem',
                    letterSpacing: '0.01em',
                    fontWeight: 500,
                    color: 'var(--color-on-surface-variant)',
                  }}
                >
                  Confirm password
                </label>
                <div
                  style={{
                    position: 'relative',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  <span
                    className="material-symbols-outlined"
                    aria-hidden="true"
                    style={{
                      position: 'absolute',
                      left: '0.875rem',
                      color: 'var(--color-outline)',
                      pointerEvents: 'none',
                      fontSize: '18px',
                    }}
                  >
                    lock_open
                  </span>
                  <input
                    id="confirm"
                    type="password"
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(event) => setConfirm(event.target.value)}
                    placeholder="••••••••••••"
                    style={{
                      width: '100%',
                      height: '2.75rem',
                      paddingLeft: '2.5rem',
                      paddingRight: '1rem',
                      background: 'var(--color-surface-container-low)',
                      color: 'var(--color-on-surface)',
                      border: 'none',
                      borderRadius: '0.5rem',
                      outline: 'none',
                      fontSize: '0.875rem',
                      lineHeight: '1.375rem',
                    }}
                  />
                </div>
              </div>
            ) : null}

            {mode === 'register' &&
            confirm.length > 0 &&
            confirm !== password ? (
              <p className="field-error">Passwords don’t match.</p>
            ) : null}

            {error ? <p className="field-error">{error}</p> : null}

            {/* Remember me (login only) */}
            {mode === 'login' && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '0.25rem 0',
                }}
              >
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.625rem',
                    cursor: 'pointer',
                    userSelect: 'none',
                  }}
                >
                  <input
                    type="checkbox"
                    defaultChecked
                    style={{
                      width: '1rem',
                      height: '1rem',
                      borderRadius: '0.25rem',
                      cursor: 'pointer',
                      accentColor: 'var(--color-primary)',
                    }}
                  />
                  <span
                    style={{
                      fontSize: '0.8125rem',
                      color: 'var(--color-on-surface-variant)',
                    }}
                  >
                    Remember me on this workstation
                  </span>
                </label>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={!canSubmit}
              style={{
                width: '100%',
                height: '2.75rem',
                marginTop: '0.25rem',
                background: canSubmit
                  ? 'var(--color-primary)'
                  : 'var(--color-surface-container-high)',
                color: canSubmit
                  ? 'var(--color-on-primary)'
                  : 'var(--color-on-surface-variant)',
                border: 'none',
                borderRadius: '0.75rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                fontSize: '1.125rem',
                fontWeight: 500,
                lineHeight: '1.5rem',
                letterSpacing: '-0.01em',
                cursor: canSubmit ? 'pointer' : 'not-allowed',
                transition: 'background 0.15s, transform 0.1s',
              }}
            >
              <span>{submitLabel}</span>
              <span
                className="material-symbols-outlined"
                aria-hidden="true"
                style={{ fontSize: '18px' }}
              >
                {busy ? 'sync' : 'arrow_forward'}
              </span>
            </button>

            {/* Switch mode link */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                paddingTop: '0.5rem',
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: '0.8125rem',
                  color: 'var(--color-on-surface-variant)',
                }}
              >
                {mode === 'login' ? (
                  <>
                    Don&apos;t have a workspace?{' '}
                    <Link
                      to="/sign-up"
                      style={{
                        color: 'var(--color-secondary)',
                        fontWeight: 500,
                        textDecoration: 'none',
                      }}
                    >
                      Create an account
                    </Link>
                  </>
                ) : (
                  <>
                    Already have an account?{' '}
                    <Link
                      to="/sign-in"
                      style={{
                        color: 'var(--color-secondary)',
                        fontWeight: 500,
                        textDecoration: 'none',
                      }}
                    >
                      Already have an account
                    </Link>
                  </>
                )}
              </p>
            </div>
          </form>

          {/* Telemetry bar */}
          <div
            style={{
              marginTop: '2rem',
              paddingTop: '1rem',
              marginLeft: '-1.5rem',
              marginRight: '-1.5rem',
              marginBottom: '-1.5rem',
              paddingLeft: '1.5rem',
              paddingRight: '1.5rem',
              paddingBottom: '1rem',
              borderBottomLeftRadius: '0.75rem',
              borderBottomRightRadius: '0.75rem',
              background:
                'color-mix(in srgb, var(--color-surface-container-low) 60%, transparent)',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                color: 'var(--color-on-surface-variant)',
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-family-mono)',
                  fontSize: '0.6875rem',
                  color: 'var(--color-outline)',
                }}
              >
                v1-RELEASE
              </span>
            </div>
            <p
              style={{
                margin: 0,
                textAlign: 'center',
                fontSize: '0.75rem',
                lineHeight: '1rem',
                color: 'var(--color-on-surface-variant)',
                opacity: 0.8,
              }}
            >
              Designed for streamlined project workflows &amp; data-driven
              milestone tracking.
            </p>
          </div>
        </div>

        {/* Page footer */}
        <div
          style={{
            marginTop: '2rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 0.75rem',
            color: 'var(--color-on-surface-variant)',
            opacity: 0.7,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span
              className="material-symbols-outlined"
              aria-hidden="true"
              style={{ fontSize: '16px', color: 'var(--color-outline)' }}
            >
              school
            </span>
            <span
              style={{
                fontFamily: 'var(--font-family-mono)',
                fontSize: '0.6875rem',
              }}
            >
              DEPT OF DATA SCIENCE
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <a
              href="#privacy"
              style={{
                fontFamily: 'var(--font-family-mono)',
                fontSize: '0.6875rem',
                color: 'inherit',
                textDecoration: 'none',
              }}
            >
              Privacy
            </a>
            <span style={{ color: 'var(--color-outline)' }}>/</span>
            <a
              href="#audit"
              style={{
                fontFamily: 'var(--font-family-mono)',
                fontSize: '0.6875rem',
                color: 'inherit',
                textDecoration: 'none',
              }}
            >
              Audit Logs
            </a>
          </div>
        </div>
      </div>
    </main>
  )
}
