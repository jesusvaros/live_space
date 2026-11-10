import ReactDOM from 'react-dom/client'
import App from './App'
import AppProviders from './app/AppProviders'
import { ToastProvider } from './components/ui/AppPrimitives'
import { installImageFallback } from './lib/imageFallback'
import { BOOT_BUDGET_MS, bootCache } from './app/bootCache'
import { preloadRoute } from './app/lazyPage'

import './theme/variables.css'
import './index.css'

installImageFallback()

const render = () =>
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <AppProviders>
      <ToastProvider>
        <App />
      </ToastProvider>
    </AppProviders>,
  )

// What was on screen last time, and the code of the screen the app opens on,
// load first (a short, bounded wait), so the first paint shows the screen
// with its saved data instead of a loader and skeletons.
const routeReady = Promise.race([
  preloadRoute(window.location.pathname),
  new Promise(resolve => setTimeout(resolve, BOOT_BUDGET_MS)),
])
Promise.all([bootCache().catch(() => undefined), routeReady]).finally(render)
