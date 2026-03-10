// src/main.tsx
import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import App from './App';
import { AuthProvider } from './AuthContext';

import './app/base.css';

import { ensureCsrfInitialized } from './shared/api';
import { LayoutProvider } from './shared/ui/LayoutProvider';
import { useLayout } from './shared/ui/useLayout';

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.error('Service worker registration failed', err);
    });
  });
}

// Простой лоадер
const SimpleLoader: React.FC = () => (
  <div
    style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      height: '100vh',
      fontFamily: 'system-ui, sans-serif',
      backgroundColor: '#f5f5f5',
    }}
  >
    <div style={{ textAlign: 'center', padding: 20 }}>
      <div
        style={{
          width: 40,
          height: 40,
          border: '4px solid #e3e3e3',
          borderTop: '4px solid #007bff',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
          margin: '0 auto 16px',
        }}
      />
      <p style={{ margin: 0, color: '#666' }}>Загрузка...</p>
    </div>

    <style>
      {`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}
    </style>
  </div>
);

const Boot: React.FC = () => {
  const layout = useLayout(); // ✅ хук на верхнем уровне
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      setReady(false);

      try {
        // 1) Стили — строго по breakpoints
        if (layout === 'mobile') await import('./app/layout.mobile.css');
        if (layout === 'tablet') await import('./app/layout.tablet.css');
        if (layout === 'desktop') await import('./app/layout.desktop.css');

        // 2) CSRF — как было
        await ensureCsrfInitialized();
      } catch (e) {
        console.error('❌ Boot init error:', e);
      } finally {
        if (!cancelled) setReady(true);
      }
    }

    void init();
    return () => {
      cancelled = true;
    };
  }, [layout]);

  if (!ready) return <SimpleLoader />;
  return <App />;
};

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Failed to find the root element');

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <LayoutProvider>
          <Boot />
        </LayoutProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
