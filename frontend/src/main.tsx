// src/main.tsx

import React, { useEffect, useState } from 'react';

import ReactDOM from 'react-dom/client';

import { BrowserRouter } from 'react-router-dom';

import { ensureCsrfInitialized } from './lib/api';

import App from './App';

import { AuthProvider } from './AuthContext';



// Простой лоадер

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

  const [stylesLoaded, setStylesLoaded] = useState(false);

  const [appReady, setAppReady] = useState(false);



  useEffect(() => {

    const initializeApp = async () => {

      try {

        // 1. Загружаем стили

        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 

                        window.innerWidth <= 768;



        if (isMobile) {

          await import('./index.mobile.css');

        } else {

          await import('./index.desktop.css');

        }

        setStylesLoaded(true);



        // 2. ПРИНУДИТЕЛЬНО инициализируем CSRF

        console.log('🔄 Main: Ensuring CSRF initialization...');

        await ensureCsrfInitialized();

        console.log('✅ Main: CSRF initialization completed');

        

        // Даем небольшую задержку для гарантии

        await new Promise(resolve => setTimeout(resolve, 100));

        

        setAppReady(true);



      } catch (error) {

        console.error('App initialization failed:', error);

        setStylesLoaded(true);

        setAppReady(true); // Все равно продолжаем

      }

    };



    initializeApp();

  }, []);



  if (!stylesLoaded || !appReady) {

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

      <AuthProvider>

        <RootApp />

      </AuthProvider>

    </BrowserRouter>

  </React.StrictMode>

);


