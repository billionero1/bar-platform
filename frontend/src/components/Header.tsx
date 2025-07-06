import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';

const TITLES: Record<string, string> = {
  '/main':         'Заготовки',
  '/ingredients':  'Ингредиенты',
  '/preparations': 'Заготовки',
  '/team':         'Команда',
  '/calc':         'Расчёт',
};

// Только те, где реально нужен бургер
const ROOT_PATHS = ['/main', '/ingredients', '/preparations', '/team'] as const;

export default function Header() {
  const { isAuthenticated } = useAuth();
  const nav                 = useNavigate();
  const { pathname }        = useLocation();

  if (
    !isAuthenticated ||
    pathname === '/' ||
    pathname === '/register'
  ) {
    return null;
  }

  // Главная страница заготовок (строго /main)
  const isMain = pathname === '/main';

  // Остальные root-paths
  const isRoot = ROOT_PATHS.includes(pathname as (typeof ROOT_PATHS)[number]);

  // Калькулятор заготовки (страница /main/:id)
  const isMainCalcPage = /^\/main\/\d+/.test(pathname);

  // Заголовок
  let title = '';
  if (isMainCalcPage) {
    title = 'Калькулятор';
  } else if (
    Object.keys(TITLES).find(key => pathname.startsWith(key))
  ) {
    title = TITLES[Object.keys(TITLES).find(key => pathname.startsWith(key)) as string];
  }

  return (
    <header
      className="
        fixed left-0 right-0 top-0 z-30 flex h-14 items-center
        bg-white px-4 shadow-sm
      "
    >
      {/* Меню или стрелка назад */}
      {isMain || isRoot ? (
        // Только на /main и других root — бургер
        <button
          className="text-3xl font-extrabold"
          onClick={() => window.dispatchEvent(new Event('open-menu'))}
          aria-label="Меню"
        >☰</button>
      ) : isMainCalcPage ? (
        // На /main/:id — назад к /main
        <button
          className="text-2xl"
          onClick={() => nav('/main', { replace: true })}
          aria-label="Назад"
        >←</button>
      ) : (
        // На всех других внутренних страницах — назад к своему root разделу
        <button
          className="text-2xl"
          onClick={() => {
            const parentPath = ROOT_PATHS.find(root => pathname.startsWith(root));
            if (parentPath) nav(parentPath, { replace: true });
            else nav(-1);
          }}
          aria-label="Назад"
        >←</button>
      )}

      {/* Заголовок по центру */}
      <h1 className="mx-auto max-w-[70%] truncate text-lg font-semibold">
        {title}
      </h1>
      {/* невидимка для выравнивания */}
      <span className="opacity-0">{isMain || isRoot ? '☰' : '←'}</span>
    </header>
  );
}
