// src/pages/register/Register.desktop.tsx

import React from 'react';

import { useRegisterFlow } from '../../hooks/register/useRegisterFlow';



const RegisterDesktop: React.FC = () => {

  const {

    step,

    name,

    phone,

    code,

    pass1,

    pass2,

    show1,

    show2,

    err,

    busy,

    phoneAlreadyRegistered,

    canResend,

    leftSec,

    passwordsMismatch,

    canProceedPasswordStep,

    canSubmitPhone,

    handleNameChange,

    onPhoneChange,

    onPhoneKeyDown,

    handleCodeChange,

    setPass1,

    setPass2,

    toggleShow1,

    toggleShow2,

    handleBackClick,

    nextPhone,

    nextCode,

    nextPassword,

    resendCode,

    goLogin,

    goLoginWithPhone,

  } = useRegisterFlow();



  return (

    <div className="auth-desktop-page">

      <div className="auth-desktop-card">

        <header className="auth-desktop-header auth-desktop-header--with-back">

          <div className="auth-desktop-header-top">

            <button

              type="button"

              className="auth-desktop-header-back"

              aria-label="Назад"

              onClick={handleBackClick}

            />

            <h2>Регистрация</h2>

          </div>

          <p className="auth-desktop-header-sub">

            {step === 'phone' &&

              'Укажите имя и номер телефона, мы отправим код подтверждения.'}

            {step === 'code' &&

              'Введите код из сообщения, чтобы подтвердить номер.'}

            {step === 'password' &&

              'Придумайте пароль для входа в сервис.'}

          </p>

        </header>



        {/* Шаг 1 — имя и телефон */}

        {step === 'phone' && (

          <form className="auth-desktop-form" onSubmit={nextPhone}>

            <label>Имя</label>

            <input

              value={name}

              onChange={(e) => handleNameChange(e.target.value)}

              placeholder="Как к вам обращаться"

            />



            <label>Телефон</label>

            <input

              value={phone}

              onChange={(e) => onPhoneChange(e.target.value)}

              onKeyDown={onPhoneKeyDown}

              inputMode="tel"

              placeholder="+7 (___) ___ __ __"

            />



            {phoneAlreadyRegistered && (

              <div className="muted" style={{ marginTop: 8 }}>

                <button

                  type="button"

                  className="link-text"

                  onClick={goLoginWithPhone}

                >

                  Войти с этим номером

                </button>

              </div>

            )}



            {err && <div className="error">{err}</div>}



            <button

              type="submit"

              className="auth-desktop-submit"

              disabled={!canSubmitPhone}

            >

              Продолжить

            </button>

          </form>

        )}



        {/* Шаг 2 — код подтверждения */}

        {step === 'code' && (

          <form className="auth-desktop-form" onSubmit={nextCode}>

            <label>Код из сообщения</label>

            <input

              value={code}

              onChange={(e) => handleCodeChange(e.target.value)}

              inputMode="numeric"

              maxLength={4}

            />



            {err && <div className="error">{err}</div>}



            <button

              type="submit"

              className="auth-desktop-submit"

              disabled={busy || code.length !== 4}

            >

              Подтвердить

            </button>



            <div className="muted muted-center" style={{ marginTop: 8 }}>

              {canResend ? (

                <button

                  type="button"

                  className="link-text"

                  onClick={resendCode}

                >

                  Отправить код ещё раз

                </button>

              ) : (

                <>Можно отправить код ещё раз через {leftSec} с</>

              )}

            </div>

          </form>

        )}



        {/* Шаг 3 — пароль */}

        {step === 'password' && (

          <form className="auth-desktop-form" onSubmit={nextPassword}>

            <label>Пароль</label>

            <div className="password-field">

              <input

                type={show1 ? 'text' : 'password'}

                value={pass1}

                onChange={(e) => setPass1(e.target.value)}

              />

              <button

                type="button"

                className="eye"

                onClick={toggleShow1}

                aria-label="Показать пароль"

              />

            </div>



            <label>Повторите пароль</label>

            <div className="password-field">

              <input

                type={show2 ? 'text' : 'password'}

                value={pass2}

                onChange={(e) => setPass2(e.target.value)}

              />

              <button

                type="button"

                className="eye"

                onClick={toggleShow2}

                aria-label="Показать пароль"

              />

            </div>



            {passwordsMismatch && (

              <div className="error">Пароли не совпадают</div>

            )}

            {err && <div className="error">{err}</div>}



            <button

              type="submit"

              className="auth-desktop-submit"

              disabled={!canProceedPasswordStep}

            >

              Зарегистрироваться

            </button>

          </form>

        )}

      </div>



      <div className="auth-desktop-footer">

        <div className="auth-desktop-links-row">

          <button

            type="button"

            className="link-text"

            onClick={goLogin}

          >

            Уже есть аккаунт? Войти

          </button>

        </div>

      </div>

    </div>

  );

};



export default RegisterDesktop;