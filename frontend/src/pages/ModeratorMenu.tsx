import React from 'react';
import { useNavigate } from 'react-router-dom';

const ModeratorMenu: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center justify-center h-screen space-y-4 px-4 bg-white">
      <button
        onClick={() => navigate('/calculate')}
        className="w-full max-w-xs rounded-md bg-blue-600 py-2 text-white"
      >
        Расчёт заготовок
      </button>
      <button
        onClick={() => navigate('/ingredients')}
        className="w-full max-w-xs rounded-md bg-blue-600 py-2 text-white"
      >
        Ингредиенты
      </button>
      <button
        onClick={() => navigate('/preparations')}
        className="w-full max-w-xs rounded-md bg-blue-600 py-2 text-white"
      >
        Заготовки
      </button>
    </div>
  );
};

export default ModeratorMenu;