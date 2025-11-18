// src/App.tsx
import React from 'react';
import { Routes, Route } from 'react-router-dom';

import { RequireAuth, OnlyGuests } from './guards';

import LoginPassword from './pages/LoginPassword';
import Register from './pages/Register';
import Recover from './pages/Recover';

import Workspace from './pages/Workspace';
import LoginPinOverlay from './pages/LoginPin';

const App: React.FC = () => {
  return (
    <>
      {/* Глобальный PIN-оверлей — всегда рядом с роутером */}
      <LoginPinOverlay />

      <Routes>
        {/* Гостевые страницы */}
        <Route element={<OnlyGuests />}>
          <Route path="/login" element={<LoginPassword />} />
          <Route path="/register" element={<Register />} />
          <Route path="/recover" element={<Recover />} />
        </Route>

        {/* Приватные страницы */}
        <Route element={<RequireAuth />}>
          <Route path="/" element={<Workspace />} />
          {/* здесь добавишь остальные приватные маршруты */}
        </Route>

        {/* Fallback */}
        <Route path="*" element={<LoginPassword />} />
      </Routes>
    </>
  );
};

export default App;
