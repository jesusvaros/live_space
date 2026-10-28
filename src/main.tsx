import ReactDOM from 'react-dom/client'
import App from './App'
import AppProviders from './app/AppProviders'
import { ToastProvider } from './components/ui/AppPrimitives'
import { installImageFallback } from './lib/imageFallback'

import './theme/variables.css'
import './index.css'

installImageFallback()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <AppProviders>
    <ToastProvider>
      <App />
    </ToastProvider>
  </AppProviders>,
)
