import ReactDOM from 'react-dom/client'
import { setupIonicReact } from '@ionic/react'
import App from './App'
import AppProviders from './app/AppProviders'

import '@ionic/react/css/core.css'
import '@ionic/react/css/structure.css'
// import '@ionic/react/css/normalize.css'; // Commented out to avoid conflicts

import './theme/variables.css'
import './index.css'

setupIonicReact()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <AppProviders>
    <App />
  </AppProviders>,
)
