// src/components/Footer.tsx
import React, { useContext } from 'react';
import { AuthContext } from '../../src/AuthContext';

type MobileTab = 'home' | 'feed' | 'profile';

interface FooterProps {
  activeTab: MobileTab;
  onChangeTab: (tab: MobileTab) => void;
  workspaceKind: 'personal' | 'establishment' | null;
}

const Footer: React.FC<FooterProps> = ({
  activeTab,
  onChangeTab,
  workspaceKind,
}) => {
  const { user } = useContext(AuthContext);

  const initials =
    user?.name?.trim()
      .split(/\s+/)
      .map((p) => p[0])
      .join('')
      .slice(0, 2) ||
    (user?.phone ? user.phone.slice(-2) : 'A');

  const feedLabel =
    workspaceKind === 'establishment' ? 'Лента бара' : 'Лента';

  return (
    <div className="app-footer">
      <div className="app-footer__content">
        <nav
          className="app-footer-nav"
          aria-label="Основная навигация"
        >
          <button
            type="button"
            className={
              'app-footer-nav__item' +
              (activeTab === 'home'
                ? ' app-footer-nav__item--active'
                : '')
            }
            onClick={() => onChangeTab('home')}
          >
            <span className="app-footer-nav__icon app-footer-nav__icon--home" />
            <span className="app-footer-nav__label">Главная</span>
          </button>

          <button
            type="button"
            className={
              'app-footer-nav__item' +
              (activeTab === 'feed'
                ? ' app-footer-nav__item--active'
                : '')
            }
            onClick={() => onChangeTab('feed')}
          >
            <span className="app-footer-nav__icon app-footer-nav__icon--feed" />
            <span className="app-footer-nav__label">
              {feedLabel}
            </span>
          </button>

          <button
            type="button"
            className={
              'app-footer-nav__item app-footer-nav__item--profile' +
              (activeTab === 'profile'
                ? ' app-footer-nav__item--active'
                : '')
            }
            onClick={() => onChangeTab('profile')}
          >
            <span className="app-footer-nav__avatar">
              {initials}
            </span>
            <span className="app-footer-nav__label">Профиль</span>
          </button>
        </nav>
      </div>
    </div>
  );
};

export default Footer;
