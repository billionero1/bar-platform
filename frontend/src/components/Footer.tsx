// src/components/Footer.tsx
import React from 'react';
import {
  HomeIcon,
  BookOpenIcon,
  PlusCircleIcon,
  UsersIcon,
  SettingsIcon,
  UserCogIcon,
  GraduationCapIcon,
} from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../AuthContext';

export default function Footer() {
  const { isAuthenticated, isAdmin } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  if (!isAuthenticated) return null;

  // Don't show footer on form pages
  const isFormPage = [
    '/preparations/new',
    '/team/new',
  ].some(p => pathname.startsWith(p)) ||
    /^\/preparations\/\d+$/.test(pathname) ||
    /^\/team\/\d+$/.test(pathname);
  if (isFormPage) return null;

  const navItems = [];

  // 1. Home
  navItems.push({
    icon: HomeIcon,
    to: '/main',
    active: pathname === '/main',
    onClick: () => {
      if (pathname === '/main') window.location.reload();
      else navigate('/main');
    },
  });

  // 2. Plus for admin, Gear for staff
  if (isAdmin) {
    navItems.push({
      icon: PlusCircleIcon,
      special: true,
      hasSub: true,
      active: ['/ingredients', '/preparations', '/team'].some(p => pathname.startsWith(p)),
      sub: [
        { label: 'Ингредиенты', to: '/ingredients' },
        { label: 'Заготовки', to: '/preparations' },
        { label: 'Команда', to: '/team' },
      ],
    });
  } else {
    navItems.push({
      icon: SettingsIcon,
      to: '/settings',
      active: pathname === '/settings',
    });
  }

  // 3. TTK (book)
  navItems.push({
    icon: BookOpenIcon,
    to: '/ttk',
    active: pathname === '/ttk',
  });

  // 4. Learn (graduation cap)
  navItems.push({
    icon: GraduationCapIcon,
    to: '/learn',
    active: pathname === '/learn',
  });

  // 5. Team
  navItems.push({
    icon: UsersIcon,
    to: '/team',
    active: pathname.startsWith('/team'),
  });

  return (
    <footer className="fixed inset-x-0 bottom-0 bg-white flex justify-around py-2 shadow-inner">
      {navItems.map((item, i) => (
        <div key={i} className="relative group">
          <button
            onClick={item.onClick ?? (() => item.to && navigate(item.to))}
            className={
              item.special
                ? 'flex items-center justify-center bg-blue-600 text-white p-2 rounded-full'
                : `flex items-center justify-center ${item.active ? 'text-blue-600' : 'text-gray-500'}`
            }
          >
            <item.icon size={item.special ? 32 : 24} />
          </button>

          {/* Submenu for admin plus */}
          {item.hasSub && (
            <div className="absolute bottom-full mb-2 hidden group-hover:flex flex-col bg-white p-2 rounded shadow">
              {item.sub!.map((subItem, idx) => (
                <button
                  key={idx}
                  className="text-sm px-2 py-1"
                  onClick={() => navigate(subItem.to)}
                >
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
