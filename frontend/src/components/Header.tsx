import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { X, SettingsIcon, LogOut } from 'lucide-react';

export default function Header() {
  const { establishmentName, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const isFormPage =
    ['/preparations/new', '/team/new'].some(p => pathname.startsWith(p)) ||
    /^\/preparations\/\d+$/.test(pathname) ||
    /^\/team\/\d+$/.test(pathname);

  const isProfilePage = pathname === '/profile';

  return (
    <header className="fixed inset-x-0 top-0 z-30 flex h-14 items-center justify-between bg-white px-4 shadow-sm">
      <div className="flex items-center">
        {isFormPage ? (
          <button
            onClick={() => navigate(-1)}
            className="p-2"
            aria-label="Назад"
          >
            <X size={24} />
          </button>
        ) : (
          <button
            onClick={() => navigate('/main')}
            className="font-semibold text-lg"
            aria-label="Главная"
          >
            {establishmentName}
          </button>
        )}
      </div>

      <div>
        {isProfilePage ? (
          <button
            onClick={() => {
              logout();
              navigate('/', { replace: true });
            }}
            className="p-2"
            aria-label="Выйти"
          >
            <LogOut size={24} />
          </button>
        ) : (
          <button
            onClick={() => navigate('/settings')}
            className="p-2"
            aria-label="Настройки"
          >
            <SettingsIcon size={24} />
          </button>
        )}
      </div>
    </header>
  );
}
