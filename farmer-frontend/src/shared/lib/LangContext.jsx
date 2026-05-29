import { createContext, useContext, useState } from 'react'
import { translations } from './translations.js'

export const LangContext = createContext()

export function LangProvider ({ children }) {
  const [lang, setLang] = useState('en')
  const t = (key) => translations[key]?.[lang] ?? key
  return (
    <LangContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LangContext.Provider>
  )
}

export function useLang () {
  return useContext(LangContext)
}
