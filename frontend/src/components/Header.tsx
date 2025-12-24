import React from 'react';
import { useTheme } from '../ThemeContext';

export default function Header() {
  const { theme, toggleTheme } = useTheme();

  const isDark = theme === 'dark';

  return (
    <div className="app-header">
      <div className="app-header__top">
        <div className="app-header__title">ПРО.СЕРВИС</div>

        <button
          type="button"
          className="app-header__theme-toggle"
          onClick={toggleTheme}
          aria-label={isDark ? 'Включить светлую тему' : 'Включить тёмную тему'}
        >
          {/* простые иконки-тогглы, позже можно заменить на свои */}
          <span className="app-header__theme-icon">
            {isDark ? '☾' : '☀️'}
          </span>
        </button>
      </div>

      <div className="app-header__search">
        <input
          type="search"
          className="app-header__search-input"
          placeholder="Быстрый поиск по сервису…"
        />
      </div>
    </div>
  );
}
