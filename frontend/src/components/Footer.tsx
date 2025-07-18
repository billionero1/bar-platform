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

  // 0) Если не залогинен — не показываем
  if (!isAuthenticated) return null;

  // 1) Скрываем футер на формах редактирования/добавления
  const isFormPage =
    ['/preparations/new', '/team/new'].some(p => pathname.startsWith(p)) ||
    /^\/preparations\/\d+$/.test(pathname) ||
    /^\/team\/\d+$/.test(pathname);
  if (isFormPage) return null;

  // 2) Админ на списках «Заготовки» и «Команда» видит только большую кнопку «Добавить»
  const isAddListPage = isAdmin && ['/preparations', '/team'].includes(pathname);
  if (isAddListPage) {
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

  // 3) Обычный футер
  const [subOpen, setSubOpen] = useState(false);

  // При любом переходе по URL — закрываем цветок‑меню
  useEffect(() => {
    setSubOpen(false);
  }, [pathname]);

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
    // 3. «+»: админ → цветок‑меню; персонал → песочница
    isAdmin
      ? {
          icon: PlusCircleIcon,
          special: true,
          hasSub: true,
          active: ['/ingredients', '/preparations', '/team'].some(p =>
            pathname.startsWith(p)
          ),
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
    // 4. Learn (шапка академии)
    {
      icon: GraduationCapIcon,
      to: '/learn',
      active: pathname === '/learn',
    },
    // 5. Профиль
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
                ? 'flex items-center justify-center bg-blue-600 text-white p-2 rounded-full transition-transform active:scale-90'
                : `flex items-center justify-center ${
                    item.active ? 'text-blue-600' : 'text-gray-500'
                  }`
            }
          >
            <item.icon size={item.special ? 28 : 24} />
          </button>

          {/* «цветок» — пузырьки для админа */}
          {item.hasSub && item.sub && subOpen && (
            <div
              className="
                absolute bottom-full left-1/2 
                transform -translate-x-1/2 mb-4 
                flex items-center space-x-4
              "
            >
              {item.sub.map((sub, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    // сначала навигируем, затем закрываем меню
                    if (pathname === sub.to) window.location.reload();
                    else navigate(sub.to);
                    setSubOpen(false);
                  }}
                  className="bg-white p-2 rounded-full shadow hover:bg-gray-100 transition"
                >
                  {sub.label}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </footer>
  );
}
