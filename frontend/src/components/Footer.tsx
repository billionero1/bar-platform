// src/components/Footer.tsx
import {
  HomeIcon,
  BookOpenIcon,
  PlusCircleIcon,
  UsersIcon,
  SettingsIcon,
} from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../AuthContext';

export default function Footer() {
  const { isAuthenticated, isAdmin } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  if (!isAuthenticated) return null;

  const isFormPage = [
    '/preparations/new',
    '/team/new',
  ].some(p => pathname.startsWith(p)) ||
    /^\/preparations\/\d+$/.test(pathname) ||
    /^\/team\/\d+$/.test(pathname);

  // на формах скрываем основное меню
  if (isFormPage) return null;

  const navItems = [
    {
      icon: HomeIcon,
      to: '/main',
      active: pathname === '/main',
      onClick: () => {
        if (pathname === '/main') window.location.reload();
        else navigate('/main');
      },
    },
    ...(isAdmin ? [{
      icon: BookOpenIcon,
      to: '/ingredients', // базовый путь, раскрывается подменю
      active: ['/ingredients', '/preparations'].some(p => pathname.startsWith(p)),
      hasSub: true,
    }] : []),
    {
      icon: PlusCircleIcon,
      to: null,
      onClick: () => {
        if (pathname.startsWith('/preparations')) navigate('/preparations/new');
        else if (pathname.startsWith('/team')) navigate('/team/new');
        else navigate('/main');
      },
      special: true,
    },
    {
      icon: SettingsIcon,
      to: '/ttk',
      active: pathname === '/ttk',
    },
    {
      icon: UsersIcon,
      to: '/team',
      active: pathname.startsWith('/team'),
    },
  ];

  return (
    <footer className="fixed inset-x-0 bottom-0 bg-white flex justify-around py-2 shadow-inner">
      {navItems.map((item, i) => (
        <div key={i} className="relative">
          <button
            onClick={item.onClick ?? (() => item.to && navigate(item.to))}
            className={`flex flex-col items-center ${
              item.active ? 'text-blue-600' : 'text-gray-500'
            } ${item.special ? 'bg-blue-600 text-white p-2 rounded-full' : ''}`}
          >
            <item.icon size={ item.special ? 32 : 24 } />
          </button>

          {/* подменю ингредиентов/заготовок */}
          {item.hasSub && (
            <div className="absolute bottom-full mb-2 flex-col hidden group-hover:flex space-y-1 bg-white p-2 rounded shadow">
              <button
                className="text-sm"
                onClick={() => navigate('/ingredients')}
              >
                Ингредиенты
              </button>
              <button
                className="text-sm"
                onClick={() => navigate('/preparations')}
              >
                Заготовки
              </button>
            </div>
          )}
        </div>
      ))}
    </footer>
  );
}
