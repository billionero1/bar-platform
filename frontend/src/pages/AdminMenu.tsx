// src/pages/AdminMenu.tsx
import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function AdminMenu() {
  const navigate = useNavigate();
  return (
    <div className="h-full flex flex-col items-center bg-gray-50 p-4 pt-16 space-y-6">
      <h1 className="text-2xl font-semibold">Меню менеджера</h1>

      <button
        onClick={() => navigate('/ingredients')}
        className="w-full max-w-sm py-4 bg-white rounded-lg shadow hover:shadow-lg transition"
      >
        Ингредиенты
      </button>

      <button
        onClick={() => navigate('/preparations')}
        className="w-full max-w-sm py-4 bg-white rounded-lg shadow hover:shadow-lg transition"
      >
        Заготовки
      </button>

      <button
        onClick={() => navigate('/team')}
        className="w-full max-w-sm py-4 bg-white rounded-lg shadow hover:shadow-lg transition"
      >
        Команда
      </button>
    </div>
  );
}
