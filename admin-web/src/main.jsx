
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { GoogleOAuthProvider } from '@react-oauth/google';

// CLIENT ID sẽ được thay thế khi deploy hoặc thông qua ENV
const CLIENT_ID = '371569491012-d7qfkghaooven40n6kqbfh1gmvtqs558.apps.googleusercontent.com'; 

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <GoogleOAuthProvider clientId={CLIENT_ID}>
      <App />
    </GoogleOAuthProvider>
  </React.StrictMode>,
)
