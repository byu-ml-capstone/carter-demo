import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { setToken } from '../api'
import { routes } from '../App'

export async function loginTo(path: string) {
  setToken('token-1')
  const user = userEvent.setup({ delay: null })
  const router = createMemoryRouter(routes, {
    initialEntries: [path],
  })
  render(<RouterProvider router={router} />)
  return { user, router }
}

export const signedInUser = {
  id: 'u1',
  email: 'ada@example.com',
  created_at: '2024-01-01T00:00:00.000Z',
}
