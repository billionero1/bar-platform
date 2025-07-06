import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';

// Типы такие же, как были
type Ingredient = {
  id: number;
  name: string;
  packVolume: number | null;
  volumeUnit: 'ml' | 'l' | 'g' | 'kg' | null;
  packCost: number | null;
  type: 'ingredient' | 'preparation';
};

type IngredientEntry = {
  id: number;
  type: 'ingredient' | 'preparation';
  name: string;
  amount: string;
};

type Preparation = {
  id: number;
  name: string;
  yieldValue: number;
  yieldUnit: 'ml' | 'l' | 'g' | 'kg';
  ingredients: IngredientEntry[];
  altVolume?: number | null;
};

const api = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

export default function MainPage() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  // Данные
  const [allPreparations, setAllPreparations] = useState<Preparation[]>([]);
  const [allIngredients, setAllIngredients] = useState<Ingredient[]>([]);
  const [search, setSearch] = useState('');

  // Загрузка всех заготовок и ингредиентов
  useEffect(() => {
    const fetchAll = async () => {
      try {
        const headers = { Authorization: `Bearer ${localStorage.getItem('token')}` };
        const [res1, res2] = await Promise.all([
          fetch(`${api}/ingredients`, { headers }),
          fetch(`${api}/preparations`, { headers })
        ]);
        if (res1.status === 401 || res2.status === 401) return logout();
        if (!res1.ok || !res2.ok) throw new Error('Ошибка загрузки');
        setAllIngredients(await res1.json());
        setAllPreparations(await res2.json());
      } catch {
        setAllPreparations([]);
        setAllIngredients([]);
      }
    };
    fetchAll();
  }, [logout]);

  // Фильтр по поиску
  const filtered = allPreparations.filter(i =>
    i.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="h-screen flex flex-col p-4 bg-white">
      <h1 className="text-xl font-semibold mb-3">Выбери заготовку для расчёта</h1>
      <input
        type="text"
        placeholder="Поиск заготовок"
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full mb-2 rounded border px-3 py-2"
      />
      <ul className="space-y-1">
        {filtered.length === 0 ? (
          <li className="text-gray-400 text-sm">Ничего не найдено</li>
        ) : (
          filtered.map(prep => (
            <li
              key={prep.id}
              className="rounded border p-3 cursor-pointer hover:bg-gray-50"
              onClick={() => navigate(`/main/${prep.id}`)}
            >
              <span className="font-medium">{prep.name}</span>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
