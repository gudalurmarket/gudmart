import { useEffect, useState, useCallback } from 'react'
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
} from 'firebase/auth'
import { auth } from '../lib/firebase.js'
import { ROLES } from '../lib/constants.js'

export default function useAuth () {
  const [user, setUser] = useState(null)
  const [role, setRole] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser)
      if (firebaseUser) {
        try {
          const result = await firebaseUser.getIdTokenResult()
          const claimRole = result.claims.role
          if (claimRole === ROLES.OPERATOR || claimRole === ROLES.VOLUNTEER) {
            setRole(claimRole)
          } else {
            setRole(null)
          }
        } catch {
          setRole(null)
        }
      } else {
        setRole(null)
      }
      setLoading(false)
    })
    return unsubscribe
  }, [])

  const signIn = useCallback(async (email, password) => {
    setError(null)
    try {
      await signInWithEmailAndPassword(auth, email, password)
    } catch (err) {
      const message = err.message ?? 'Sign-in failed'
      setError(message)
      throw err
    }
  }, [])

  const signOut = useCallback(async () => {
    setError(null)
    await firebaseSignOut(auth)
  }, [])

  return { user, role, loading, error, signIn, signOut }
}
