import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useParams } from 'react-router-dom';
import Toast from '../components/Toast';



const api = import.meta.env.VITE_API_URL!;


// Тип одного ингредиента
type Ingredient = {
  id: number;
  name: string;
  packVolume: number | null;
  packCost: number | null;
  costPerUnit: number | null;
  type: 'ingredient' | 'preparation';
};




type IngredientEntry = {
  type: 'ingredient' | 'preparation';
  id: number; // 👈 вместо name
  amount: string;
};




export default function PreparationForm() {
  const [title, setTitle] = useState('');
  const [ingredients, setIngredients] = useState<IngredientEntry[]>([]);
  const [yieldValue, setYieldValue] = useState('');

  const [search, setSearch] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [ingredientsList, setIngredientsList] = useState<Ingredient[]>([]);
  const [preparationsList, setPreparationsList] = useState<Ingredient[]>([]);

  const [totalCost, setTotalCost] = useState(0);
  const [showToast, setShowToast] = useState(false);
  const [toastType, setToastType] = useState<'success' | 'error'>('success');

  const [titleError, setTitleError] = useState(false);


  const navigate = useNavigate();
  const { id } = useParams();
  const isEditing = Boolean(id);
  const [altVolume, setAltVolume] = useState<string>('');
  const [showAltVolume, setShowAltVolume] = useState(false);



  useEffect(() => {
    const fetchIngredientsAndPreparations = async () => {
      try {
        const headers = {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        };

        const [resIng, resPreps] = await Promise.all([
          fetch(`${api}/ingredients`, { headers }),
          fetch(`${api}/preparations`, { headers }),
        ]);

        if (!resIng.ok || !resPreps.ok) throw new Error();

        const ingData = await resIng.json();
        const prepData = await resPreps.json();

        setIngredientsList(ingData.map((i: any) => ({
          ...i,
          type: 'ingredient' as const,
        })));

        setPreparationsList(prepData.map((p: any) => ({
          id: p.id,
          name: p.name,
          packVolume: p.yieldValue,
          packCost: null,
          costPerUnit: p.costPerUnit ?? null,
          type: 'preparation' as const,
        })));
      } catch (err) {
        setIngredientsList([]);
        setPreparationsList([]);
      }
    };

    fetchIngredientsAndPreparations();
  }, []);




    useEffect(() => {
    let cost = 0;

    ingredients.forEach((ing) => {
      const original = (ing.type === 'preparation'
        ? preparationsList
        : ingredientsList
      ).find((i) => i.id === ing.id);

      if (!original) return;

      const ingAmount = parseFloat(ing.amount);
      if (isNaN(ingAmount) || ingAmount <= 0) return;

      if (original.type === 'preparation' && original.costPerUnit) {
        cost += ingAmount * original.costPerUnit;
      } else if (original.packVolume && original.packCost) {
        cost += (ingAmount / original.packVolume) * original.packCost;
      }
    });

    setTotalCost(cost);
    }, [ingredients, ingredientsList, preparationsList]);






    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        if (!target.closest('.ingredient-search')) {
            setShowDropdown(false);
        }
        };

        document.addEventListener('click', handleClickOutside);
        return () => document.removeEventListener('click', handleClickOutside);
    }, []);

    const filteredList = [...ingredientsList, ...preparationsList].filter((i) =>
      i.name.toLowerCase().includes(search.toLowerCase())
    );






    const addIngredientById = (id: number, type: 'ingredient' | 'preparation') => {
    const existing = (type === 'preparation'
      ? preparationsList
      : ingredientsList
    ).find((i) => i.id === id);


    if (!existing) return;
    setIngredients([
        ...ingredients,
        {
        id: existing.id,
        amount: '',
        type: existing.type,
        },
    ]);
    };



    useEffect(() => {
      if (!isEditing) return;

      async function loadPreparation() {
        try {
          const res = await fetch(`${api}/preparations/${id}`, {
            headers: {
              Authorization: `Bearer ${localStorage.getItem('token')}`,
            },
          });

          if (!res.ok) throw new Error();
          const data = await res.json();

          setTitle(data.title);
          setYieldValue(data.yieldValue.toString());
          setAltVolume(data.altVolume ? data.altVolume.toString() : '');
          setShowAltVolume(!!data.altVolume);

          setIngredients(data.ingredients.map((i: any) => ({
            id: i.id,
            amount: i.amount,
            type: i.type,
          })));

        } catch (err) {
          console.error('Ошибка загрузки заготовки', err);
          setToastType('error');
          setShowToast(true);
          setTimeout(() => setShowToast(false), 2000);
        }
      }

      loadPreparation();
    }, [id, isEditing]);



    const updateIngredient = <K extends keyof IngredientEntry>(
    index: number,
    field: K,
    value: IngredientEntry[K]
    ) => {
    const updated = [...ingredients];
    if (field === 'amount' && typeof value === 'string') {
        updated[index][field] = value.replace(',', '.') as IngredientEntry[K];
    } else {
        updated[index][field] = value;
    }

    setIngredients(updated);
    };


  const removeIngredient = (index: number) => {
    const updated = [...ingredients];
    updated.splice(index, 1);
    setIngredients(updated);
  };

  const save = async () => {
      const cleanedTitle = title.trim();
      const cleanedYield = parseFloat(yieldValue);

    if (
      cleanedTitle.length === 0 ||
      isNaN(cleanedYield) ||
      !Array.isArray(ingredients) ||
      ingredients.length === 0
    ) {
      setTitleError(true);
      setToastType('error');
      setShowToast(true);
      setTimeout(() => setShowToast(false), 2000);
      return;
    }


      try {
        const payload = {
          title: cleanedTitle,
          yieldValue: cleanedYield,
          ingredients: ingredients.map(i => ({
            id: i.id,
            amount: i.amount,
            type: i.type,
          })),
          altVolume: showAltVolume && altVolume ? parseFloat(altVolume) : null,
        };

        console.log('Отправка заготовки:', payload);

        const res = await fetch(`${api}/preparations${isEditing ? `/${id}` : ''}`, {
          method: isEditing ? 'PUT' : 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('token')}`,
          },
          body: JSON.stringify(payload),
        });

        if (!res.ok) throw new Error('Ошибка при сохранении');

        setToastType('success');
        setShowToast(true);
        setTimeout(() => {
          navigate('/preparations');
        }, 1500);
      } catch (err) {
        console.error('Ошибка при сохранении заготовки:', err);
        setToastType('error');
        setShowToast(true);
        setTimeout(() => {
          setShowToast(false);
        }, 2000);
      }

  };


  return (
  <form
    id="prep-form"
    onSubmit={(e) => {
      e.preventDefault();
      save();
    }}
    className="h-screen flex flex-col p-4 pt-8 pb-56 overflow-hidden"
  >

      <h1 className="text-2xl font-bold mb-4">Редактор заготовок</h1>

        <input
        type="text"
        value={title}
        onChange={(e) => {
            setTitle(e.target.value);
            setTitleError(false); // убираем ошибку при вводе
        }}
        placeholder="Название заготовки"
        className={`w-full mb-4 rounded border px-3 py-2 bg-gray-100 ${
            titleError ? 'border-red-500' : ''
        }`}
        />


      <h2 className="text-lg font-semibold mb-2">Ингредиенты</h2>

      <div className="relative mb-4 ingredient-search">
        <input
          type="text"
          placeholder="Поиск ингредиента…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setShowDropdown(true);
          }}
          className="w-full rounded border px-3 py-2"
        />
      {showDropdown && filteredList.length > 0 && (
        <ul className="absolute z-10 bg-white border w-full mt-1 max-h-40 overflow-auto rounded shadow">
          {filteredList.map((i) => (
            <li
              key={`${i.type}-${i.id}`}
              className="px-3 py-2 hover:bg-blue-100 cursor-pointer"
              onClick={() => {
                addIngredientById(i.id, i.type);
                setSearch('');
                setShowDropdown(false);
              }}
            >
              {i.name}{" "}
              {i.type === "preparation" && (
                <span className="text-xs text-blue-500 ml-1">(заготовка)</span>
              )}
            </li>
          ))}
        </ul>
      )}

      </div>

      <div className="space-y-2 mb-4 overflow-y-auto max-h-[50vh] pr-1">
        {ingredients.map((ing, idx) => {
        const ingredientData = (ing.type === 'preparation'
          ? preparationsList
          : ingredientsList
        ).find((i) => i.id === ing.id);

        const amount = parseFloat(ing.amount);
        let priceDisplay = '';

      if (ingredientData && !isNaN(amount)) {
        let cost = null;
        if (ingredientData.costPerUnit !== null && !isNaN(ingredientData.costPerUnit)) {
          cost = amount * ingredientData.costPerUnit;
        } else if (
          ingredientData.packVolume &&
          ingredientData.packCost
        ) {
          cost = (amount / ingredientData.packVolume) * ingredientData.packCost;
        }

        if (cost !== null && !isNaN(cost) && isFinite(cost)) {
          priceDisplay = `≈ ${cost.toFixed(2)} ₽${ingredientData.type === "preparation" ? " (заготовка)" : ""}`;
        }
      }






        return (
            <div key={`${ing.type}-${ing.id}-${idx}`} className="border-b pb-1">
            <div className="flex items-center justify-between">
                <input
                type="text"
                value={ingredientData?.name || ''}
                readOnly
                placeholder="Название"
                className="flex-1 mr-2 bg-transparent font-medium"
                />
                <input
                type="text"
                value={ing.amount}
                onChange={(e) => updateIngredient(idx, 'amount', e.target.value)}
                placeholder="Кол-во"
                className="w-24 text-right bg-transparent"
                />
                <button
                onClick={() => removeIngredient(idx)}
                className="ml-2 text-red-500 hover:text-red-700"
                >
                ✕
                </button>
            </div>
            {priceDisplay && (
                <div className="text-sm text-gray-500 mt-1 pl-1">{priceDisplay}</div>
            )}
            </div>
        );
        })}


      </div>

    <div className="mb-3">
      <button
        type="button"
        className={`border px-2 py-1 rounded text-xs ${showAltVolume ? 'bg-blue-50 border-blue-400' : 'bg-gray-50 border-gray-200'}`}
        onClick={() => setShowAltVolume(v => !v)}
      >
        Указать стартовый объем (до фильтрации)
      </button>
    </div>
    {showAltVolume && (
      <div className="mb-4">
        <label className="block text-xs mb-1 text-gray-600">
          Стартовый объем (до фильтрации, литры)
        </label>
        <input
          type="number"
          min={0}
          step="any"
          value={altVolume}
          onChange={e => setAltVolume(e.target.value)}
          className="w-32 bg-gray-100 rounded px-3 py-2"
          placeholder="0.000"
        />
        <div className="text-xs text-gray-400 mt-1">
          Это общий объем смеси (жидкость + ягоды/мякоть), до фильтрации.
        </div>
      </div>
    )}


    <h2 className="text-lg font-semibold mb-2">Объем (в литрах или килограммах)</h2>

    <div className="flex items-center mb-4">
    <input
        type="text"
        value={yieldValue}
        onChange={(e) => setYieldValue(e.target.value.replace(',', '.'))}
        className="w-32 bg-gray-100 rounded px-3 py-2 mr-2"
        placeholder="0.000"
    />
    </div>



      {!isNaN(totalCost) && (
        <p className="text-sm text-gray-600 mb-1">
          Себестоимость заготовки: <strong>{totalCost.toFixed(3)} ₽</strong>
        </p>
      )}

      {!isNaN(totalCost) && parseFloat(yieldValue) > 0 && (
        <p className="text-sm text-gray-600 mb-4">
        Себестоимость за литр:{' '}
        <strong>
            {(totalCost / parseFloat(yieldValue)).toFixed(3)} ₽
        </strong>
        </p>

      )}





    <Toast show={showToast} type={toastType} />


    </form>
  );

}
