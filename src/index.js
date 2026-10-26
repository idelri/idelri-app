import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { instalarTooltips } from './lib/tooltips'
instalarTooltips()
const root = ReactDOM.createRoot(document.getElementById('root'))
root.render(<React.StrictMode><App /></React.StrictMode>)
