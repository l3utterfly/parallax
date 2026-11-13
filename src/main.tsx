import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

async function start() {
  // Development only: `?layla-mock` simulates running inside Layla (see src/dev/laylaDevBridge.ts).
  if (import.meta.env.DEV && new URLSearchParams(location.search).has('layla-mock')) {
    const { installLaylaDevBridge } = await import('./dev/laylaDevBridge')
    installLaylaDevBridge()
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void start()
