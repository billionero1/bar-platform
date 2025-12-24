// src/hooks/useUserCard.ts
import { useMemo } from 'react';
import { formatPhone } from '../lib/phone';

type UserLike = {
  name?: string | null;
  phone?: string | null;
};

type UseUserCardOptions = {
  // Имя по умолчанию, если в user.name пусто
  defaultName?: string;
  // Пример телефона для отображения в карточке, если телефона нет
  defaultPhoneExample?: string;
};

export function useUserCard(
  user: UserLike | null | undefined,
  lastPhone: string | null | undefined,
  options: UseUserCardOptions = {}
) {
  const {
    defaultName = 'Александр',
    defaultPhoneExample = '+7 (___) ___-__-__',
  } = options;

  return useMemo(() => {
    const rawName = (user?.name || '').trim();
    const userName = rawName || defaultName;

    const rawUserPhone = (user?.phone || '').trim();
    const rawLastPhone = (lastPhone || '').trim();
    const rawPhone = rawUserPhone || rawLastPhone; // приоритет — реальный phone из user

    const cardPhone = rawPhone ? formatPhone(rawPhone) : defaultPhoneExample;
    const initialPhoneInput = rawPhone ? formatPhone(rawPhone) : '+7 ';

    const initials =
      (userName.trim()[0] || defaultName[0] || 'А').toUpperCase();

    return {
      userName,           // Имя для приветствия
      cardPhone,          // Телефон в карточке (красиво отформатированный)
      initials,           // Буква в аватарке
      initialPhoneInput,  // Что подставлять в input телефона на формах
      rawPhone,           // «голые» цифры, если есть
      hasAnyPhone: !!rawPhone,
    };
  }, [user?.name, user?.phone, lastPhone, defaultName, defaultPhoneExample]);
}
