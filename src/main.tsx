import React from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import App from './routes/App';
import DocumentTextPage from './routes/DocumentTextPage';
import SettingsPage from './routes/SettingsPage';
import './styles.css';

const router = createBrowserRouter([
  { path: '/', element: <App /> },
  { path: '/settings', element: <SettingsPage /> },
  { path: '/documents/:id/text', element: <DocumentTextPage /> },
]);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
