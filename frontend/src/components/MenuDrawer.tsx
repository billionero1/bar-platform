/***********************************************************************
 *  src/components/MenuDrawer.tsx
 *  ────────────────────────────────────────────────────────────────────
 *  Боковое меню-дровер.
 *  • Открывается по кастомному событию `window.dispatchEvent(new Event('open-menu'))`
 *  • Закрывается при клике по подложке / переходе по ссылке / смене роута
 *  • Пункты «Ингредиенты / Заготовки / Команда» видит только администратор
 ***********************************************************************/

import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../AuthContext';

export default function MenuDrawer() {
  const nav               = useNavigate();
  const location          = useLocation();
  const { isAdmin, logout } = useAuth();

  const [open, setOpen] = useState(false);

  /* ——— открытие по событию от Header ——— */
  const handleOpen = useCallback(() => setOpen(true), []);
  useEffect(() => {
    window.addEventListener('open-menu', handleOpen);
    return () => window.removeEventListener('open-menu', handleOpen);
  }, [handleOpen]);

  /* ——— при смене маршрута автоматически закрываем дровер ——— */
  useEffect(() => { setOpen(false); }, [location.pathname]);

  /* ——— helper для переходов ——— */
  const go = (path: string) => () => nav(path);

  return (
    <>
      {/* затемнённая подложка */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        />
      )}

      {/* сам дровер */}
      <aside
        className={`fixed left-0 top-0 z-50 h-full w-64 transform bg-white shadow-lg
                    transition-transform duration-300
                    ${open ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <header className="p-4 text-xl font-semibold">Меню</header>

        <nav className="flex flex-col gap-3 px-4">
          {/* доступно всем */}
          <button onClick={go('/main')} className="text-left hover:text-blue-600">
            Заготовки
          </button>

          {/* пункты только для админа */}
          {isAdmin && (
            <>
              <button onClick={go('/ingredients')}  className="text-left hover:text-blue-600">
                Добавить ингредиенты
              </button>
              <button onClick={go('/preparations')} className="text-left hover:text-blue-600">
                Добавить заготовки
              </button>
              <button onClick={go('/team')}         className="text-left hover:text-blue-600">
                Команда
              </button>
            </>
          )}
        </nav>

        <button
          onClick={() => { logout(); nav('/', { replace: true }); }}
          className="absolute bottom-4 left-4 rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
        >
          Выйти
        </button>
      </aside>
    </>
  );
}
