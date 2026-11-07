import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider, createBrowserRouter } from 'react-router-dom';
import App from './App';
import './styles/global.css';
   if (import.meta.env.DEV) import('./utils/debugOverflow');

// A "data router" (instead of <BrowserRouter>) so the Settings screen can stop navigation while there are unsaved changes (useBlocker).
// The single catch-all route simply renders the app, whose own <Routes> work exactly as before.
const router = createBrowserRouter([{ path: '*', element: <App /> }]);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);