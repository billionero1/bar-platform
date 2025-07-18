// src/components/Footer.tsx
import React, { useState, useEffect } from 'react';
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

  // 0) Хуки всегда в начале
  const [subOpen, setSubOpen] = useState(false);
  useEffect(() => {
    setSubOpen(false);
  }, [pathname]);

  // 1) Не показываем, если не залогинен
  if (!isAuthenticated) return null;

  // 2) Скрываем на формах
  const isFormPage =
    ['/preparations/new', '/team/new'].some(p => pathname.startsWith(p)) ||
    /^\/preparations\/\d+$/.test(pathname) ||
    /^\/team\/\d+$/.test(pathname);
  if (isFormPage) return null;

  // 3) Админ на списках “Заготовки”/“Команда” — одна кнопка “Добавить”
  const isAddListPage =
    isAdmin && ['/preparations', '/team'].includes(pathname);
  if (isAddListPage) {
    const to = pathname === '/preparations'
      ? '/preparations/new'
      : '/team/new';
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

  // 4) Обычный Footer
  type NavItem = {
    icon: React.FC<{ size: number }>;
    to?: string;
    onClick?: () => void;
    active?: boolean;
    special?: boolean;
    hasSub?: boolean;
    sub?: { label: string; to: string }[];
  };

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
    isAdmin
      ? {
          icon: PlusCircleIcon,
          special: true,
          hasSub: true,
          active: ['/ingredients','/preparations','/team']
            .some(p => pathname.startsWith(p)),
          sub: [
            { label: 'Ингредиенты', to: '/ingredients' },
            { label: 'Заготовки',   to: '/preparations' },
            { label: 'Команда',     to: '/team' },
          ],
          onClick: () => setSubOpen(o => !o),
        }
      : {
          icon: PlusCircleIcon,
          special: true,
          to: '/sandbox',
          active: pathname === '/sandbox',
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
        <div key={i} className="relative">
          <button
            onClick={item.onClick ?? (() => item.to && navigate(item.to))}
            className={
              item.special
                ? 'flex items-center justify-center bg-blue-600 text-white p-2 rounded-full transition-transform active:scale-90'
                : `flex items-center justify-center ${
                    item.active ? 'text-blue-600' : 'text-gray-500'
                  }`
            }
          >
            <item.icon size={item.special ? 28 : 24} />
          </button>

          {/* «Цветок» — три пузырька */}
          {item.hasSub && item.sub && subOpen && (
            <div
              className="
                absolute bottom-full left-1/2 transform -translate-x-1/2 mb-4
                flex items-center justify-center space-x-4
              "
            >
              {/* левый */}
              <button
                onClick={() => {
                  navigate(item.sub![0].to);
                  setSubOpen(false);
                }}
                className="bg-white p-2 rounded-full shadow hover:bg-gray-100"
              >
                {item.sub![0].label}
              </button>
              {/* центр */}
              <button
                onClick={() => {
                  navigate(item.sub![1].to);
                  setSubOpen(false);
                }}
                className="bg-white p-2 rounded-full shadow hover:bg-gray-100"
              >
                {item.sub![1].label}
              </button>
              {/* правый */}
              <button
                onClick={() => {
                  navigate(item.sub![2].to);
                  setSubOpen(false);
                }}
                className="bg-white p-2 rounded-full shadow hover:bg-gray-100"
              >
                {item.sub![2].label}
              </button>
            </div>
          )}
        </div>
      ))}
    </footer>
  );
}
