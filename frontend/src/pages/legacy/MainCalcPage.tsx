import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../AuthContext';

// Типы такие же, как и в MainPage
type IngredientEntry = {
  id: number;
  type: 'ingredient' | 'preparation';
  name: string;
  amount: string;
  expanded?: { name: string; calcAmount: number }[];
};

type Preparation = {
  id: number;
  name: string;
  yieldValue: number;
  yieldUnit: 'ml' | 'l' | 'g' | 'kg';
  ingredients: IngredientEntry[];
  altVolume?: number | null;
};

// Вложенные заготовки
function getExpandedIngredients(prepId: number, amountNeeded: number, allPreparations: Preparation[]) {
  const prep = allPreparations.find(p => p.id === prepId);
  if (!prep) return [];
  const k = amountNeeded / prep.yieldValue;
  return prep.ingredients.map(ing => ({
    name: ing.name,
    calcAmount: +(parseFloat(ing.amount) * k).toFixed(5),
  }));
}

const api = import.meta.env.VITE_API_URL!;


export default function MainCalcPage() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  // Состояния
  const [prep, setPrep] = useState<Preparation | null>(null);
  const [allPreparations, setAllPreparations] = useState<Preparation[]>([]);
  const [desiredVolume, setDesiredVolume] = useState<string>('');
  const [focusIngredient, setFocusIngredient] = useState<number | null>(null);
  const [knownAmount, setKnownAmount] = useState<string>('');
  const [desiredAltVolume, setDesiredAltVolume] = useState<string>('');
  const [showWarning, setShowWarning] = useState(false);

  // Грузим все заготовки и конкретную выбранную
  useEffect(() => {
    const fetchAll = async () => {
      try {
        const headers = { Authorization: `Bearer ${localStorage.getItem('token')}` };
        const res = await fetch(`${api}/preparations`, { headers });
        if (res.status === 401) return logout();
        const list = await res.json();
        setAllPreparations(list);
        const found = list.find((p: Preparation) => p.id === Number(id));
        setPrep(found || null);
        setDesiredVolume(found?.yieldValue?.toString() ?? '');
        setFocusIngredient(null);
        setKnownAmount('');
        setDesiredAltVolume('');
      } catch {
        setPrep(null);
      }
    };
    fetchAll();
  }, [id, logout]);

  // ---- Калькуляции ----
  function calculateByYield(prep: Preparation, outputValue: number) {
    if (!outputValue || outputValue <= 0) return [];
    const k = outputValue / prep.yieldValue;
    return prep.ingredients.map(ing => ({
      ...ing,
      calcAmount: +(parseFloat(ing.amount) * k).toFixed(3),
    }));
  }
  function calculateByIngredient(prep: Preparation, ingredientId: number, amountValue: number) {
    const ing = prep.ingredients[ingredientId];
    if (!ing || !amountValue || amountValue <= 0) return [];
    const base = parseFloat(ing.amount);
    if (!base) return [];
    const k = amountValue / base;
    return prep.ingredients.map((it, idx) => ({
      ...it,
      calcAmount: +(parseFloat(it.amount) * k).toFixed(3),
    }));
  }

  // ---- Расчёт итоговых ингредиентов ----
  let calculatedIngredients: (IngredientEntry & { calcAmount: number })[] = [];
  if (prep) {
    if (
      prep.altVolume &&
      desiredAltVolume &&
      !isNaN(+desiredAltVolume) &&
      +desiredAltVolume > 0
    ) {
      const k = +desiredAltVolume / (prep.altVolume as number);
      calculatedIngredients = prep.ingredients.map(ing => ({
        ...ing,
        calcAmount: +(parseFloat(ing.amount) * k).toFixed(3),
      }));
    } else if (
      desiredVolume &&
      !isNaN(+desiredVolume) &&
      +desiredVolume > 0
    ) {
      calculatedIngredients = calculateByYield(
        prep,
        +desiredVolume
      );
    } else if (
      focusIngredient !== null &&
      knownAmount &&
      !isNaN(+knownAmount) &&
      +knownAmount > 0
    ) {
      calculatedIngredients = calculateByIngredient(
        prep,
        focusIngredient,
        +knownAmount
      );
    }
  }

  // Вложенные заготовки: раскрытие
  calculatedIngredients = calculatedIngredients.map(ing => {
    if (ing.type === 'preparation' && ing.id) {
      return {
        ...ing,
        expanded: getExpandedIngredients(ing.id, ing.calcAmount, allPreparations)
      };
    }
    return ing;
  });

  // Проверка для предупреждения
  useEffect(() => {
    if (prep && desiredVolume && +desiredVolume > 0) {
      const totalIng = prep.ingredients.reduce((acc, ing) => acc + parseFloat(ing.amount), 0);
      if (totalIng > +desiredVolume * 1.05) setShowWarning(true);
      else setShowWarning(false);
    } else setShowWarning(false);
  }, [prep, desiredVolume]);

  if (!prep) return <div className="p-4">Загрузка…</div>;

  // ---- UI ----
  return (
    <div className="h-screen flex flex-col p-4 bg-white">
      <div className="flex-shrink-0">
      <h1 className="text-xl font-semibold mb-3">{prep.name}</h1>
      

      {/* Форма ввода */}
      {focusIngredient === null && (
        <>
          <div className="mb-2">
            <label className="block text-sm mb-1">Необходимый объем заготовки</label>
            <input
              type="number"
              value={desiredVolume}
              min={0}
              step="any"
              onChange={e => {
                setDesiredVolume(e.target.value);
                setKnownAmount('');
                setFocusIngredient(null);
                setDesiredAltVolume('');
              }}
              className="w-full rounded border px-3 py-2"
              placeholder={`0.000`}
            />
            <span className="text-xs text-gray-500">{prep.yieldUnit === 'ml' ? 'liters' : prep.yieldUnit}</span>
          </div>

          {/* Альт. объем */}
          {prep?.altVolume && (
            <div className="mb-2">
              <label className="block text-xs mb-1 text-blue-700">
                Или рассчитать "под объем тары" (объем до фильтрации) Например: ягоды + жидкость:
              </label>
              <input
                type="number"
                value={desiredAltVolume}
                min={0}
                step="any"
                onChange={e => {
                  setDesiredAltVolume(e.target.value);
                  setDesiredVolume('');
                  setKnownAmount('');
                  setFocusIngredient(null);
                }}
                className="w-full rounded border px-3 py-2"
                placeholder={`Введите объем тары`}
              />
            </div>
          )}
        </>
      )}

      {/* По ингредиенту */}
      <div className="mb-2">
        <span className="text-xs text-gray-400">
          Или расчитать на основе доступного объема ингредиента:
        </span>
        {focusIngredient !== null && (
          <div className="mb-2">
            <label className="text-xs text-gray-400">
              "{prep.ingredients[focusIngredient].name}"
            </label>
            <input
              type="number"
              value={knownAmount}
              min={0}
              step="any"
              placeholder="0.000"
              onChange={e => setKnownAmount(e.target.value)}
              className="w-full rounded border px-3 py-2"
              autoFocus
            />
          </div>
        )}

        {/* Кнопки ингредиентов */}
        <div className="flex flex-wrap gap-2 mt-1">
          {prep.ingredients.map((ing, idx) => (
            <button
              key={idx}
              type="button"
              className={`text-xs rounded px-2 py-1 border ${
                focusIngredient === idx
                  ? 'bg-blue-500 text-white border-blue-600'
                  : 'bg-gray-100 text-gray-600 border-gray-300'
              }`}
              onClick={() => {
                if (focusIngredient === idx) {
                  setFocusIngredient(null);
                  setKnownAmount('');
                } else {
                  setFocusIngredient(idx);
                  setKnownAmount('');
                  setDesiredVolume('');
                  setDesiredAltVolume && setDesiredAltVolume('');
                }
              }}
            >
              {ing.name}
            </button>
          ))}
        </div>
      </div>

      {/* Подсказка для настоек/объема */}
      {prep?.altVolume && (
        <div className="p-2 mt-2 rounded bg-yellow-100 text-yellow-800 text-xs mb-2">
          ⚠️ Для этой заготовки есть стартовый объем (до фильтрации): <b>{prep.altVolume} л</b><br/>
          В первой строке программа считает <b>чистый выход</b> (после фильтрации), но если считаешь <b>под объем тары</b> для настаивания, используй вторую строку.<br/>
        </div>
      )}
      </div>
      {/* Итоговый расчет */}
      <div className="flex-1 overflow-y-auto pb-14">
        <p className="text-xl font-semibold mb-3">Ингредиенты</p>
        <ul>
          {calculatedIngredients.length === 0 ? (
            <li className="text-gray-400 text-sm">—</li>
          ) : (
            calculatedIngredients.map((ing, idx) => (
              <li key={idx} className="flex flex-col py-1">
                <div className="flex justify-between text-base">
                  <span>{ing.name}</span>
                  <span>
                    {ing.calcAmount.toFixed(3)}
                  </span>
                </div>
                {/* Вложенные заготовки */}
                {ing.type === 'preparation' && ing.expanded && ing.expanded.length > 0 && (
                  <div className="text-xs text-gray-500 mt-1 pl-2 flex flex-wrap gap-x-2">
                    {ing.expanded.map(
                      (e: { name: string; calcAmount: number }) =>
                        `${e.name}: ${e.calcAmount.toFixed(3)}`
                    ).join(' || ')}
                  </div>
                )}
              </li>
            ))
          )}
        </ul>
        </div>



    
    </div>
  );
}
