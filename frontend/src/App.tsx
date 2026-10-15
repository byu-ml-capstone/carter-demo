import {
  Navigate,
  Outlet,
  RouterProvider,
  createBrowserRouter,
} from 'react-router-dom'
import { AppLayout } from './AppLayout'
import { AuthPage } from './AuthPage'
import { ProjectListPage } from './ProjectListPage'
import { ReportPage } from './ReportPage'
import { SessionProvider } from './session'
import { Toaster } from './toast'
import { WorkspacePage } from './WorkspacePage'

function Root() {
  return (
    <SessionProvider>
      <Outlet />
      <Toaster />
    </SessionProvider>
  )
}

export const routes = [
  {
    element: <Root />,
    children: [
      { path: '/sign-in', element: <Navigate to="/" replace /> },
      { path: '/sign-up', element: <AuthPage /> },
      {
        element: <AppLayout />,
        children: [
          { path: '/', element: <ProjectListPage /> },
          { path: '/projects/:projectId', element: <WorkspacePage /> },
          { path: '/sprints/:sprintId/report', element: <ReportPage /> },
        ],
      },
    ],
  },
]

const router = createBrowserRouter(routes)

export default function App() {
  return <RouterProvider router={router} />
}
