import { Navigate, Outlet, RouterProvider, createBrowserRouter, useLocation } from 'react-router-dom'
import { AuthPage } from './AuthPage'
import { ProjectListPage } from './ProjectListPage'
import { ReportPage } from './ReportPage'
import { SessionProvider, useSession } from './session'
import { Toaster } from './toast'
import { WorkspacePage } from './WorkspacePage'
import { safeNext } from './ui'

function Root() {
  return (
    <SessionProvider>
      <Outlet />
      <Toaster />
    </SessionProvider>
  )
}

function RequireAuth() {
  const { session } = useSession()
  const location = useLocation()
  if (!session) {
    const next = safeNext(`${location.pathname}${location.search}`)
    return <Navigate to={`/sign-in?next=${encodeURIComponent(next)}`} replace />
  }
  return <Outlet />
}

const router = createBrowserRouter([
  {
    element: <Root />,
    children: [
      { path: '/sign-in', element: <AuthPage mode="login" /> },
      { path: '/sign-up', element: <AuthPage mode="register" /> },
      {
        element: <RequireAuth />,
        children: [
          { path: '/', element: <ProjectListPage /> },
          { path: '/projects/:projectId', element: <WorkspacePage /> },
          { path: '/sprints/:sprintId/report', element: <ReportPage /> },
        ],
      },
    ],
  },
])

export default function App() {
  return <RouterProvider router={router} />
}
