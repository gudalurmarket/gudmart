import { createContext, useContext, useEffect, useState } from 'react'

const STORAGE_KEY = 'gudalur-theme'

function getInitialTheme () {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'dark' || stored === 'light') return stored
  } catch (_) {
    // localStorage unavailable (SSR / private browsing edge case)
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export const ThemeContext = createContext(null)

export function ThemeProvider ({ children }) {
  const [theme, setTheme] = useState(getInitialTheme)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    try {
      localStorage.setItem(STORAGE_KEY, theme)
    } catch (_) {}
  }, [theme])

  function toggleTheme () {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'))
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme () {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider')
  return ctx
}
