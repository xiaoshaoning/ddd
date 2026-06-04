import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { create_mock_api } from './mock_api';
import './styles/index.css';

// Inject mock GDB API when running in browser (not Electron)
if (!window.gdbAPI) {
  console.log('[DDD] Running in browser mode - using mock GDB API');
  window.gdbAPI = create_mock_api();
}

const root_element = document.getElementById('root');
if (!root_element) {
  throw new Error('Root element not found');
}

const root = ReactDOM.createRoot(root_element);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
