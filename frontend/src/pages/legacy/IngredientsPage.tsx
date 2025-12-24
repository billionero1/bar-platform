/**************************************************************************
 *  IngredientsPage
 **************************************************************************/
import { useEffect, useState } from 'react';
import { useAuth }             from '../AuthContext';

const api = import.meta.env.VITE_API_URL!;


/* ---------- тип, который реально использует UI ---------- */
type Ingredient = {
  id         : number;
  name       : string;
  packVolume : number | null;
  packCost   : number | null;
  establishment_id?: number;
};



/* ---------- helper: ответ сервера → формат UI ----------- */
function apiToState(row: any): Ingredient {
  return {
    id  : row.id,
    name: row.name,

    /* 1.  Проверяем СНАЧАЛА camelCase, затем snake_case,
           чтобы работало и для старых, и для новых бэков. */
    packVolume:
      row.packVolume != null ? Number(row.packVolume)
    : row.pack_volume != null ? Number(row.pack_volume)
    : null,

    packCost:
      row.packCost != null ? Number(row.packCost)
    : row.pack_cost != null ? Number(row.pack_cost)
    : null,


  };
}


export default function IngredientsPage() {
  const { logout, establishmentId } = useAuth();
  const [list, setList]     = useState<Ingredient[]>([]);
  const [loading, setLoad ] = useState(true);





  /* ---- toast ------------------------------------------------ */
  const [toast, setToast] = useState<string | null>(null);
  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 1000);   // 1 секунда
  }


/* ------------ запрос списка при монтировании ---------- */
useEffect(() => {
  let cancelled = false;               // на случай быстрого unmount

  async function loadIngredients() {
    try {
      const res = await fetch(`${api}/ingredients`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });

      if (res.status === 401) { logout(); return; }
      if (!res.ok)            { throw new Error(); }

      const raw = await res.json();     // ⇢ массив строк БД
      if (!cancelled) {
        setList(
          raw
            .filter((i: any) => i.type === 'ingredient') // 👈 фильтруем
            .map(apiToState)
        );

      }
    } catch {
      /* сеть «упала» — оставляем список пустым */  
    } finally {
      if (!cancelled) setLoad(false);   // убираем «Загрузка…»
    }
  }

  loadIngredients();
  return () => { cancelled = true; };   // чистим, если компонент размонтирован
}, [logout]);


  /* ------------ локальное состояние формы --------------- */
const [form, setForm] = useState({
  name: '',
  packVolume: '',
  packCost: '',
  id: null as number | null,
});

      // отфильтрованный список и лог для проверки
  const filtered = list.filter(i =>
    i.name.toLowerCase().startsWith(form.name.toLowerCase())
  );


  console.log('SEARCH =', form.name, '→ filtered:', filtered.map(i => i.name));

  const reset = () =>
    setForm({ name:'', packVolume:'', packCost:'', id:null });
  /* === ВАЛИДАЦИЯ ================================================
  допустимы: пустая строка  ИЛИ положительное число без ведущего 0 */
  const isCost  = (s: string) => /^[1-9]\d*(\.\d+)?$/.test(s);                // 1, 10.5 …
  const isVol = (s: string) => /^(0(\.\d*)?|[1-9]\d*(\.\d+)?)$/.test(s);

  const volOk  = !form.packVolume || isVol (form.packVolume);
  const costOk = !form.packCost   || isCost(form.packCost);



  /* ——— нормализация ввода ———————————————————————————— */
  function sanitize(value: string) {
    // меняем запятую на точку, убираем всё, что не цифры и не точка
    let v = value.replace(',', '.').replace(/[^0-9.]/g, '');
    // оставляем только первую точку
    const parts = v.split('.');
    if (parts.length > 2) v = parts[0] + '.' + parts.slice(1).join('');
    return v;
  }

  /* Цена: без ведущего нуля (кроме «0.») */
  function handleCost(e: React.ChangeEvent<HTMLInputElement>) {
    let v = sanitize(e.target.value);
    if (/^0\d/.test(v)) v = v.replace(/^0+/, '');        // 03 → 3
    setForm({ ...form, packCost: v });
  }

  function handleVolume(e: React.ChangeEvent<HTMLInputElement>) {
    let v = sanitize(e.target.value);

    // допускаем «0.» как промежуточное (не превращаем в «0»)
    if (v === '0.') {
      setForm({ ...form, packVolume: v });
      return;
    }

    setForm({ ...form, packVolume: v });
  }



  /* ------------ обработка submit ------------------------ */
  const save = async () => {
    if (!form.name.trim() || !volOk || !costOk) {
      alert('Проверьте объём и цену: допустимы только положительные числа');
      return;
    }


    const payload = {
      name           : form.name.trim(),
      packVolume     : form.packVolume ? +form.packVolume : null,
      packCost       : form.packCost   ? +form.packCost   : null,
      establishmentId: establishmentId,
    };

    const method = form.id ? 'PUT' : 'POST';
    const url    = form.id ? `${api}/ingredients/${form.id}` : `${api}/ingredients`;

    const r = await fetch(url, {
      method,
      headers : {
        'Content-Type' : 'application/json',
        Authorization  : `Bearer ${localStorage.getItem('token')}`,
      },
      body: JSON.stringify(payload),
    });

    if (!r.ok) return alert('Ошибка!');

    /* обновляем локальный список */
    if (method === 'POST') {
      const { id } = await r.json();

      // Защита от дублирования
      if (!list.some(i => i.id === id)) {
        setList([...list, { ...payload, id } as Ingredient]);
      }
    } else {
      // Обновляем существующий элемент по id
      setList(list.map(i =>
        i.id === form.id ? { ...payload, id: i.id } as Ingredient : i
      ));
    }

    showToast(form.id ? 'Сохранено' : 'Добавлено');

    reset();
  };

  /* ------------ удаление -------------------------------- */
  const remove = async (id: number) => {
    if (!confirm('Удалить ингредиент?')) return;
    await fetch(`${api}/ingredients/${id}`, {
      method  : 'DELETE',
      headers : { Authorization: `Bearer ${localStorage.getItem('token')}` },
    });
    setList(list.filter(i => i.id !== id));
    showToast('Удалено');

  };

  /* ------------ расчёт цены за базовую единицу ---------- */
const unitPrice = (i: Ingredient) => {
  if (!i.packVolume || !i.packCost) return '';
  return (i.packCost / i.packVolume).toFixed(2); // уже в литрах или кг
};



/* ------------------------------------------------------------------ */
return (
  <>
    {toast && (
      <div className="absolute top-22 inset-x-0 flex justify-center pointer-events-none">
        <div className="max-w-xs w-full bg-white text-black rounded-2xl px-4 py-2 shadow-lg opacity-95">
          <div className="flex items-center space-x-2">
            {/* зелёная галочка */}
            <svg xmlns="http://www.w3.org/2000/svg"
                className="w-5 h-5 text-green-500 flex-shrink-0"
                viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 00-1.414 0L8 12.586 4.707 9.293a1 
                      1 0 00-1.414 1.414l4 4a1 1 0 
                      001.414 0l8-8a1 1 0 000-1.414z"
                    clipRule="evenodd" />
            </svg>
            {/* текст уведомления */}
            <span className="font-medium text-sm">
              {toast}
            </span>
          </div>
        </div>
      </div>
    )}


    <div className="h-screen flex flex-col p-4">
      {/* ---------- форма -------------------------------------------- */}
      <div className="mb-6 space-y-2 rounded border p-4">
        <input
          type="text"
          maxLength={30}
          placeholder="Название *"
          value={form.name}
          onChange={e => setForm({ ...form, name: e.target.value })}
          className="w-full rounded border px-3 py-2"
        />


        {/* две колонки: объём + стоимость */}
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Объём"
            value={form.packVolume}
            onChange={handleVolume}
            className={`w-full rounded px-3 py-2 border ${
              volOk ? 'border-gray-300' : 'border-red-500'
            }`}
          />



          <input
            type="text"
            placeholder="Цена"
            value={form.packCost}
            onChange={handleCost}
            className={`w-full rounded px-3 py-2 border ${
              costOk ? 'border-gray-300' : 'border-red-500'
            }`}
          />
        </div>

        <button
          onClick={save}
          className="w-full rounded bg-blue-600 py-2 text-white disabled:bg-gray-400"
          disabled={!form.name.trim() || !volOk || !costOk}
        >
          {form.id ? 'Сохранить' : 'Добавить'}
        </button>
      </div>

      {/* ---------- список ------------------------------------------- */}
      {loading ? (
        <p className="text-center text-sm text-gray-500">Загрузка…</p>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain pb-[calc(56px+6rem)]">
          {/* ← поле поиска */}
          
          <ul className="space-y-1">
  {filtered.length === 0 ? (
    <li className="text-center text-gray-500 py-4">
      Ничего не найдено
    </li>
  ) : (
    filtered.map(i => {


      return (
        <li
          key={`ingredient-${i.id}`}

          className="flex items-center justify-between rounded border p-3 cursor-pointer hover:bg-gray-50"
          onClick={() =>
            setForm({
              id         : i.id,
              name       : i.name,
              packVolume : i.packVolume?.toString() ?? '',
              packCost   : i.packCost?.toString() ?? '',
            })
          }
        >
          <div>
            <p className="font-medium break-words whitespace-normal">
              {i.name}
            </p>
            {i.packVolume != null && i.packCost != null && (
              <p className="text-xs text-gray-500">
              {`${i.packVolume} / ${i.packCost}₽ · = ${unitPrice(i)}₽ / единицу`}

              </p>
            )}
          </div>
          <button onClick={e => {
            e.stopPropagation();
            remove(i.id);
          }}>🗑</button>
        </li>
      );
    })
  )}
</ul>

        </div>
      )}

    </div>
  </>
);

}
