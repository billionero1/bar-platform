import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import Toast from '../components/Toast';


const api = import.meta.env.VITE_API_URL!;


type Employee = {
  id: number;
  name: string;
  phone: string;
  isAdmin: boolean;
  mustChangePw?: boolean;
  source: 'user' | 'team';
};


export default function TeamPage() {
  const { isAdmin, logout, userId } = useAuth();
  const navigate = useNavigate();

  const [list, setList] = useState<Employee[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showToast, setShowToast] = useState(false);
  const [toastType, setToastType] = useState<'success' | 'error'>('success');

  const [pendingDelete, setPendingDelete] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`${api}/team`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        });
        if (res.status === 401) return logout();
        const data = await res.json();
        if (!cancelled) setList(data);
      } catch {
        if (!cancelled) setList([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [logout]);

  // Фильтрация
  const filtered = list.filter(i =>
    i.name.toLowerCase().includes(search.toLowerCase())
  );

  // Удаление
async function remove(id: number) {
  setPendingDelete(id);
  try {
    const res = await fetch(`${api}/team/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    });

    const data = await res.json();

    if (res.ok) {
      setList(list.filter(e => e.id !== id));
      setToastType('success');
      setShowToast(true);
      setTimeout(() => setShowToast(false), 2000);
    } else {
      console.error('Ошибка удаления:', data);
      setToastType('error');
      setShowToast(true);
      setTimeout(() => setShowToast(false), 2000);
    }
  } catch (err) {
    console.error('Ошибка сети:', err);
    setToastType('error');
    setShowToast(true);
    setTimeout(() => setShowToast(false), 2000);
  } finally {
    setPendingDelete(null);
  }
}


  // Менеджеры всегда вверху
  const sorted = [...filtered].sort((a, b) => {
    if (b.isAdmin !== a.isAdmin) return Number(b.isAdmin) - Number(a.isAdmin);
    return a.name.localeCompare(b.name);
  });

  // Кастомное "confirm" через тост (как у ингредиентов)
  function handleDelete(e: React.MouseEvent, id: number) {
    e.stopPropagation();
    setPendingDelete(id);
  }



  return (
    <div className="h-screen flex flex-col p-4">
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain pb-[calc(56px+1rem)]">
        <input
          type="text"
          placeholder="Поиск сотрудников…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full mb-2 rounded border px-3 py-2"
        />

        {loading ? (
          <p className="text-center text-sm text-gray-500">Загрузка…</p>
        ) : (
          <ul className="space-y-1">
            {sorted.length === 0 ? (
              <li className="text-center text-gray-500 py-4">Ничего не найдено</li>
            ) : (
            sorted.map(e => (
              <li
                key={e.id}
                className={`flex items-center justify-between rounded border p-3 ${
                  e.isAdmin ? 'bg-blue-50' : 'hover:bg-gray-50 cursor-pointer'
                }`}
                onClick={() => e.source === 'team' && navigate(`/team/${e.id}`)}
              >
                <div>
                  <p className="font-medium break-words whitespace-normal">
                    {e.name}
                    {e.isAdmin && (
                      <span className="ml-2 text-xs text-blue-600">(менеджер)</span>
                    )}
                  </p>
                  <p className="text-xs text-gray-500">{e.phone}</p>
                  {e.mustChangePw && (
                    <p className="text-xs text-yellow-600 mt-1">
                      ожидает регистрацию
                    </p>
                  )}
                </div>
                  {isAdmin && e.id !== userId && (
                  <button
                    onClick={ev => {
                      ev.stopPropagation();
                      if (pendingDelete === e.id) {
                        remove(e.id);
                      } else {
                        handleDelete(ev, e.id);
                      }
                    }}
                    disabled={pendingDelete !== null && pendingDelete !== e.id}
                    className={`ml-2 text-xl transition-all ${
                      pendingDelete === e.id ? 'text-yellow-600' : 'text-red-600 hover:text-red-800'
                    }`}
                    title={pendingDelete === e.id ? "Нажмите ещё раз для удаления" : "Удалить"}
                  >
                    {pendingDelete === e.id ? '⚠️' : '🗑'}
                  </button>

                )}

              </li>
            ))

            )}
          </ul>
        )}
      </div>

      {/* Кнопка фиксирована снизу как у Preparations */}
      {isAdmin && (
        <button
          onClick={() => navigate('/team/new')}
          className="btn-primary fixed bottom-[calc(56px+1rem)] left-1/2 -translate-x-1/2"
        >
          + Добавить сотрудника
        </button>


      )}
      <Toast show={showToast} type={toastType} />

    </div>
  );
}
