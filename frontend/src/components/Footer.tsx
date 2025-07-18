// src/components/Footer.tsx
import React, { useState, useEffect } from 'react';
import {
  HomeIcon,
  BookOpenIcon,
  PlusCircleIcon,
  GraduationCapIcon,
  UserCogIcon,
} from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../AuthContext';

interface NavItem {
  icon: React.FC<{ size: number }>;
  to?: string;
  onClick?: () => void;
  active: boolean;
  special?: boolean;
}

export default function Footer() {
  const { isAuthenticated, isAdmin } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  // 0) если не залогинен — не показываем
  if (!isAuthenticated) return null;

  // 1) скрываем на формах
  const isFormPage =
    ['/preparations/new', '/team/new'].some(p => pathname.startsWith(p)) ||
    /^\/preparations\/\d+$/.test(pathname) ||
    /^\/team\/\d+$/.test(pathname);
  if (isFormPage) return null;

  // 2) админ на страницах списков «Заготовки» или «Команда» видит единственную кнопку Добавить
  if (isAdmin && ['/preparations', '/team'].includes(pathname)) {
    const to = pathname === '/preparations' ? '/preparations/new' : '/team/new';
    return (
      <footer className="fixed inset-x-0 bottom-0 bg-white flex justify-center py-4 shadow-inner">
        <button
          onClick={() => navigate(to)}
          className="bg-blue-600 text-white px-6 py-3 rounded-full font-semibold"
        >
          Добавить
        </button>
      </footer>
    );
  }

  // 3) обычный футер
  const [subOpen, setSubOpen] = useState(false);
  // закрываем sub-menu при любом изменении маршрута
  useEffect(() => { setSubOpen(false); }, [pathname]);

  const navItems: NavItem[] = [
    {
      icon: HomeIcon,
      to: '/main',
      active: pathname === '/main',
      onClick: () => {
        if (pathname === '/main') window.location.reload();
        else navigate('/main');
      },
    },
    {
      icon: BookOpenIcon,
      to: '/ttk',
      active: pathname === '/ttk',
    },
    {
      icon: PlusCircleIcon,
      special: true,
      to: isAdmin ? '/adminmenu' : '/sandbox',
      active: pathname === (isAdmin ? '/adminmenu' : '/sandbox'),
    },
    {
      icon: GraduationCapIcon,
      to: '/learn',
      active: pathname === '/learn',
    },
    {
      icon: UserCogIcon,
      to: '/profile',
      active: pathname === '/profile',
    },
  ];

  return (
    <footer className="fixed inset-x-0 bottom-0 bg-white flex justify-around py-4 shadow-inner">
      {navItems.map((item, i) => (
        <button
          key={i}
          onClick={item.onClick ?? (() => item.to && navigate(item.to!))}
          className={
            'flex items-center justify-center ' +
            (item.special
              ? 'bg-blue-600 text-white p-2 rounded-full transition-transform active:scale-90'
              : item.active
                ? 'text-blue-600'
                : 'text-gray-500')
          }
        >
          <item.icon size={item.special ? 28 : 24} />
        </button>
      ))}
    </footer>
  );
}
