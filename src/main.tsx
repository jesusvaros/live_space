import React from 'react'
import ReactDOM from 'react-dom/client'
import { setupIonicReact } from '@ionic/react'
import App from './App'
import { AuthProvider } from './contexts/AuthContext'
import { WorkspaceProvider } from './contexts/WorkspaceContext'

import '@ionic/react/css/core.css'
import '@ionic/react/css/structure.css'
// import '@ionic/react/css/normalize.css'; // Commented out to avoid conflicts

import './theme/variables.css'
import './index.css'

setupIonicReact()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <WorkspaceProvider>
        <App />
      </WorkspaceProvider>
    </AuthProvider>
  </React.StrictMode>,
)
