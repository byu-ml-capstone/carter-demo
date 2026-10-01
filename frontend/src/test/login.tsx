import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { routes } from '../App'

export async function loginTo(path: string) {
  const user = userEvent.setup({ delay: null })
  const router = createMemoryRouter(routes, {
    initialEntries: [`/sign-in?next=${encodeURIComponent(path)}`],
  })
  render(<RouterProvider router={router} />)
  await user.type(screen.getByLabelText('Email'), 'Ada@Example.com')
  await user.type(screen.getByLabelText('Password'), 'password1')
  await user.click(screen.getByRole('button', { name: 'Sign in' }))
  return { user, router }
}

export const signedInUser = {
  id: 'u1',
  email: 'ada@example.com',
  created_at: '2024-01-01T00:00:00.000Z',
}
