import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';

const api = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

type IngredientEntry = {
  id: number;
  type: 'ingredient' | 'preparation';
  amount: string;
  unit: 'ml' | 'l' | 'g' | 'kg';
};



type Ingredient = {
  id: number;
  name: string;
  packVolume: number | null;
  packCost: number | null;
  costPerUnit: number | null;
  type: 'ingredient' | 'preparation';
};




type Preparation = {
  id: number;
  name: string;
  yieldValue: number;
  yieldUnit: 'ml' | 'l' | 'g' | 'kg';
  ingredients: IngredientEntry[];
  costPerUnit: number | null;
  type: 'preparation';
};







export default function PreparationsPage() {
  const { logout, establishmentId } = useAuth();

  const navigate = useNavigate();

  const [list, setList] = useState<Preparation[]>([]);
  const [formName, setFormName] = useState('');
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [allIngredients, setAllIngredients] = useState<Ingredient[]>([]);

  const filtered = list.filter(i =>
    i.name.toLowerCase().startsWith(formName.toLowerCase())
  );


      // 🔄 Загрузка заготовок + ингредиентов + расчёт себестоимости
      useEffect(() => {
        let cancelled = false;

        const loadData = async () => {
          try {
            const headers = {
              Authorization: `Bearer ${localStorage.getItem('token')}`,
            };

            // Загружаем ингредиенты
            const res1 = await fetch(`${api}/ingredients`, { headers });
            if (!res1.ok) throw new Error('Ошибка загрузки ингредиентов');
            const raw = await res1.json();

            // Загружаем заготовки
            const res2 = await fetch(`${api}/preparations`, { headers });
            if (res2.status === 401) return logout();
            if (!res2.ok) throw new Error('Ошибка загрузки заготовок');
            const prepsRaw = await res2.json();

            if (cancelled) return;

            // Добавляем тип
            const preps = prepsRaw.map((p: Preparation) => ({
              ...p,
              type: 'preparation' as const,
            }));

            // Формируем общий комбинированный список
// Формируем общий комбинированный список
const combined = [...raw];

// Делаем несколько проходов, чтобы всегда гарантированно были посчитаны вложенные заготовки
for (let iter = 0; iter < 3; iter++) {
  for (const prep of preps) {
    // Удаляем старую версию этой заготовки из combined
    const idx = combined.findIndex(i => i.id === prep.id && i.type === 'preparation');
    if (idx !== -1) combined.splice(idx, 1);

    let total = 0;

    for (const ing of prep.ingredients) {
      const base = combined.find(i => i.id === ing.id && i.type === ing.type);
      if (!base) continue;

      const ingAmount = parseFloat(ing.amount);
      if (isNaN(ingAmount) || ingAmount <= 0) continue;

      if (base.type === 'preparation' && base.costPerUnit !== null) {
        total += ingAmount * base.costPerUnit;
      } else if (base.packVolume && base.packCost) {
        total += (ingAmount / base.packVolume) * base.packCost;
      }
    }

    const costPerUnit = prep.yieldValue > 0 ? +(total / prep.yieldValue).toFixed(4) : null;

    combined.push({
      id: prep.id,
      name: prep.name,
      packVolume: prep.yieldValue,
      yieldUnit: prep.yieldUnit,
      packCost: total,
      costPerUnit,
      type: 'preparation' as const,
    });
  }
}



        // Теперь сетим данные
        setAllIngredients(combined);

      const prepsWithCost = preps.map((p: Preparation) => {
        const combinedMatch = combined.find(
          (i: Ingredient) => i.id === p.id && i.type === 'preparation'
        );
        return {
          ...p,
          costPerUnit: combinedMatch?.costPerUnit ?? null
        };
      });

      setList(prepsWithCost);



      } catch (err) {
        console.error('Ошибка загрузки данных:', err);
        if (!cancelled) {
          setList([]);
          setAllIngredients([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadData();
    return () => {
      cancelled = true;
    };
  }, [logout]);





  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 1000);
  }

  const remove = async (id: number) => {
    if (!confirm('Удалить заготовку?')) return;
    await fetch(`${api}/preparations/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    });
    setList(list.filter(p => p.id !== id));
    showToast('Удалено');
  };


  return (
    <>
      {toast && (
        <div className="absolute top-14 inset-x-0 flex justify-center pointer-events-none">
          <div className="max-w-xs w-full bg-white text-black rounded-2xl px-4 py-2 shadow-lg opacity-95">
            <div className="flex items-center space-x-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-green-500" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 00-1.414 0L8 12.586 4.707 9.293a1 1 0 00-1.414 1.414l4 4a1 1 0 001.414 0l8-8a1 1 0 000-1.414z" clipRule="evenodd" />
              </svg>
              <span className="font-medium text-sm">{toast}</span>
            </div>
          </div>
        </div>
      )}

      <div className="h-screen flex flex-col p-4">
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain pb-[calc(56px+1rem)]">
          <input
            type="text"
            placeholder="Поиск заготовок…"
            value={formName}
            onChange={e => setFormName(e.target.value)}
            className="w-full mb-2 rounded border px-3 py-2"
          />

          {loading ? (
            <p className="text-center text-sm text-gray-500">Загрузка…</p>
          ) : (
            <ul className="space-y-1">
              {filtered.length === 0 ? (
                <li className="text-center text-gray-500 py-4">Ничего не найдено</li>
              ) : (
                filtered.map(p => {
                const costPerLiter = p.costPerUnit ?? null;




                  return (
                    <li
                      key={p.id}
                      className="flex items-center justify-between rounded border p-3 cursor-pointer hover:bg-gray-50"
                      onClick={() => navigate(`/preparations/${p.id}`)}
                    >
                      <div>
                        <p className="font-medium break-words whitespace-normal">{p.name}</p>
                      {costPerLiter !== null && !isNaN(costPerLiter) ? (
                        <p className="text-xs text-gray-500">
                          Себестоимость за {p.yieldUnit === 'ml' || p.yieldUnit === 'l' ? 'л' : 'кг'}:{' '}
                          <strong>{costPerLiter.toFixed(2)} ₽</strong>
                        </p>
                      ) : (
                        <p className="text-xs text-gray-400 italic">
                          Себестоимость не рассчитана
                        </p>
                      )}

                      </div>
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          remove(p.id);
                        }}
                      >
                        🗑
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          )}
        </div>


        <button
          onClick={() => navigate('/preparations/new')}
          className="fixed bottom-[calc(56px+1rem)] left-1/2 -translate-x-1/2 bg-blue-600 text-white px-5 py-2 rounded-2xl shadow-lg"
        >
          + Новая заготовка
        </button>

      </div>
    </>
  );
}
