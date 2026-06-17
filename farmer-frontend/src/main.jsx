import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ThemeProvider } from './shared/lib/ThemeContext.jsx'
import { LangProvider } from './shared/lib/LangContext.jsx'
import App from './App.jsx'
import { missingFirebaseEnvKeys } from './shared/lib/firebase.js'
import './index.css'

const missingFirebase = missingFirebaseEnvKeys()
const rootEl = document.getElementById('root')

if (missingFirebase.length > 0) {
  rootEl.innerHTML = `
    <div style="font-family: system-ui, sans-serif; max-width: 28rem; margin: 4rem auto; padding: 1.5rem; border: 1px solid #e5e7eb; border-radius: 0.75rem;">
      <h1 style="font-size: 1.125rem; margin: 0 0 0.5rem;">App configuration error</h1>
      <p style="margin: 0 0 1rem; color: #4b5563; line-height: 1.5;">
        Firebase settings were not included in this build, so the app cannot start.
        Redeploy with <code>VITE_FIREBASE_*</code> build arguments or commit <code>farmer-frontend/.env.production</code>.
      </p>
      <p style="margin: 0; font-size: 0.875rem; color: #b91c1c;">Missing: ${missingFirebase.join(', ')}</p>
    </div>
  `
} else {
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <BrowserRouter>
        <ThemeProvider>
          <LangProvider>
            <App />
          </LangProvider>
        </ThemeProvider>
      </BrowserRouter>
    </React.StrictMode>
  )
}
