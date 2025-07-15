import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import Toast from '../components/Toast';

const api = import.meta.env.VITE_API_URL!;

export default function InviteComplete() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { login, isAuthenticated } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: '',
    surname: '',
    phone: '',
  });

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastType, setToastType] = useState<'success' | 'error'>('success');

  const passwordsMatch = password === confirm && password.length >= 6;

  // Если уже залогинен — уходим
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/main', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  // Получение данных инвайта
  useEffect(() => {
    if (!token) {
      setError('Ссылка некорректна.');
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      try {
        const res = await fetch(`${api}/team/invite/${token}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Ошибка загрузки');
        setForm({
          name: data.name,
          surname: data.surname,
          phone: data.phone,
        });
      } catch (err: any) {
        console.error(err);
        setError('Приглашение недействительно или уже использовано.');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [token]);

  // Обработка формы
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!passwordsMatch) {
      setToastType('error');
      setShowToast(true);
      return;
    }

    setLoading(true);
    setShowToast(false);

    try {
      const res = await fetch(`${api}/team/invite/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      const data = await res.json();

      if (!res.ok || !data.token) {
        throw new Error(data.error || 'Ошибка регистрации');
      }

      // Логин и переход
      await login(data.token);
      navigate('/main', { replace: true });

    } catch (err: any) {
      console.error(err);
      setToastType('error');
      setShowToast(true);
    } finally {
      setLoading(false);
    }
  };

  // Загрузка
  if (loading) {
    return <div className="p-6 text-center">Загрузка...</div>;
  }

  // Ошибка ссылки
  if (error) {
    return (
      <div className="h-screen flex flex-col items-center justify-center p-6">
        <h1 className="text-2xl font-bold text-red-600 mb-4">Ошибка</h1>
        <p className="mb-4">{error}</p>
        <button
          className="btn-primary"
          onClick={() => navigate('/', { replace: true })}
        >
          На главную
        </button>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col p-4">
      <form
        className="max-w-lg w-full mx-auto mt-6 space-y-3"
        onSubmit={handleSubmit}
      >
        <h1 className="text-xl font-bold mb-4">Завершение регистрации</h1>

        <div className="flex gap-2">
          <input
            className="border rounded p-2 grow bg-gray-100"
            value={form.name}
            disabled
          />
          <input
            className="border rounded p-2 grow bg-gray-100"
            value={form.surname}
            disabled
          />
        </div>

        <input
          className="w-full border rounded p-2 bg-gray-100"
          value={form.phone}
          disabled
        />

        <div className="relative">
          <input
            type={showPass ? 'text' : 'password'}
            className="w-full border rounded p-2 pr-16"
            placeholder="Новый пароль (мин. 6 символов)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />
          <button
            type="button"
            className="absolute right-2 top-2 text-sm text-blue-600"
            onClick={() => setShowPass(!showPass)}
          >
            {showPass ? 'Скрыть' : 'Показать'}
          </button>
        </div>

        <div className="relative">
          <input
            type={showConfirm ? 'text' : 'password'}
            className="w-full border rounded p-2 pr-16"
            placeholder="Повторите пароль"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={6}
          />
          <button
            type="button"
            className="absolute right-2 top-2 text-sm text-blue-600"
            onClick={() => setShowConfirm(!showConfirm)}
          >
            {showConfirm ? 'Скрыть' : 'Показать'}
          </button>
        </div>

        {!passwordsMatch && password && confirm && (
          <div className="text-red-500 text-sm">
            Пароли не совпадают или слишком короткие
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !passwordsMatch}
          className={`btn-primary fixed bottom-[calc(56px+1rem)] left-1/2 -translate-x-1/2 ${
            !passwordsMatch ? 'opacity-50 cursor-not-allowed' : ''
          }`}
        >
          Завершить регистрацию
        </button>
      </form>

      <Toast show={showToast} type={toastType} />
    </div>
  );
}
