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

  if (!isAuthenticated) return null;

  // 1) Скрываем Footer на формах редактирования/добавления
  const isFormPage =
    ['/preparations/new', '/team/new'].some(p => pathname.startsWith(p)) ||
    /^\/preparations\/\d+$/.test(pathname) ||
    /^\/team\/\d+$/.test(pathname);
  if (isFormPage) return null;

  // 2) На страницах списка заготовок и команды показываем одну большую кнопку “Добавить”
  const isSimpleAddPage = isAdmin && ['/preparations', '/team'].includes(pathname);
  if (isSimpleAddPage) {
    const addPath = pathname === '/preparations' ? '/preparations/new' : '/team/new';
    return (
      <footer className="fixed inset-x-0 bottom-0 bg-white flex justify-center py-4 shadow-inner">
        <button
          onClick={() => navigate(addPath)}
          className="bg-blue-600 text-white px-6 py-3 rounded-full font-semibold"
        >
          Добавить
        </button>
      </footer>
    );
  }

  // 3) Обычный Footer с пятью иконками
  type NavItem = {
    icon: React.FC<{ size: number }>;
    to?: string;
    onClick?: () => void;
    active?: boolean;
    special?: boolean;
    hasSub?: boolean;
    sub?: { label: string; to: string }[];
  };

  const [subOpen, setSubOpen] = useState(false);

  // Закрываем меню‑пузырьки при переходе по любому URL
  useEffect(() => {
    setSubOpen(false);
  }, [pathname]);

  const navItems: NavItem[] = [
    // 1. Дом
    {
      icon: HomeIcon,
      to: '/main',
      active: pathname === '/main',
      onClick: () => {
        if (pathname === '/main') window.location.reload();
        else navigate('/main');
      },
    },
    // 2. TTK (книга)
    {
      icon: BookOpenIcon,
      to: '/ttk',
      active: pathname === '/ttk',
    },
    // 3. Плюс → админ: три пузырька; персонал: песочница
    isAdmin
      ? {
          icon: PlusCircleIcon,
          special: true,
          hasSub: true,
          active: ['/ingredients', '/preparations', '/team'].some(p => pathname.startsWith(p)),
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
    // 4. Learn (шапка академки)
    {
      icon: GraduationCapIcon,
      to: '/learn',
      active: pathname === '/learn',
    },
    // 5. Профиль (замена “Команды” для персонала)
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
            onClick={
              item.onClick ??
              (() => {
                if (item.to) navigate(item.to);
              })
            }
            className={
              item.special
                ? 'flex items-center justify-center bg-blue-600 text-white p-2 rounded-full'
                : `flex items-center justify-center ${
                    item.active ? 'text-blue-600' : 'text-gray-500'
                  }`
            }
          >
            <item.icon size={item.special ? 28 : 24} />
          </button>

          {/* 4) Меню‑пузырьки для админа */}
          {item.hasSub && item.sub && subOpen && (
            <div className="absolute bottom-full mb-2 flex flex-col items-center space-y-1">
              {item.sub.map((subItem, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    navigate(subItem.to);
                    setSubOpen(false);
                  }}
                  className="bg-white p-2 rounded-full shadow"
                >
                  {/* Здесь можно заменить текст на маленькую иконку */}
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
