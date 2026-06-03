import NavBar from './NavBar.jsx'
import useAuth from '../hooks/useAuth.js'
import { ROLES } from '../lib/constants.js'

export default function Layout ({ children }) {
  const { role } = useAuth()

  if (role === ROLES.VOLUNTEER) {
    return (
      <div className="flex min-h-dvh w-full flex-col bg-[--color-background]">
        <main className="flex-1 overflow-y-auto px-4 py-4 pt-[calc(3.5rem+1rem)]">
          {children}
        </main>
        <NavBar />
      </div>
    )
  }

  return (
    <div className="flex min-h-dvh w-full flex-col bg-[--color-background]">
      <NavBar />
      <main className="flex-1 overflow-y-auto px-4 py-6 pt-[calc(3.5rem+1rem)] pb-[calc(3.5rem+1rem)] sm:px-6">
        {children}
      </main>
    </div>
  )
}
