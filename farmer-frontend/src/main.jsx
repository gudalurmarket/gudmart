import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ThemeProvider } from './shared/lib/ThemeContext.jsx'
import { LangProvider } from './shared/lib/LangContext.jsx'
import App from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
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
