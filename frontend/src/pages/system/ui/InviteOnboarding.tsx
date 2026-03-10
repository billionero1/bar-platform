import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { useAuth } from '../../../AuthContext';
import { rusify } from '../../../shared/lib';
import { acceptPublicInvite, getPublicInvite, type PublicInviteInfo } from '../../workspace/ui/workspace.api';

import '../../../features/auth/ui/_shared/auth.shared.css';
import './InviteOnboarding.css';

function validatePassword(password: string): string | null {
  if (password.length < 8) return 'Пароль должен содержать минимум 8 символов';
  if (!/[A-Z]/.test(password)) return 'Пароль должен содержать хотя бы одну заглавную букву';
  if (!/[a-z]/.test(password)) return 'Пароль должен содержать хотя бы одну строчную букву';
  if (!/[0-9]/.test(password)) return 'Пароль должен содержать хотя бы одну цифру';
  return null;
}

const InviteOnboarding: React.FC = () => {
  const { token = '' } = useParams<{ token: string }>();
  const nav = useNavigate();
  const { hydrate } = useAuth();

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [invite, setInvite] = useState<PublicInviteInfo | null>(null);

  const [name, setName] = useState('');
  const [surname, setSurname] = useState('');
  const [pass1, setPass1] = useState('');
  const [pass2, setPass2] = useState('');
  const [show1, setShow1] = useState(false);
  const [show2, setShow2] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadInvite = async () => {
      if (!token) {
        setErr('Некорректная ссылка приглашения.');
        setLoading(false);
        return;
      }

      setLoading(true);
      setErr(null);
      try {
        const info = await getPublicInvite(token);
        if (cancelled) return;
        setInvite(info);
        setName(info.invitedName || '');
        setSurname(info.invitedSurname || '');
      } catch (e) {
        if (cancelled) return;
        setInvite(null);
        setErr(rusify(e));
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadInvite();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const inviteRole = invite?.role === 'manager' ? 'Менеджер' : 'Сотрудник';
  const expiresAt = useMemo(() => {
    if (!invite?.expiresAt) return '—';
    return new Date(invite.expiresAt).toLocaleString('ru-RU');
  }, [invite?.expiresAt]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !invite) {
      setErr('Приглашение недоступно.');
      return;
    }

    const cleanName = name.trim();
    const cleanSurname = surname.trim();

    if (!cleanName) {
      setErr('Укажи имя сотрудника.');
      return;
    }

    if (pass1 !== pass2) {
      setErr('Пароли не совпадают.');
      return;
    }

    const passwordError = validatePassword(pass1);
    if (passwordError) {
      setErr(passwordError);
      return;
    }

    setBusy(true);
    setErr(null);
    try {
      const session = await acceptPublicInvite(token, {
        name: cleanName,
        surname: cleanSurname || undefined,
        password: pass1,
      });

      if (!session?.user) {
        throw new Error('internal_error');
      }

      hydrate({ user: session.user, access: session.access });
      nav('/workspace', { replace: true });
    } catch (e) {
      setErr(rusify(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-page auth-page--center">
      <div className="auth-page-main">
        <header className="login-header invite-head">
          <h2>Приглашение в команду</h2>
          <p className="login-header-sub">Заверши onboarding и создай пароль для входа в рабочее пространство.</p>
        </header>

        {loading ? (
          <div className="invite-muted">Проверяю приглашение…</div>
        ) : invite ? (
          <form className="login-form invite-form" onSubmit={onSubmit}>
            <div className="invite-meta">
              <div>
                <span>Заведение</span>
                <strong>{invite.establishmentName}</strong>
              </div>
              <div>
                <span>Роль</span>
                <strong>{inviteRole}</strong>
              </div>
              <div>
                <span>Телефон</span>
                <strong>{invite.invitedPhoneMasked || '—'}</strong>
              </div>
              <div>
                <span>Действительно до</span>
                <strong>{expiresAt}</strong>
              </div>
            </div>

            <label>Имя</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Имя" />

            <label>Фамилия</label>
            <input value={surname} onChange={(e) => setSurname(e.target.value)} placeholder="Фамилия (необязательно)" />

            <label>Пароль</label>
            <div className="password-field">
              <input type={show1 ? 'text' : 'password'} value={pass1} onChange={(e) => setPass1(e.target.value)} />
              <button
                type="button"
                className="eye"
                onClick={() => setShow1((prev) => !prev)}
                aria-label="Показать пароль"
              />
            </div>

            <label>Повторите пароль</label>
            <div className="password-field">
              <input type={show2 ? 'text' : 'password'} value={pass2} onChange={(e) => setPass2(e.target.value)} />
              <button
                type="button"
                className="eye"
                onClick={() => setShow2((prev) => !prev)}
                aria-label="Показать пароль"
              />
            </div>

            {err ? <div className="error">{err}</div> : null}

            <button type="submit" className="login-submit" disabled={busy}>
              {busy ? 'Завершаю onboarding…' : 'Принять приглашение'}
            </button>
          </form>
        ) : (
          <div className="invite-empty">
            <div className="invite-muted">{err || 'Приглашение недоступно.'}</div>
            <button type="button" className="login-submit" onClick={() => nav('/login', { replace: true })}>
              К странице входа
            </button>
          </div>
        )}
      </div>

      <div className="auth-page-footer">
        <div className="login-links-row">
          <Link className="link-text" to="/login">
            Уже есть аккаунт? Войти
          </Link>
        </div>
      </div>
    </div>
  );
};

export default InviteOnboarding;
