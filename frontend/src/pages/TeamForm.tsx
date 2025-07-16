// src/pages/TeamFormPage.tsx
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import Toast from '../components/Toast';

/* ─── утилиты для телефона ────────────────────────────── */
/* ─── утилиты для телефона ────────────────────────────── */
const normalize = (v: string) => v.replace(/\D/g, '').replace(/^8/, '7');

const format = (raw: string) => {
  let d = normalize(raw);

  if (d.length === 0) return '';

  if (d[0] !== '7') d = '7' + d;

  let out = '+7 ';
  if (d.length > 1) out += d.slice(1, 4);
  if (d.length > 4) out += ' ' + d.slice(4, 7);
  if (d.length > 7) out += ' ' + d.slice(7, 9);
  if (d.length > 9) out += ' ' + d.slice(9, 11);
  return out.trim();
};

/* проверка валидности телефона */
const isValidPhone = (raw: string) => {
  const norm = normalize(raw);
  return norm.length === 11 && norm.startsWith('7');
};



const api = import.meta.env.VITE_API_URL!;

export default function TeamFormPage() {
  const { userId } = useAuth();
  const navigate = useNavigate();
  const { id } = useParams();

  const [showToast, setShowToast] = useState(false);
  const [toastType, setToastType] = useState<'success' | 'error'>('success');

  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const isEdit = !!id && id !== 'new';
  const selfId = userId;
  const isSelf = isEdit && +id === selfId;

  const [form, setForm] = useState({
    name: '',
    surname: '',
    phone: '',
    isAdmin: false,
  });

  const [inviteLink, setInviteLink] = useState('');

  useEffect(() => {
    if (isEdit) {
      setLoading(true);
      fetch(`${api}/team/${id}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      })
        .then(res => res.json())
        .then(data => {
          setForm({
            name: data.name,
            surname: data.surname ?? '',
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

    // Проверка телефона перед отправкой
    if (!isValidPhone(form.phone)) {
      setToastType('error');
      setShowToast(true);
      setLoading(false);
      return;
    }

    const cleanPhone = normalize(form.phone);

    if (isEdit) {
      const res = await fetch(`${api}/team/${id}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: form.name,
          surname: form.surname,
          phone: cleanPhone,
          isAdmin: form.isAdmin,
          newPassword: isSelf && newPassword ? newPassword : undefined,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        showError();
        setLoading(false);
        return;
      }

      showSuccess();
      setLoading(false);
      return;
    }

    // --- Добавление нового сотрудника (инвайт) ---
    const res = await fetch(`${api}/team/invite`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${localStorage.getItem('token')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: form.name,
        surname: form.surname,
        phone: cleanPhone,
        isAdmin: form.isAdmin,
      }),
    });
    const data = await res.json();

    if (!res.ok) {
      showError();
      setLoading(false);
      return;
    }

    // Получили inviteToken и формируем ссылку
    const inviteUrl = `${window.location.origin}/invite/${data.inviteToken}`;
    setInviteLink(inviteUrl);
    setLoading(false);
  }



  function showError() {
    setToastType('error');
    setShowToast(true);
    setTimeout(() => setShowToast(false), 2000);
  }

  function showSuccess(cb?: () => void) {
    setToastType('success');
    setShowToast(true);
    setTimeout(() => {
      setShowToast(false);
      cb?.();
    }, 1500);
  }

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setToastType('success');
      setShowToast(true);
      setTimeout(() => setShowToast(false), 2000);
    } catch (err) {
      console.error('Ошибка копирования:', err);
      showError();
    }
  }

  function handleShareLink() {
    if (navigator.share) {
      navigator
        .share({
          title: 'Приглашение в команду',
          text: 'Пройди регистрацию по ссылке:',
          url: inviteLink,

        })
        .catch(err => console.error('Ошибка share:', err));
    } else {
      alert('Ваш браузер не поддерживает функцию Share');
    }
  }

  const phoneIsValid = isValidPhone(form.phone);
  const canSubmit = !loading && form.name.trim() && phoneIsValid;


  return (
    <div className="h-screen flex flex-col p-4">
      <form
        id="team-form"
        className="max-w-lg w-full mx-auto mt-6 space-y-3"
        onSubmit={handleSubmit}
      >

        <h1 className="text-xl font-bold mb-4">{isEdit ? 'Редактирование' : 'Добавление'} сотрудника</h1>
        
        <div className="flex gap-2">
          <input
            className="border rounded p-2 w-1/2"
            placeholder="Имя"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            required
          />
          <input
            className="border rounded p-2 w-1/2"
            placeholder="Фамилия"
            value={form.surname}
            onChange={e => setForm(f => ({ ...f, surname: e.target.value }))}
          />
        </div>


        <input
          className="w-full border rounded p-2"
          placeholder="Телефон"
          value={form.phone}
          onChange={e => setForm(f => ({ ...f, phone: format(e.target.value) }))}

          required
        />

        {!phoneIsValid && form.phone && (
          <div className="text-red-500 text-sm">
            Введите корректный телефон в формате +7 999 999 99 99
          </div>
        )}



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


      </form>

      {inviteLink && (
        <div className="max-w-lg w-full mx-auto mt-6 border rounded p-4 bg-gray-50 shadow">
          <h2 className="text-lg font-bold mb-2">Приглашение успешно создано!</h2>
          <p className="mb-2 break-words"><strong>Ссылка для регистрации:</strong> {inviteLink}</p>
          <div className="flex gap-2">
            <button
              onClick={handleCopyLink}
              className="flex-1 rounded bg-blue-600 text-white py-2"
            >
              Скопировать ссылку
            </button>
            <button
              onClick={handleShareLink}
              className="flex-1 rounded bg-green-600 text-white py-2"
            >
              Поделиться
            </button>
          </div>
        </div>
      )}

      <Toast show={showToast} type={toastType} />
    </div>
  );
}
