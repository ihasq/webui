import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initDebugUtils } from './lib/debug-idb'

// Initialize debug utils for devtools (available in both dev and prod)
initDebugUtils()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
