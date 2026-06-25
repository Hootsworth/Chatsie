import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Prevent Vite dev server from forcing a full page reload when tab focus is lost and regained
if (import.meta.hot) {
  import.meta.hot.on('vite:beforeFullReload', () => {
    console.warn('Chatsie HMR: Blocked Vite full page reload on tab refocus.');
    throw 'skipping full reload';
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
