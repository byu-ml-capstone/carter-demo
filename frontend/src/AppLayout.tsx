import { Link, Outlet, useLocation } from 'react-router-dom'
import { useSession } from './session'

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

export function AppLayout() {
  const { session, signOut } = useSession()
  const location = useLocation()

  const navLinks = [
    { to: '/', label: 'Projects' },
    { to: '/milestones', label: 'Milestones & Insights' },
  ]

  return (
    <div className="min-h-screen bg-[var(--color-surface)] flex flex-col">
      {/* Fixed top navbar */}
      <header className="fixed top-0 left-0 right-0 z-40 h-16 bg-[var(--color-surface-container-lowest)]/90 backdrop-blur-md border-b border-[var(--color-surface-container)] flex items-center px-[var(--spacing-gutter)]">
        {/* Brand */}
        <Link
          to="/"
          className="flex items-center gap-2.5 shrink-0 mr-6 no-underline"
        >
          <LogoSVG className="w-8 h-8" />
          <div className="flex flex-col leading-none">
            <span
              className="text-[var(--color-on-surface)] font-semibold"
              style={{ fontSize: '1.125rem', lineHeight: '1.25rem' }}
            >
              Capstone PM
            </span>
            <span
              className="text-[var(--color-on-surface-variant)]"
              style={{ fontSize: '0.6875rem', lineHeight: '0.9375rem' }}
            >
              CS 482 Data Science
            </span>
          </div>
        </Link>

        {/* Divider */}
        <div className="w-px h-6 bg-[var(--color-outline-variant)] mr-4 shrink-0" />

        {/* Nav links */}
        <nav className="flex items-center gap-1 flex-1">
          {navLinks.map(({ to, label }) => {
            const active =
              to === '/'
                ? location.pathname === '/'
                : location.pathname.startsWith(to)
            return (
              <Link
                key={to}
                to={to}
                className={[
                  'px-3 py-1.5 rounded-lg no-underline transition-colors duration-150',
                  active
                    ? 'bg-[var(--color-surface-container)] text-[var(--color-on-surface)] font-medium'
                    : 'text-[var(--color-on-surface-variant)] hover:text-[var(--color-on-surface)] hover:bg-[var(--color-surface-container-low)]',
                ]
                  .filter(Boolean)
                  .join(' ')}
                style={{ fontSize: '0.875rem', lineHeight: '1.375rem' }}
              >
                {label}
              </Link>
            )
          })}
        </nav>

        {/* Right side */}
        <div className="flex items-center gap-3 shrink-0">
          {session && (
            <>
              <div className="flex flex-col items-end leading-none">
                <span
                  className="text-[var(--color-on-surface)] font-medium"
                  style={{ fontSize: '0.8125rem', lineHeight: '1.125rem' }}
                >
                  {session.user.email}
                </span>
                <span
                  className="text-[var(--color-on-surface-variant)]"
                  style={{ fontSize: '0.6875rem', lineHeight: '0.9375rem' }}
                >
                  Lead Engineer
                </span>
              </div>

              {/* Avatar */}
              <div className="w-8 h-8 rounded-full bg-[var(--color-primary)] flex items-center justify-center text-[var(--color-on-primary)] font-semibold text-xs select-none shrink-0">
                {session.user.email[0]?.toUpperCase() ?? 'U'}
              </div>

              {/* Divider */}
              <div className="w-px h-5 bg-[var(--color-outline-variant)]" />

              {/* Sign out */}
              <button
                onClick={() => void signOut()}
                className="flex items-center gap-1 text-[var(--color-on-surface-variant)] hover:text-[var(--color-on-surface)] transition-colors px-2 py-1 rounded-lg hover:bg-[var(--color-surface-container-low)]"
                style={{ fontSize: '0.8125rem' }}
              >
                <span
                  className="material-symbols-outlined text-[16px]"
                  aria-hidden="true"
                >
                  logout
                </span>
                Sign out
              </button>
            </>
          )}
        </div>
      </header>

      {/* Page content */}
      <div className="flex-1 pt-16">
        <Outlet />
      </div>

      {/* Footer */}
      <footer className="border-t border-[var(--color-surface-container)] py-[var(--spacing-space-lg)] px-[var(--spacing-gutter)] flex items-center justify-between">
        <span
          className="text-[var(--color-on-surface-variant)]"
          style={{ fontSize: '0.75rem', lineHeight: '1rem' }}
        >
          Capstone PM &bull; CS 482 Capstone Delivery System
        </span>
        <span
          className="text-[var(--color-on-surface-variant)]"
          style={{ fontSize: '0.75rem', lineHeight: '1rem' }}
        >
          &copy; {new Date().getFullYear()} Carter Lee
        </span>
      </footer>
    </div>
  )
}
