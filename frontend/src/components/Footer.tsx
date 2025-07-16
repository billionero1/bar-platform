import React from 'react';
import {
  HomeIcon,
  BookOpenIcon,
  PlusCircleIcon,
  UsersIcon,
  GraduationCapIcon,
  UserCogIcon,
} from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../AuthContext';

export default function Footer() {
  const { isAuthenticated, isAdmin } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  if (!isAuthenticated) return null;

  // Скрываем футер на формах
  const isFormPage =
    ['/preparations/new', '/team/new'].some(p => pathname.startsWith(p)) ||
    /^\/preparations\/\d+$/.test(pathname) ||
    /^\/team\/\d+$/.test(pathname);
  if (isFormPage) return null;

  type NavItem = {
    icon: React.FC<{ size: number }>;
    to?: string;
    onClick?: () => void;
    active?: boolean;
    special?: boolean;
    hasSub?: boolean;
    sub?: { label: string; to: string }[];
  };

  const navItems: NavItem[] = [];

  // 1. Дом
  navItems.push({
    icon: HomeIcon,
    to: '/main',
    active: pathname === '/main',
    onClick: () => {
      if (pathname === '/main') window.location.reload();
      else navigate('/main');
    },
  });

  // 2. TTK
  navItems.push({
    icon: BookOpenIcon,
    to: '/ttk',
    active: pathname === '/ttk',
  });

  // 3. Плюс (админ → три пузырька, персонал → песочница)
  if (isAdmin) {
    navItems.push({
      icon: PlusCircleIcon,
      special: true,
      hasSub: true,
      active: ['/ingredients', '/preparations', '/team'].some(p => pathname.startsWith(p)),
      sub: [
        { label: 'Ингредиенты', to: '/ingredients' },
        { label: 'Заготовки', to: '/preparations' },
        { label: 'Команда',   to: '/team' },
      ],
    });
  } else {
    navItems.push({
      icon: PlusCircleIcon,
      special: true,
      to: '/sandbox',
      active: pathname === '/sandbox',
    });
  }

  // 4. Learn
  navItems.push({
    icon: GraduationCapIcon,
    to: '/learn',
    active: pathname === '/learn',
  });

  // 5. Профиль
  navItems.push({
    icon: UserCogIcon,
    to: '/profile',
    active: pathname === '/profile',
  });

  return (
    <footer className="fixed inset-x-0 bottom-0 bg-white flex justify-around py-8 shadow-inner">
      {navItems.map((item, i) => (
        <div key={i} className={`relative ${item.hasSub ? 'group' : ''}`}>
          <button
            onClick={item.onClick ?? (() => item.to && navigate(item.to))}
            className={
              item.special
                ? 'flex items-center justify-center bg-blue-600 text-white p-1.5 rounded-full'
                : `flex items-center justify-center ${item.active ? 'text-blue-600' : 'text-gray-500'}`
            }
          >
            <item.icon size={item.special ? 28 : 24} />
          </button>

          {/* субменю для админа */}
          {item.hasSub && item.sub && (
            <div className="absolute bottom-full mb-2 hidden group-hover:flex flex-col items-center space-y-1">
              {item.sub.map((subItem, idx) => (
                <button
                  key={idx}
                  onClick={() => navigate(subItem.to)}
                  className="bg-white p-2 rounded-full shadow"
                >
                  {/* Здесь можно рисовать маленькую иконку вместо текста */}
                  {subItem.label}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </footer>
  );
}
