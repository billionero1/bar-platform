import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import Toast from '../components/Toast';


const api = import.meta.env.VITE_API_URL!;


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
  const [showToast, setShowToast] = useState(false);
  const [toastType, setToastType] = useState<'success' | 'error'>('success');

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



  const remove = async (id: number) => {
    if (!confirm('Удалить заготовку?')) return;
    try {
      await fetch(`${api}/preparations/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      setList(list.filter(p => p.id !== id));
      setToastType('success');
      setShowToast(true);
      setTimeout(() => setShowToast(false), 2000);
    } catch (err) {
      console.error('Ошибка при удалении:', err);
      setToastType('error');
      setShowToast(true);
      setTimeout(() => setShowToast(false), 2000);
    }
  };



return (
  <div className="flex flex-col h-full px-4 pt-2 relative">
    {/* Поиск — зафиксирован */}
    <div className="sticky top-0 z-10 bg-white pb-2">
      <input
        type="text"
        placeholder="Поиск заготовок…"
        value={formName}
        onChange={e => setFormName(e.target.value)}
        className="w-full rounded border px-3 py-2"
      />
    </div>

    {/* Список — прокручиваемый */}
    <div className="flex-1 overflow-y-auto overscroll-contain">
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
                      <p className="text-xs text-gray-400 italic">Себестоимость не рассчитана</p>
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

    <Toast show={showToast} type={toastType} />
  </div>
);


}
