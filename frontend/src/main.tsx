// src/main.tsx
import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ensureCsrfInitialized } from './lib/api';
import App from './App';
import { AuthProvider } from './services/auth/AuthContext';
import { ThemeProvider } from './theme/ThemeProvider';
import './theme/global.css';

const SimpleLoader: React.FC = () => (
  <div style={{
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100vh',
    fontFamily: 'system-ui, sans-serif',
    backgroundColor: '#f5f5f5'
  }}>
    <div style={{ textAlign: 'center', padding: '20px' }}>
      <div style={{
        width: '40px',
        height: '40px',
        border: '4px solid #e3e3e3',
        borderTop: '4px solid #007bff',
        borderRadius: '50%',
        animation: 'spin 1s linear infinite',
        margin: '0 auto 16px'
      }} />
      <p style={{ margin: 0, color: '#666' }}>Загрузка...</p>
    </div>
    <style>
      {`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}
    </style>
  </div>
);

const RootApp: React.FC = () => {
  const [appReady, setAppReady] = useState(false);

  useEffect(() => {
    const initializeApp = async () => {
      try {
        // Инициализируем CSRF
        await ensureCsrfInitialized();
        
        // Даем небольшую задержку для гарантии
        await new Promise(resolve => setTimeout(resolve, 100));
        
        setAppReady(true);
      } catch (error) {
        console.error('App initialization failed:', error);
        setAppReady(true); // Все равно продолжаем
      }
    };

    initializeApp();
  }, []);

  if (!appReady) {
    return <SimpleLoader />;
  }

  return <App />;
};

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Failed to find the root element');
}

const root = ReactDOM.createRoot(rootElement);

root.render(
  <React.StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <RootApp />
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>
);