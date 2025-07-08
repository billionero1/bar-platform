import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../AuthContext';

const api = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

export default function TeamFormPage() {
  const { isAdmin, userId, logout } = useAuth();
  const navigate = useNavigate();
  const { id } = useParams();
  const [toast, setToast] = useState<string>('');
  const [newPassword, setNewPassword] = useState('');

  const isEdit = !!id && id !== 'new';
  const selfId = userId;
  const editingId = id ? +id : null;
  const isSelf = isEdit && editingId === selfId;

  const [form, setForm] = useState({
    name: '',
    surname: '',
    phone: '',
    isAdmin: false,
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isEdit) {
      setLoading(true);
      fetch(`${api}/team/${id}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      })
        .then(res => res.json())
        .then(data => {
          const [name, surname = ''] = data.name.split(' ');
          setForm({
            name,
            surname,
            phone: data.phone,
            isAdmin: data.isAdmin,
          });
        })
        .finally(() => setLoading(false));
    }
  }, [isEdit, id]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    if (isEdit) {
      const res = await fetch(`${api}/team/${id}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: form.name + (form.surname ? ' ' + form.surname : ''),
          phone: form.phone,
          isAdmin: form.isAdmin,
          newPassword: isSelf && newPassword ? newPassword : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setToast(data.error || 'Ошибка обновления');
        setTimeout(() => setToast(''), 2500);
        setLoading(false);
        return;
      }
      setToast('Изменения сохранены!');
      setTimeout(() => {
        setToast('');
        navigate('/team');
      }, 1200);
      setLoading(false);
      return;
    }

    // --- Добавление нового сотрудника ---
    const res = await fetch(`${api}/team/invite`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${localStorage.getItem('token')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: form.name + (form.surname ? ' ' + form.surname : ''),
        phone: form.phone,
        isAdmin: form.isAdmin,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setToast(data.error || 'Ошибка приглашения');
      setTimeout(() => setToast(''), 2500);
      setLoading(false);
      return;
    }
    setToast('Приглашение отправлено!');
    setTimeout(() => {
      setToast('');
      navigate('/team');
    }, 1200);
    setLoading(false);
  }

  return (
    <div className="h-screen flex flex-col p-4">
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-blue-700 text-white px-6 py-2 rounded-xl shadow-xl">
          {toast}
        </div>
      )}
      <form
        className="max-w-lg w-full mx-auto mt-6 space-y-3"
        onSubmit={handleSubmit}
      >
        <h1 className="text-xl font-bold mb-4">{isEdit ? 'Редактирование' : 'Добавление'} сотрудника</h1>
        <div className="flex gap-2">
        <input
            className="border rounded p-2 grow"
            style={{ minWidth: 0 }}
            placeholder="Имя"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            required
        />
        <input
            className="border rounded p-2 grow"
            style={{ minWidth: 0 }}
            placeholder="Фамилия"
            value={form.surname}
            onChange={e => setForm(f => ({ ...f, surname: e.target.value }))}
        />
        </div>

        <input
          className="w-full border rounded p-2"
          placeholder="Телефон"
          value={form.phone}
          onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
          required
        />
        {isSelf && (
            <>
            <div className="text-xs text-gray-400 mt-1">
                Для смены пароля воспользуйтесь полем снизу (минимум 6 символов, оставьте пустым если не собираетесь менять)
            </div>
            <input
                type="password"
                className="w-full border rounded p-2"
                placeholder="Новый пароль"
                value={newPassword}
                minLength={6}
                onChange={e => setNewPassword(e.target.value)}
            />
            </>
        )}
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={form.isAdmin}
            onChange={e => setForm(f => ({ ...f, isAdmin: e.target.checked }))}
          />
          Сделать менеджером (админом)
        </label>
      <button
        type="submit"
        disabled={loading}
        className="btn-primary fixed bottom-[calc(56px+1rem)] left-1/2 -translate-x-1/2"
      >
        {isEdit ? 'Сохранить' : 'Добавить'}
      </button>


      </form>
    </div>
  );
}
