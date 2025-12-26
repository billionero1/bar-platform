// src/components/auth/Desktop.AuthBrand.tsx
import React from 'react';
import './AuthBrand.desktop.css';


const AuthBrandDesktop: React.FC = () => {
  return (
    <section className="login-left">
      <div className="login-left-inner">
        <div className="login-brand-kicker">ПРО.СЕРВСИ</div>
        <h1 className="login-brand-title">
          Информационное пространство
          <br />
          сотрудника общепита
        </h1>
        <p className="login-brand-tagline">
          Калькулятор заготовок, технологические карты, документация,
          стандарты и тесты для обучения. Общая лента платформы
          — для обмена опытом и идеями.
        </p>

        <div className="login-brand-meta">
          <span>Заготовки</span>
          <span>Техкарты</span>
          <span>Документация</span>
          <span>Стандарты</span>
          <span>Тесты</span>
          <span>Лента</span>
        </div>
      </div>
    </section>
  );
};

export default AuthBrandDesktop;
