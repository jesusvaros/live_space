import React from 'react'
import ReactDOM from 'react-dom/client'
import { setupIonicReact } from '@ionic/react'
import App from './App'
import { AuthProvider } from './contexts/AuthContext'

import '@ionic/react/css/core.css'
import '@ionic/react/css/normalize.css'
import '@ionic/react/css/structure.css'

import './theme/variables.css'
import './index.css'

setupIonicReact()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>,
)
