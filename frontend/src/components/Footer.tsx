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

  // ─── state и эффекты ─────────────────────────────
  const [subOpen, setSubOpen] = useState(false);
  useEffect(() => { setSubOpen(false); }, [pathname]);

  // ─── ранние return ───────────────────────────────
  if (!isAuthenticated) return null;

  // 1) На формах футер не показываем
  const isFormPage =
    ['/preparations/new', '/team/new'].some(p => pathname.startsWith(p)) ||
    /^\/preparations\/\d+$/.test(pathname) ||
    /^\/team\/\d+$/.test(pathname);
  if (isFormPage) return null;

  // 2) На списках у админа — одна кнопка «Добавить»
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

  // ─── пункты меню ─────────────────────────────────
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

  // ─── отрисовка футера ─────────────────────────────
  return (
    <footer className="fixed inset-x-0 bottom-0 bg-white flex justify-around py-4 shadow-inner">
      {navItems.map((item, i) => (
        <div key={i} className="relative flex-1 flex justify-center">
          <button
            onClick={
              item.onClick ??
              (() => {
                if (item.to) navigate(item.to);
              })
            }
            className={`flex items-center justify-center p-2 rounded-full transition ${
              item.special
                ? `bg-blue-600 text-white ${subOpen ? 'ring-2 ring-blue-300' : ''}`
                : item.active
                ? 'text-blue-600'
                : 'text-gray-500'
            }`}
          >
            <item.icon size={24} />
          </button>

          {/* «цветок» — пузырьки для админа */}
          {item.hasSub && item.sub && subOpen && (
            <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-4 w-0 h-0">
              {/* центральный пузырёк */}
              <button
                onClick={() => {
                  setSubOpen(false);
                  navigate(item.sub![1].to);
                }}
                className="absolute left-1/2 transform -translate-x-1/2 -bottom-12 bg-white p-2 rounded-full shadow"
              >
                {item.sub![1].label}
              </button>
              {/* левый пузырёк */}
              <button
                onClick={() => {
                  setSubOpen(false);
                  navigate(item.sub![0].to);
                }}
                className="absolute -left-12 -bottom-8 bg-white p-2 rounded-full shadow"
              >
                {item.sub![0].label}
              </button>
              {/* правый пузырёк */}
              <button
                onClick={() => {
                  setSubOpen(false);
                  navigate(item.sub![2].to);
                }}
                className="absolute left-12 -bottom-8 bg-white p-2 rounded-full shadow"
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
