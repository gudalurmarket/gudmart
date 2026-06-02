import { Navigate } from 'react-router-dom'
import useAuth from '../hooks/useAuth.js'
import LoadingSpinner from './LoadingSpinner.jsx'
import { ROLES } from '../lib/constants.js'

export default function ProtectedRoute ({ role, children }) {
  const { user, role: userRole, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (userRole !== role) {
    if (userRole === ROLES.OPERATOR) {
      return <Navigate to="/operator/dashboard" replace />
    }
    if (userRole === ROLES.VOLUNTEER) {
      return <Navigate to="/volunteer/delivery" replace />
    }
    return <Navigate to="/login" replace />
  }

  return children
}
