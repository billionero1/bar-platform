export type WorkspaceRole = 'manager' | 'staff' | 'solo' | null;

export type WorkspaceModuleId =
  | 'dashboard'
  | 'ingredients'
  | 'preparations'
  | 'cocktails'
  | 'training'
  | 'tests'
  | 'docs'
  | 'forms'
  | 'team';

export type WorkspaceModule = {
  id: WorkspaceModuleId;
  label: string;
  subtitle: string;
  icon: string;
  roles: Array<'manager' | 'staff' | 'solo'>;
};

export const WORKSPACE_MODULES: WorkspaceModule[] = [
  {
    id: 'dashboard',
    label: 'Главная',
    subtitle: 'Сводка смены и быстрые действия',
    icon: '◈',
    roles: ['manager', 'staff', 'solo'],
  },
  {
    id: 'ingredients',
    label: 'Ингредиенты',
    subtitle: 'Себестоимость и складская база',
    icon: '◍',
    roles: ['manager', 'staff', 'solo'],
  },
  {
    id: 'preparations',
    label: 'Заготовки',
    subtitle: 'Техкарты prep и калькулятор выходов',
    icon: '◎',
    roles: ['manager', 'staff', 'solo'],
  },
  {
    id: 'cocktails',
    label: 'Коктейли',
    subtitle: 'Подача, garnish, метод и фото',
    icon: '◉',
    roles: ['manager', 'staff', 'solo'],
  },
  {
    id: 'training',
    label: 'Обучение',
    subtitle: 'Алкоголь, методики, инвентарь',
    icon: '▲',
    roles: ['manager', 'staff', 'solo'],
  },
  {
    id: 'tests',
    label: 'Тесты',
    subtitle: 'Проверка знаний и прогресса',
    icon: '◆',
    roles: ['manager', 'staff', 'solo'],
  },
  {
    id: 'docs',
    label: 'Документация',
    subtitle: 'Стандарты, регламенты, SOP',
    icon: '▣',
    roles: ['manager', 'staff', 'solo'],
  },
  {
    id: 'forms',
    label: 'Заявки',
    subtitle: 'Поставки, списания, сервис',
    icon: '▤',
    roles: ['manager', 'staff', 'solo'],
  },
  {
    id: 'team',
    label: 'Команда',
    subtitle: 'Состав смен и роли',
    icon: '◌',
    roles: ['manager', 'staff'],
  },
];

export function getModulesByRole(role: WorkspaceRole): WorkspaceModule[] {
  const normalized: 'manager' | 'staff' | 'solo' = role === 'manager' || role === 'staff' ? role : 'solo';
  return WORKSPACE_MODULES.filter((m) => m.roles.includes(normalized));
}

export const REQUEST_KIND_LABELS: Record<string, string> = {
  supply: 'Поставка',
  writeoff: 'Списание',
  maintenance: 'Ремонт',
  incident: 'Инцидент',
  vacation: 'Отпуск/смена',
};

export const REQUEST_STATUS_LABELS: Record<string, string> = {
  draft: 'Черновик',
  submitted: 'Отправлена',
  approved: 'Одобрена',
  rejected: 'Отклонена',
  in_progress: 'В работе',
  done: 'Выполнена',
};

export const COCKTAIL_CATEGORY_LABELS: Record<string, string> = {
  cocktail: 'Коктейль',
  non_alcoholic: 'Безалкогольный',
  coffee: 'Кофейный',
  shot: 'Шот',
};
