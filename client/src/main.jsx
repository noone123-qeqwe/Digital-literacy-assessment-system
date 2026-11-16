import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import PageLoadBoundary from './components/common/PageLoadBoundary.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <PageLoadBoundary><App /></PageLoadBoundary>
  </StrictMode>,
)
