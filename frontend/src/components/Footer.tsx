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

interface FooterProps {
  /** Функция сохранения формы — необязательная */
  onFormSave?: () => Promise<void> | void;
  /** Индикатор, что идёт сохранение */
  isSaving?: boolean;
  /** Надпись на кнопке сохранения */
  saveLabel?: string;
  /** Показывать ли «форменный» футер с кнопками Назад/Сохранить */
  showFormFooter?: boolean;
}

export default function Footer({
  onFormSave       = () => {},    // noop по умолчанию
  isSaving         = false,
  saveLabel        = "Сохранить",
  showFormFooter   = false,       // скрыт по умолчанию
}: FooterProps) {
  const [subOpen, setSubOpen]       = useState(false);
  const { isAuthenticated, isAdmin } = useAuth();
  const navigate                     = useNavigate();
  const { pathname }                 = useLocation();

  useEffect(() => {
    setSubOpen(false);
  }, [pathname]);

  if (!isAuthenticated) return null;

  // Проверяем, что мы на форме добавления/редактирования
  const isPreparationForm =
    ['/preparations/new'].some(p => pathname.startsWith(p)) ||
    /^\/preparations\/\d+$/.test(pathname);

  const isTeamForm =
    ['/team/new'].some(p => pathname.startsWith(p)) ||
    /^\/team\/\d+$/.test(pathname);

  // Футер формы (Назад + Сохранить)
  if (isAdmin && showFormFooter && (isPreparationForm || isTeamForm)) {
    return (
      <footer
        className="fixed inset-x-0 bottom-0 bg-white flex justify-between items-center px-6 py-4 shadow-inner z-30 min-h-[56px]"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="flex items-center text-blue-600 font-semibold px-4 py-2 rounded hover:bg-blue-50"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" fill="none" viewBox="0 0 24 24">
            <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
              d="M15 19l-7-7 7-7" />
          </svg>
          <span className="ml-2">Назад</span>
        </button>
        <button
          type="button"
          onClick={onFormSave}
          disabled={isSaving}
          className="bg-blue-600 text-white px-6 py-3 rounded-full font-semibold shadow hover:bg-blue-700 transition disabled:bg-blue-300"
        >
          {isSaving ? "Сохраняем..." : saveLabel}
        </button>
      </footer>
    );
  }

  // Футер для списков (Добавить)
  if (isAdmin && ['/preparations', '/team'].includes(pathname)) {
    const to     = pathname === '/preparations' ? '/preparations/new' : '/team/new';
    const backTo = '/main';
    return (
      <footer
        className="fixed inset-x-0 bottom-0 bg-white flex justify-between items-center px-6 py-4 shadow-inner z-30 min-h-[56px]"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <button
          onClick={() => navigate(backTo)}
          className="flex items-center text-blue-600 font-semibold px-4 py-2 rounded hover:bg-blue-50"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" fill="none" viewBox="0 0 24 24">
            <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
              d="M15 19l-7-7 7-7" />
          </svg>
          <span className="ml-2">Назад</span>
        </button>
        <button
          onClick={() => navigate(to)}
          className="bg-blue-600 text-white px-6 py-3 rounded-full font-semibold shadow hover:bg-blue-700 transition"
        >
          Добавить
        </button>
      </footer>
    );
  }

  // Обычный навигационный футер
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
    <footer
      className="fixed inset-x-0 bottom-0 bg-white flex justify-around py-4 shadow-inner min-h-[56px]"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
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
