import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { useAuth } from '../../../AuthContext';
import { useTheme } from '../../../ThemeContext';
import { rusify } from '../../../shared/lib';

import {
  absoluteApiUrl,
  createInvite,
  createCocktail,
  createQuizQuestion,
  createTrainingTopic,
  createEstablishment,
  createIngredient,
  createPreparation,
  createRequest,
  deleteCocktail,
  deleteIngredient,
  deletePreparation,
  deleteQuizQuestion,
  deleteTrainingTopic,
  downloadProtectedCsv,
  getCocktailCalc,
  getPreparationCalc,
  getQuizSummary,
  listCocktails,
  listDocs,
  listFormTemplates,
  listIngredients,
  listInvites,
  listPreparations,
  listQuizQuestions,
  listRequests,
  listTeam,
  listTrainingTopics,
  revokeInvite,
  revokeTeamMember,
  submitQuizAttempt,
  uploadCocktailPhoto,
  updateIngredient,
  updateQuizQuestion,
  updateRequest,
  updateTrainingTopic,
  updateRequestStatus,
  updateTeamRole,
  type CocktailCalc,
  type CocktailSummary,
  type CreateCocktailPayload,
  type CreatePreparationPayload,
  type DocumentItem,
  type Ingredient,
  type LearningTopic,
  type OperationRequest,
  type OperationRequestTemplate,
  type PreparationCalc,
  type PreparationCalcQuery,
  type PreparationSummary,
  type QuizQuestion,
  type QuizSummary,
  type TeamInvite,
  type TeamPayload,
} from './workspace.api';

import {
  COCKTAIL_CATEGORY_LABELS,
  REQUEST_KIND_LABELS,
  REQUEST_STATUS_LABELS,
  getModulesByRole,
  type WorkspaceModule,
  type WorkspaceModuleId,
} from './workspace.content';

import './Workspace.shell.css';

type WorkspaceShellProps = {
  layout: 'desktop' | 'tablet' | 'mobile';
};

type DraftComponent = {
  type: 'ingredient' | 'preparation';
  id: string;
  query: string;
  amount: string;
  unit: string;
};

type QuizMap = Record<string, number>;

type DocumentAcks = Record<string, boolean>;

type TrainingTopicDraft = {
  category: string;
  title: string;
  summary: string;
  bullets: string;
  position: string;
};

type QuizQuestionDraft = {
  question: string;
  options: string;
  correctOption: string;
  hint: string;
  position: string;
};

const REQUEST_STATUSES_FOR_MANAGER = ['submitted', 'in_progress', 'approved', 'rejected', 'done'];
const UNIT_OPTIONS = ['мл', 'л', 'г', 'кг', 'шт'] as const;

type UnitOption = (typeof UNIT_OPTIONS)[number];

const UNIT_LABELS: Record<UnitOption, string> = {
  мл: 'мл',
  л: 'л',
  г: 'г',
  кг: 'кг',
  шт: 'шт',
};

const UNIT_ALIASES: Record<string, UnitOption> = {
  мл: 'мл',
  ml: 'мл',
  л: 'л',
  l: 'л',
  cl: 'мл',
  г: 'г',
  g: 'г',
  кг: 'кг',
  kg: 'кг',
  шт: 'шт',
  pcs: 'шт',
  pc: 'шт',
  piece: 'шт',
  pieces: 'шт',
  unit: 'шт',
  units: 'шт',
};

function normalizeUnitOption(raw: string | null | undefined): UnitOption | '' {
  const key = String(raw || '').trim().toLowerCase();
  if (!key) return '';
  return UNIT_ALIASES[key] || '';
}

function defaultComponentUnit(type: DraftComponent['type']): UnitOption {
  return type === 'preparation' ? 'л' : 'мл';
}
const MODULE_READ_PERMISSION: Record<WorkspaceModuleId, string | null> = {
  dashboard: 'dashboard:view',
  ingredients: 'ingredients:read',
  preparations: 'preparations:read',
  cocktails: 'cocktails:read',
  training: 'training:read',
  tests: 'tests:take',
  docs: 'docs:read',
  forms: 'forms:read',
  team: 'team:read',
};

function hasPermissionLocal(permissions: string[], permission: string): boolean {
  if (permissions.includes('*')) return true;
  if (permissions.includes(permission)) return true;
  const [domain] = permission.split(':');
  if (domain && permissions.includes(`${domain}:*`)) return true;
  return false;
}

function parseNumberInput(value: string): number | null {
  const raw = value.trim().replace(',', '.');
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function formatMoney(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return `${value.toFixed(2)} ₽`;
}

function formatValue(value: number | null, unit: string | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  if (!unit) return value.toFixed(2);
  return `${value.toFixed(2)} ${unit}`;
}

function prepCalcBasisLabel(mode: PreparationCalc['calculationBasis']): string {
  if (mode === 'yield') return 'По выходу';
  if (mode === 'alt_volume') return 'По объёму до фильтрации';
  if (mode === 'known_component') return 'По известному компоненту';
  return 'Базовый расчёт';
}

function roleLabel(role: string | null | undefined): string {
  if (role === 'manager') return 'Менеджер';
  if (role === 'staff') return 'Сотрудник';
  return 'Индивидуальный аккаунт';
}

function EmptyState({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="wsv-empty">
      <div className="wsv-empty__title">{title}</div>
      <div className="wsv-empty__subtitle">{subtitle}</div>
    </div>
  );
}

function MetricCard({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="wsv-metric">
      <div className="wsv-metric__label">{label}</div>
      <div className="wsv-metric__value">{value}</div>
      <div className="wsv-metric__note">{note}</div>
    </div>
  );
}

function SectionCard({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="wsv-card">
      <header className="wsv-card__header">
        <h3>{title}</h3>
        {right ? <div className="wsv-card__right">{right}</div> : null}
      </header>
      <div className="wsv-card__body">{children}</div>
    </section>
  );
}

function defaultDraftComponent(): DraftComponent {
  return {
    type: 'ingredient',
    id: '',
    query: '',
    amount: '',
    unit: defaultComponentUnit('ingredient'),
  };
}

const WorkspaceShell: React.FC<WorkspaceShellProps> = ({ layout }) => {
  const { user, logout, checkSession } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const permissions = useMemo(() => (Array.isArray(user?.permissions) ? user.permissions : []), [user?.permissions]);
  const can = useCallback((permission: string) => hasPermissionLocal(permissions, permission), [permissions]);
  const modules = useMemo(
    () =>
      getModulesByRole(user?.role ?? null).filter((module) => {
        const required = MODULE_READ_PERMISSION[module.id];
        return !required || can(required);
      }),
    [can, user?.role]
  );

  const [activeModule, setActiveModule] = useState<WorkspaceModuleId>('dashboard');
  const [search, setSearch] = useState('');

  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);

  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [preparations, setPreparations] = useState<PreparationSummary[]>([]);
  const [cocktails, setCocktails] = useState<CocktailSummary[]>([]);
  const [requests, setRequests] = useState<OperationRequest[]>([]);
  const [requestTemplates, setRequestTemplates] = useState<OperationRequestTemplate[]>([]);
  const [team, setTeam] = useState<TeamPayload>({ canManage: false, rows: [] });
  const [invites, setInvites] = useState<TeamInvite[]>([]);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [learningTopics, setLearningTopics] = useState<LearningTopic[]>([]);
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [quizSummary, setQuizSummary] = useState<QuizSummary | null>(null);

  const [selectedPrepId, setSelectedPrepId] = useState<number | null>(null);
  const [prepCalc, setPrepCalc] = useState<PreparationCalc | null>(null);
  const [prepCalcVolume, setPrepCalcVolume] = useState('');
  const [prepCalcAltVolume, setPrepCalcAltVolume] = useState('');
  const [prepCalcKnownComponentIndex, setPrepCalcKnownComponentIndex] = useState('');
  const [prepCalcKnownAmount, setPrepCalcKnownAmount] = useState('');
  const [prepCalcLoading, setPrepCalcLoading] = useState(false);

  const [selectedCocktailId, setSelectedCocktailId] = useState<number | null>(null);
  const [cocktailCalc, setCocktailCalc] = useState<CocktailCalc | null>(null);
  const [cocktailOutput, setCocktailOutput] = useState('');
  const [cocktailCalcLoading, setCocktailCalcLoading] = useState(false);
  const [selectedCocktailPhoto, setSelectedCocktailPhoto] = useState<File | null>(null);

  const [ingredientDraft, setIngredientDraft] = useState({
    name: '',
    packVolume: '',
    packCost: '',
    unit: 'л',
  });
  const [editingIngredientId, setEditingIngredientId] = useState<number | null>(null);

  const [preparationDraft, setPreparationDraft] = useState({
    title: '',
    yieldValue: '',
    yieldUnit: 'л',
    altVolume: '',
    components: [defaultDraftComponent()],
  });

  const [cocktailDraft, setCocktailDraft] = useState({
    title: '',
    category: 'cocktail',
    outputValue: '',
    outputUnit: 'л',
    garnish: '',
    serving: '',
    method: '',
    photoUrl: '',
    notes: '',
    components: [defaultDraftComponent()],
  });

  const [requestDraft, setRequestDraft] = useState({
    kind: 'supply',
    title: '',
    detailsText: '',
    status: 'submitted' as 'draft' | 'submitted',
  });
  const [editingRequestId, setEditingRequestId] = useState<number | null>(null);
  const [editingTopicId, setEditingTopicId] = useState<number | null>(null);
  const [topicDraft, setTopicDraft] = useState<TrainingTopicDraft>({
    category: 'Общее',
    title: '',
    summary: '',
    bullets: '',
    position: '100',
  });
  const [editingQuestionId, setEditingQuestionId] = useState<number | null>(null);
  const [questionDraft, setQuestionDraft] = useState<QuizQuestionDraft>({
    question: '',
    options: '',
    correctOption: '0',
    hint: '',
    position: '100',
  });
  const [inviteDraft, setInviteDraft] = useState({
    phone: '',
    name: '',
    surname: '',
    role: 'staff' as 'manager' | 'staff',
    ttlHours: '72',
  });
  const [lastInviteLink, setLastInviteLink] = useState<string | null>(null);
  const [lastInviteInfo, setLastInviteInfo] = useState<string | null>(null);

  const [newEstablishmentName, setNewEstablishmentName] = useState('');

  const quizStorageKey = `probar:quiz-history:${user?.sub ?? 'anon'}`;
  const docStorageKey = `probar:docs-ack:${user?.sub ?? 'anon'}`;

  const [quizAnswers, setQuizAnswers] = useState<QuizMap>({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [quizHistory, setQuizHistory] = useState<number[]>([]);

  const [docAcks, setDocAcks] = useState<DocumentAcks>({});

  const hasEstablishment = !!user?.establishment_id;
  const isMobile = layout === 'mobile';
  const canCreateEstablishment = can('establishment:create');
  const canReadIngredients = can('ingredients:read');
  const canCreateIngredients = can('ingredients:create');
  const canUpdateIngredients = can('ingredients:update');
  const canDeleteIngredients = can('ingredients:delete');
  const canReadPreparations = can('preparations:read');
  const canCreatePreparations = can('preparations:create');
  const canDeletePreparations = can('preparations:delete');
  const canReadCocktails = can('cocktails:read');
  const canCreateCocktails = can('cocktails:create');
  const canDeleteCocktails = can('cocktails:delete');
  const canUploadCocktailPhoto = can('cocktails:upload_photo');
  const canReadForms = can('forms:read');
  const canCreateForms = can('forms:create');
  const canUpdateOwnForms = can('forms:update_own');
  const canUpdateAnyForms = can('forms:update_any');
  const canManageFormStatuses = can('forms:manage_status');
  const canExportForms = can('forms:export');
  const canReadTeam = can('team:read');
  const canManageTeam = can('team:manage');
  const canReadInvites = can('invites:read');
  const canCreateInvites = can('invites:create');
  const canCancelInvites = can('invites:cancel');
  const canReadDocs = can('docs:read');
  const canExportDocs = can('docs:export');
  const canReadTraining = can('training:read');
  const canManageTraining = can('training:manage');
  const canTakeTests = can('tests:take');
  const canViewTeamAnalytics = can('tests:analytics_team');
  const canManageTests = can('tests:manage');

  const filteredIngredients = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return ingredients;
    return ingredients.filter((row) => row.name.toLowerCase().includes(needle));
  }, [ingredients, search]);

  const filteredPreparations = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return preparations;
    return preparations.filter((row) => row.title.toLowerCase().includes(needle));
  }, [preparations, search]);

  const filteredCocktails = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return cocktails;
    return cocktails.filter((row) => row.title.toLowerCase().includes(needle));
  }, [cocktails, search]);

  const filteredTopics = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return learningTopics;
    return learningTopics.filter((topic) => {
      const source = `${topic.category} ${topic.title} ${topic.summary} ${topic.bullets.join(' ')}`.toLowerCase();
      return source.includes(needle);
    });
  }, [learningTopics, search]);

  const filteredQuizQuestions = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return quizQuestions;
    return quizQuestions.filter((item) => {
      const source = `${item.question} ${(item.hint || '')} ${item.options.join(' ')}`.toLowerCase();
      return source.includes(needle);
    });
  }, [quizQuestions, search]);

  const filteredDocuments = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return documents;
    return documents.filter((doc) => {
      const source = `${doc.code} ${doc.title} ${doc.description}`.toLowerCase();
      return source.includes(needle);
    });
  }, [documents, search]);

  useEffect(() => {
    if (!modules.length) return;
    const hasModule = modules.some((item) => item.id === activeModule);
    if (!hasModule) {
      setActiveModule(modules[0].id);
    }
  }, [activeModule, modules]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(quizStorageKey);
      if (!raw) {
        setQuizHistory([]);
        return;
      }
      const parsed = JSON.parse(raw) as number[];
      if (Array.isArray(parsed)) {
        setQuizHistory(parsed.filter((x) => Number.isFinite(x)).slice(0, 10));
      }
    } catch {
      setQuizHistory([]);
    }
  }, [quizStorageKey]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(docStorageKey);
      if (!raw) {
        setDocAcks({});
        return;
      }
      const parsed = JSON.parse(raw) as DocumentAcks;
      if (parsed && typeof parsed === 'object') {
        setDocAcks(parsed);
      }
    } catch {
      setDocAcks({});
    }
  }, [docStorageKey]);

  const refreshWorkspaceData = useCallback(async (options?: { silent?: boolean }) => {
    const silent = !!options?.silent;
    if (!silent) {
      setLoading(true);
    }
    setWorkspaceError(null);

    try {
      const docsPromise = canReadDocs ? listDocs() : Promise.resolve<DocumentItem[]>([]);
      const templatesPromise = canReadForms ? listFormTemplates() : Promise.resolve<OperationRequestTemplate[]>([]);
      const topicsPromise = canReadTraining ? listTrainingTopics(canManageTraining) : Promise.resolve<LearningTopic[]>([]);
      const quizQuestionsPromise = canTakeTests
        ? listQuizQuestions({ includeArchived: canManageTests, includeCorrect: canManageTests })
        : Promise.resolve<QuizQuestion[]>([]);

      if (!hasEstablishment) {
        const [docsRows, templates] = await Promise.all([docsPromise, templatesPromise]);
        setDocuments(docsRows);
        setRequestTemplates(templates);
        setIngredients([]);
        setPreparations([]);
        setCocktails([]);
        setRequests([]);
        setTeam({ canManage: false, rows: [] });
        setInvites([]);
        setLearningTopics([]);
        setQuizQuestions([]);
        setLastInviteLink(null);
        setLastInviteInfo(null);
        setQuizSummary(null);
        return;
      }

      const settled = await Promise.allSettled([
        canReadIngredients ? listIngredients() : Promise.resolve<Ingredient[]>([]),
        canReadPreparations ? listPreparations() : Promise.resolve<PreparationSummary[]>([]),
        canReadCocktails ? listCocktails() : Promise.resolve<CocktailSummary[]>([]),
        canReadForms ? listRequests() : Promise.resolve<OperationRequest[]>([]),
        templatesPromise,
        canReadTeam ? listTeam() : Promise.resolve<TeamPayload>({ canManage: false, rows: [] }),
        canReadInvites ? listInvites() : Promise.resolve<TeamInvite[]>([]),
        docsPromise,
        topicsPromise,
        quizQuestionsPromise,
        canTakeTests ? getQuizSummary() : Promise.resolve<QuizSummary | null>(null),
      ]);

      const readValue = <T,>(index: number, fallback: T): T => {
        const entry = settled[index];
        if (entry.status === 'fulfilled') return entry.value as T;
        return fallback;
      };

      setIngredients(readValue(0, []));
      setPreparations(readValue(1, []));
      setCocktails(readValue(2, []));
      setRequests(readValue(3, []));
      setRequestTemplates(readValue(4, []));
      setTeam(readValue(5, { canManage: false, rows: [] }));
      setInvites(readValue(6, []));
      setDocuments(readValue(7, []));
      setLearningTopics(readValue(8, []));
      setQuizQuestions(readValue(9, []));
      setQuizSummary(readValue(10, null));
    } catch (e) {
      setWorkspaceError(rusify(e));
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [
    canReadCocktails,
    canReadDocs,
    canReadForms,
    canReadIngredients,
    canReadInvites,
    canReadPreparations,
    canReadTraining,
    canReadTeam,
    canManageTests,
    canManageTraining,
    canTakeTests,
    hasEstablishment,
  ]);

  useEffect(() => {
    void refreshWorkspaceData();
  }, [refreshWorkspaceData]);

  const runMutate = useCallback(async (key: string, runner: () => Promise<void>) => {
    setBusyAction(key);
    setWorkspaceError(null);
    try {
      await runner();
      await refreshWorkspaceData({ silent: true });
    } catch (e) {
      setWorkspaceError(rusify(e));
    } finally {
      setBusyAction(null);
    }
  }, [refreshWorkspaceData]);

  const loadPreparationCalc = useCallback(async (id: number, query?: PreparationCalcQuery) => {
    setPrepCalcLoading(true);
    setWorkspaceError(null);
    try {
      const calc = await getPreparationCalc(id, query);
      setPrepCalc(calc);
    } catch (e) {
      setWorkspaceError(rusify(e));
    } finally {
      setPrepCalcLoading(false);
    }
  }, []);

  const loadCocktailCalc = useCallback(async (id: number, output?: number) => {
    setCocktailCalcLoading(true);
    setWorkspaceError(null);
    try {
      const calc = await getCocktailCalc(id, output);
      setCocktailCalc(calc);
    } catch (e) {
      setWorkspaceError(rusify(e));
    } finally {
      setCocktailCalcLoading(false);
    }
  }, []);

  const resetIngredientDraft = useCallback(() => {
    setIngredientDraft({
      name: '',
      packVolume: '',
      packCost: '',
      unit: 'л',
    });
    setEditingIngredientId(null);
  }, []);

  const resetPreparationDraft = useCallback(() => {
    setPreparationDraft({
      title: '',
      yieldValue: '',
      yieldUnit: 'л',
      altVolume: '',
      components: [defaultDraftComponent()],
    });
  }, []);

  const resetCocktailDraft = useCallback(() => {
    setCocktailDraft({
      title: '',
      category: 'cocktail',
      outputValue: '',
      outputUnit: 'л',
      garnish: '',
      serving: '',
      method: '',
      photoUrl: '',
      notes: '',
      components: [defaultDraftComponent()],
    });
  }, []);

  const resetRequestDraft = useCallback(() => {
    setRequestDraft({
      kind: 'supply',
      title: '',
      detailsText: '',
      status: 'submitted',
    });
    setEditingRequestId(null);
  }, []);

  const resetTopicDraft = useCallback(() => {
    setTopicDraft({
      category: 'Общее',
      title: '',
      summary: '',
      bullets: '',
      position: '100',
    });
    setEditingTopicId(null);
  }, []);

  const resetQuestionDraft = useCallback(() => {
    setQuestionDraft({
      question: '',
      options: '',
      correctOption: '0',
      hint: '',
      position: '100',
    });
    setEditingQuestionId(null);
  }, []);

  const toPreparationPayload = useCallback((): CreatePreparationPayload | null => {
    const title = preparationDraft.title.trim();
    if (!title) return null;

    const components = preparationDraft.components
      .map((row) => {
        const id = Number(row.id);
        const amount = parseNumberInput(row.amount);
        return {
          type: row.type,
          id,
          amount,
          unit: normalizeUnitOption(row.unit) || null,
        };
      })
      .filter((row) => Number.isFinite(row.id) && row.amount !== null && row.amount > 0) as Array<{
        type: 'ingredient' | 'preparation';
        id: number;
        amount: number;
        unit: string | null;
      }>;

    if (!components.length) return null;

    return {
      title,
      yieldValue: parseNumberInput(preparationDraft.yieldValue),
      yieldUnit: normalizeUnitOption(preparationDraft.yieldUnit) || null,
      altVolume: parseNumberInput(preparationDraft.altVolume),
      components,
    };
  }, [preparationDraft]);

  const toCocktailPayload = useCallback((): CreateCocktailPayload | null => {
    const title = cocktailDraft.title.trim();
    if (!title) return null;

    const components = cocktailDraft.components
      .map((row) => {
        const id = Number(row.id);
        const amount = parseNumberInput(row.amount);
        return {
          type: row.type,
          id,
          amount,
          unit: normalizeUnitOption(row.unit) || null,
        };
      })
      .filter((row) => Number.isFinite(row.id) && row.amount !== null && row.amount > 0) as Array<{
        type: 'ingredient' | 'preparation';
        id: number;
        amount: number;
        unit: string | null;
      }>;

    if (!components.length) return null;

    return {
      title,
      category: cocktailDraft.category,
      outputValue: parseNumberInput(cocktailDraft.outputValue),
      outputUnit: normalizeUnitOption(cocktailDraft.outputUnit) || null,
      garnish: cocktailDraft.garnish.trim() || null,
      serving: cocktailDraft.serving.trim() || null,
      method: cocktailDraft.method.trim() || null,
      photoUrl: cocktailDraft.photoUrl.trim() || null,
      notes: cocktailDraft.notes.trim() || null,
      components,
    };
  }, [cocktailDraft]);

  const onSubmitIngredient = useCallback(async () => {
    const name = ingredientDraft.name.trim();
    if (!name) {
      setWorkspaceError('Укажи название ингредиента.');
      return;
    }

    const payload = {
      name,
      packVolume: parseNumberInput(ingredientDraft.packVolume),
      packCost: parseNumberInput(ingredientDraft.packCost),
      unit: normalizeUnitOption(ingredientDraft.unit) || null,
    };

    const actionKey = editingIngredientId ? 'ingredient:update' : 'ingredient:create';

    await runMutate(actionKey, async () => {
      if (editingIngredientId) {
        await updateIngredient(editingIngredientId, payload);
      } else {
        await createIngredient(payload);
      }
      resetIngredientDraft();
    });
  }, [editingIngredientId, ingredientDraft, resetIngredientDraft, runMutate]);

  const onSelectPreparation = useCallback(async (id: number) => {
    setSelectedPrepId(id);
    setPrepCalcVolume('');
    setPrepCalcAltVolume('');
    setPrepCalcKnownComponentIndex('');
    setPrepCalcKnownAmount('');
    await loadPreparationCalc(id);
  }, [loadPreparationCalc]);

  const onSelectCocktail = useCallback(async (id: number) => {
    setSelectedCocktailId(id);
    setCocktailOutput('');
    await loadCocktailCalc(id);
  }, [loadCocktailCalc]);

  const onCreateEstablishment = useCallback(async () => {
    const name = newEstablishmentName.trim();
    if (!name) {
      setWorkspaceError('Укажи название заведения.');
      return;
    }

    await runMutate('establishment:create', async () => {
      await createEstablishment(name);
      await checkSession({ silent: true, force: true });
      setNewEstablishmentName('');
    });
  }, [checkSession, newEstablishmentName, runMutate]);

  const onSubmitPreparation = useCallback(async () => {
    const payload = toPreparationPayload();
    if (!payload) {
      setWorkspaceError('Проверь поля заготовки и состав.');
      return;
    }

    await runMutate('preparation:create', async () => {
      await createPreparation(payload);
      resetPreparationDraft();
    });
  }, [resetPreparationDraft, runMutate, toPreparationPayload]);

  const onSubmitCocktail = useCallback(async () => {
    const payload = toCocktailPayload();
    if (!payload) {
      setWorkspaceError('Проверь карточку коктейля и состав.');
      return;
    }

    await runMutate('cocktail:create', async () => {
      await createCocktail(payload);
      resetCocktailDraft();
    });
  }, [resetCocktailDraft, runMutate, toCocktailPayload]);

  const onSubmitRequest = useCallback(async () => {
    const title = requestDraft.title.trim();
    if (!title) {
      setWorkspaceError('Укажи заголовок заявки.');
      return;
    }

    const details = {
      text: requestDraft.detailsText.trim(),
    };

    await runMutate('request:save', async () => {
      if (editingRequestId) {
        await updateRequest(editingRequestId, { title, details });
      } else {
        await createRequest({
          kind: requestDraft.kind,
          title,
          details,
          status: requestDraft.status,
        });
      }
      resetRequestDraft();
    });
  }, [editingRequestId, requestDraft, resetRequestDraft, runMutate]);

  const onSubmitTopic = useCallback(async () => {
    const title = topicDraft.title.trim();
    if (!title) {
      setWorkspaceError('Укажи заголовок учебного блока.');
      return;
    }

    const bullets = topicDraft.bullets
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    const position = parseNumberInput(topicDraft.position);

    await runMutate(editingTopicId ? 'training:update' : 'training:create', async () => {
      if (editingTopicId) {
        await updateTrainingTopic(editingTopicId, {
          category: topicDraft.category.trim() || 'Общее',
          title,
          summary: topicDraft.summary.trim(),
          bullets,
          position: position === null ? 100 : Math.round(position),
        });
      } else {
        await createTrainingTopic({
          category: topicDraft.category.trim() || 'Общее',
          title,
          summary: topicDraft.summary.trim(),
          bullets,
          position: position === null ? 100 : Math.round(position),
        });
      }
      resetTopicDraft();
    });
  }, [editingTopicId, resetTopicDraft, runMutate, topicDraft]);

  const onSubmitQuizQuestion = useCallback(async () => {
    const question = questionDraft.question.trim();
    if (!question) {
      setWorkspaceError('Укажи формулировку вопроса.');
      return;
    }

    const options = questionDraft.options
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    if (options.length < 2) {
      setWorkspaceError('Добавь минимум два варианта ответа.');
      return;
    }

    const correctOption = parseNumberInput(questionDraft.correctOption);
    if (correctOption === null || correctOption < 0 || correctOption >= options.length) {
      setWorkspaceError('Индекс правильного ответа вне диапазона вариантов.');
      return;
    }

    const position = parseNumberInput(questionDraft.position);
    await runMutate(editingQuestionId ? 'quiz:update' : 'quiz:create', async () => {
      if (editingQuestionId) {
        await updateQuizQuestion(editingQuestionId, {
          question,
          options,
          correctOption: Math.round(correctOption),
          hint: questionDraft.hint.trim() || null,
          position: position === null ? 100 : Math.round(position),
        });
      } else {
        await createQuizQuestion({
          question,
          options,
          correctOption: Math.round(correctOption),
          hint: questionDraft.hint.trim() || null,
          position: position === null ? 100 : Math.round(position),
        });
      }
      resetQuestionDraft();
    });
  }, [editingQuestionId, questionDraft, resetQuestionDraft, runMutate]);

  const onSubmitInvite = useCallback(async () => {
    if (!canCreateInvites) {
      setWorkspaceError('Нет прав на создание приглашений.');
      return;
    }

    const phone = inviteDraft.phone.trim();
    if (!phone) {
      setWorkspaceError('Укажи номер телефона сотрудника.');
      return;
    }

    const ttl = parseNumberInput(inviteDraft.ttlHours);
    const ttlHours = ttl === null ? 72 : Math.max(1, Math.min(168, Math.round(ttl)));
    const role = canManageTeam && inviteDraft.role === 'manager' ? 'manager' : 'staff';

    await runMutate('invite:create', async () => {
      const created = await createInvite({
        phone,
        name: inviteDraft.name.trim() || undefined,
        surname: inviteDraft.surname.trim() || undefined,
        role,
        ttlHours,
      });

      setInviteDraft({
        phone: '',
        name: '',
        surname: '',
        role: 'staff',
        ttlHours: String(ttlHours),
      });

      if (created.linkedExistingUser) {
        setLastInviteLink(null);
        setLastInviteInfo('Сотрудник уже имел аккаунт и автоматически привязан к вашему заведению.');
        return;
      }

      setLastInviteInfo(null);
      setLastInviteLink(created.inviteUrl || null);

      if (created.inviteUrl && typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(created.inviteUrl);
        } catch {
          // ignore clipboard errors
        }
      }
    });
  }, [canCreateInvites, canManageTeam, inviteDraft, runMutate]);

  const onSubmitQuiz = useCallback(async () => {
    if (!quizQuestions.length) {
      setWorkspaceError('Тест пока не настроен. Добавьте вопросы в разделе «Тесты».');
      return;
    }

    const hasMissingAnswers = quizQuestions.some((question) => {
      const key = String(question.id);
      return typeof quizAnswers[key] !== 'number';
    });
    if (hasMissingAnswers) {
      setWorkspaceError('Ответь на все вопросы перед завершением теста.');
      return;
    }

    if (hasEstablishment) {
      await runMutate('quiz:submit', async () => {
        const result = await submitQuizAttempt({
          answers: quizAnswers,
        });
        const updated = [result.score, ...quizHistory].slice(0, 10);
        setQuizHistory(updated);
        setQuizSubmitted(true);
        try {
          window.localStorage.setItem(quizStorageKey, JSON.stringify(updated));
        } catch {
          // ignore
        }
      });
    }
  }, [hasEstablishment, quizAnswers, quizHistory, quizQuestions, quizStorageKey, runMutate]);

  const toggleDocumentAck = useCallback((code: string) => {
    setDocAcks((prev) => {
      const next = {
        ...prev,
        [code]: !prev[code],
      };

      try {
        window.localStorage.setItem(docStorageKey, JSON.stringify(next));
      } catch {
        // ignore
      }

      return next;
    });
  }, [docStorageKey]);

  const isBusy = (key: string) => busyAction === key;

  const moduleNav = (item: WorkspaceModule) => (
    <button
      key={item.id}
      type="button"
      className={`wsv-nav__item${item.id === activeModule ? ' wsv-nav__item--active' : ''}`}
      onClick={() => setActiveModule(item.id)}
    >
      <span className="wsv-nav__icon">{item.icon}</span>
      <span className="wsv-nav__text">
        <strong>{item.label}</strong>
        <small>{item.subtitle}</small>
      </span>
    </button>
  );

  const renderEstablishmentRequired = () => (
    <SectionCard title="Сначала создайте заведение">
      <div className="wsv-establish">
        <p>
          Чтобы открыть технологические карты, калькуляторы и заявки, привяжи аккаунт к заведению.
        </p>
        {canCreateEstablishment ? (
          <div className="wsv-row">
            <input
              value={newEstablishmentName}
              onChange={(e) => setNewEstablishmentName(e.target.value)}
              placeholder="Название бара"
            />
            <button
              type="button"
              className="wsv-btn wsv-btn--primary"
              onClick={() => void onCreateEstablishment()}
              disabled={isBusy('establishment:create')}
            >
              {isBusy('establishment:create') ? 'Создаю…' : 'Создать заведение'}
            </button>
          </div>
        ) : (
          <p>Нет прав на создание заведения. Обратись к менеджеру или администратору.</p>
        )}
      </div>
    </SectionCard>
  );

  const renderDashboard = () => {
    if (!hasEstablishment) {
      return (
        <div className="wsv-grid">
          {renderEstablishmentRequired()}
          <SectionCard title="Что уже готово">
            <ul className="wsv-list">
              <li>Авторизация с защищённой сессией и CSRF</li>
              <li>PWA-режим и адаптивный workspace</li>
              <li>Базовые модули обучения и документации</li>
            </ul>
          </SectionCard>
        </div>
      );
    }

    const draftRequests = requests.filter((row) => row.status === 'draft').length;
    const activeRequests = requests.filter((row) => row.status === 'submitted' || row.status === 'in_progress').length;

    return (
      <div className="wsv-grid">
        <section className="wsv-metrics-grid">
          <MetricCard
            label="Ингредиенты"
            value={String(ingredients.length)}
            note="В базе себестоимости"
          />
          <MetricCard
            label="Заготовки"
            value={String(preparations.length)}
            note="Техкарты prep"
          />
          <MetricCard
            label="Коктейли"
            value={String(cocktails.length)}
            note="Карты подачи и рецептуры"
          />
          <MetricCard
            label="Заявки"
            value={`${activeRequests}`}
            note={`Черновиков: ${draftRequests}`}
          />
        </section>

        <SectionCard title="Быстрые действия">
          <div className="wsv-actions">
            {canReadIngredients ? (
              <button type="button" className="wsv-btn" onClick={() => setActiveModule('ingredients')}>
                Добавить ингредиент
              </button>
            ) : null}
            {canReadPreparations ? (
              <button type="button" className="wsv-btn" onClick={() => setActiveModule('preparations')}>
                Создать заготовку
              </button>
            ) : null}
            {canReadCocktails ? (
              <button type="button" className="wsv-btn" onClick={() => setActiveModule('cocktails')}>
                Добавить коктейль
              </button>
            ) : null}
            {canReadForms ? (
              <button type="button" className="wsv-btn" onClick={() => setActiveModule('forms')}>
                Открыть заявки
              </button>
            ) : null}
          </div>
        </SectionCard>

        <SectionCard title="Ближайший фокус смены">
          <ul className="wsv-list">
            <li>Проверь себестоимость и обнови карточки с устаревшими ценами.</li>
            <li>Проведи один обучающий мини-тест для текущей смены.</li>
            <li>Закрой открытые заявки на поставки до конца дня.</li>
          </ul>
        </SectionCard>
      </div>
    );
  };

  const renderIngredients = () => {
    if (!hasEstablishment) return renderEstablishmentRequired();
    if (!canReadIngredients) {
      return <EmptyState title="Нет доступа" subtitle="У тебя нет прав на просмотр ингредиентов." />;
    }

    return (
      <div className="wsv-grid wsv-grid--dual">
        {canCreateIngredients || canUpdateIngredients ? (
          <SectionCard
            title={editingIngredientId ? 'Редактировать ингредиент' : 'Новый ингредиент'}
            right={
              editingIngredientId ? (
                <button type="button" className="wsv-btn" onClick={resetIngredientDraft}>Отмена</button>
              ) : undefined
            }
          >
            <div className="wsv-form-grid">
              <label>
                <span>Название</span>
                <input
                  value={ingredientDraft.name}
                  onChange={(e) => setIngredientDraft((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="Сахар тростниковый"
                />
              </label>
              <label>
                <span>Объём упаковки</span>
                <input
                  value={ingredientDraft.packVolume}
                  onChange={(e) => setIngredientDraft((prev) => ({ ...prev, packVolume: e.target.value }))}
                  placeholder="1.0"
                />
              </label>
              <label>
                <span>Стоимость упаковки</span>
                <input
                  value={ingredientDraft.packCost}
                  onChange={(e) => setIngredientDraft((prev) => ({ ...prev, packCost: e.target.value }))}
                  placeholder="550"
                />
              </label>
              <label>
                <span>Единица</span>
                <select
                  value={normalizeUnitOption(ingredientDraft.unit) || 'л'}
                  onChange={(e) => setIngredientDraft((prev) => ({ ...prev, unit: e.target.value }))}
                >
                  {UNIT_OPTIONS.map((unit) => (
                    <option value={unit} key={unit}>
                      {UNIT_LABELS[unit]}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="wsv-row">
              <button
                type="button"
                className="wsv-btn wsv-btn--primary"
                onClick={() => void onSubmitIngredient()}
                disabled={isBusy('ingredient:create') || isBusy('ingredient:update')}
              >
                {editingIngredientId
                  ? isBusy('ingredient:update')
                    ? 'Сохраняю…'
                    : 'Сохранить'
                  : isBusy('ingredient:create')
                    ? 'Добавляю…'
                    : 'Добавить'}
              </button>
            </div>
          </SectionCard>
        ) : null}

        <SectionCard title="Список ингредиентов">
          {filteredIngredients.length ? (
            <div className="wsv-table-wrap">
              <table className="wsv-table">
                <thead>
                  <tr>
                    <th>Название</th>
                    <th>Упаковка</th>
                    <th>Себестоимость / ед.</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {filteredIngredients.map((row) => (
                    <tr key={row.id}>
                      <td>{row.name}</td>
                      <td>{formatValue(row.packVolume, row.unit)}</td>
                      <td>{formatMoney(row.costPerUnit)}</td>
                      <td className="wsv-table__actions">
                        {canUpdateIngredients ? (
                          <button
                            type="button"
                            className="wsv-link"
                            onClick={() => {
                              setEditingIngredientId(row.id);
                              setIngredientDraft({
                                name: row.name,
                                packVolume: row.packVolume?.toString() || '',
                                packCost: row.packCost?.toString() || '',
                                unit: normalizeUnitOption(row.unit) || 'л',
                              });
                            }}
                          >
                            Изменить
                          </button>
                        ) : null}
                        {canDeleteIngredients ? (
                          <button
                            type="button"
                            className="wsv-link wsv-link--danger"
                            onClick={() => {
                              if (!window.confirm(`Удалить ингредиент «${row.name}»?`)) return;
                              void runMutate('ingredient:delete', async () => {
                                await deleteIngredient(row.id);
                              });
                            }}
                            disabled={isBusy('ingredient:delete')}
                          >
                            Удалить
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="Нет ингредиентов" subtitle="Добавь первые позиции для расчёта себестоимости." />
          )}
        </SectionCard>
      </div>
    );
  };

  const renderPreparationComponentsEditor = (
    components: DraftComponent[],
    onChange: (components: DraftComponent[]) => void
  ) => {
    const updateRow = (index: number, patch: Partial<DraftComponent>) => {
      onChange(
        components.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row))
      );
    };

    const removeRow = (index: number) => {
      if (components.length === 1) return;
      onChange(components.filter((_, rowIndex) => rowIndex !== index));
    };

    return (
      <div className="wsv-stack">
        {components.map((component, index) => {
          const source = component.type === 'ingredient'
            ? ingredients.map((item) => ({
                id: item.id,
                name: item.name,
                unit: normalizeUnitOption(item.unit) || defaultComponentUnit('ingredient'),
              }))
            : preparations.map((item) => ({
                id: item.id,
                name: item.title,
                unit: normalizeUnitOption(item.yieldUnit) || defaultComponentUnit('preparation'),
              }));

          const selectedSource = source.find((row) => String(row.id) === component.id) || null;
          const selectedUnit = normalizeUnitOption(component.unit) || defaultComponentUnit(component.type);
          const needle = component.query.trim().toLowerCase();
          const suggestions = needle
            ? source
                .filter((row) => row.name.toLowerCase().includes(needle))
                .slice(0, 8)
            : [];
          const showSuggestions = suggestions.length > 0 && (!selectedSource || selectedSource.name !== component.query);

          return (
            <div className="wsv-component" key={`component-${index}`}>
              <select
                value={component.type}
                onChange={(e) => {
                  const nextType = e.target.value as 'ingredient' | 'preparation';
                  updateRow(index, {
                    type: nextType,
                    id: '',
                    query: '',
                    unit: defaultComponentUnit(nextType),
                  });
                }}
              >
                <option value="ingredient">Ингредиент</option>
                <option value="preparation">Заготовка</option>
              </select>

              <div className="wsv-component__source">
                <input
                  value={component.query}
                  onChange={(e) => updateRow(index, { query: e.target.value, id: '' })}
                  placeholder={component.type === 'ingredient' ? 'Начни вводить ингредиент' : 'Начни вводить заготовку'}
                />
                {showSuggestions ? (
                  <div className="wsv-suggest">
                    {suggestions.map((row) => (
                      <button
                        type="button"
                        key={`${component.type}-${row.id}`}
                        className="wsv-suggest__item"
                        onMouseDown={(event) => {
                          event.preventDefault();
                          updateRow(index, {
                            id: String(row.id),
                            query: row.name,
                            unit: row.unit,
                          });
                        }}
                      >
                        <span>{row.name}</span>
                        <small>{UNIT_LABELS[row.unit]}</small>
                      </button>
                    ))}
                  </div>
                ) : null}
                {component.query && !component.id ? (
                  <div className="wsv-component__hint">Выбери элемент из выпадающего списка.</div>
                ) : null}
              </div>

              <input
                value={component.amount}
                onChange={(e) => updateRow(index, { amount: e.target.value })}
                placeholder="Количество"
              />

              <select
                value={selectedUnit}
                onChange={(e) => updateRow(index, { unit: e.target.value })}
              >
                {UNIT_OPTIONS.map((unit) => (
                  <option value={unit} key={unit}>
                    {UNIT_LABELS[unit]}
                  </option>
                ))}
              </select>

              <button
                type="button"
                className="wsv-link wsv-link--danger"
                onClick={() => removeRow(index)}
              >
                ✕
              </button>
            </div>
          );
        })}

        <button
          type="button"
          className="wsv-btn"
          onClick={() => onChange([...components, defaultDraftComponent()])}
        >
          + Добавить компонент
        </button>
      </div>
    );
  };

  const renderPreparationBreakdown = (items: PreparationCalc['breakdown'], depth = 0): React.ReactNode => (
    <div className="wsv-breakdown">
      {items.map((item, index) => (
        <div key={`${depth}-${item.type}-${item.id}-${index}`}>
          <div
            className="wsv-breakdown__row"
            style={{ paddingLeft: `${10 + depth * 14}px` }}
          >
            <span>{item.type === 'preparation' ? `Заготовка: ${item.name}` : item.name}</span>
            <span>{formatValue(item.amount, item.unit)}</span>
            <span>{formatMoney(item.cost)}</span>
          </div>
          {item.type === 'preparation' && item.expanded?.length ? (
            <details className="wsv-breakdown__details">
              <summary>Показать вложенный состав</summary>
              {renderPreparationBreakdown(item.expanded, depth + 1)}
            </details>
          ) : null}
        </div>
      ))}
    </div>
  );

  const renderPreparations = () => {
    if (!hasEstablishment) return renderEstablishmentRequired();
    if (!canReadPreparations) {
      return <EmptyState title="Нет доступа" subtitle="У тебя нет прав на просмотр заготовок." />;
    }

    return (
      <div className="wsv-grid wsv-grid--dual">
        {canCreatePreparations ? (
        <SectionCard title="Новая заготовка">
          <div className="wsv-form-grid">
            <label>
              <span>Название</span>
              <input
                value={preparationDraft.title}
                onChange={(e) => setPreparationDraft((prev) => ({ ...prev, title: e.target.value }))}
                placeholder="Сироп ромашка-мёд"
              />
            </label>
            <label>
              <span>Выход</span>
              <input
                value={preparationDraft.yieldValue}
                onChange={(e) => setPreparationDraft((prev) => ({ ...prev, yieldValue: e.target.value }))}
                placeholder="1.2"
              />
            </label>
            <label>
              <span>Единица выхода</span>
              <select
                value={normalizeUnitOption(preparationDraft.yieldUnit) || 'л'}
                onChange={(e) => setPreparationDraft((prev) => ({ ...prev, yieldUnit: e.target.value }))}
              >
                {UNIT_OPTIONS.map((unit) => (
                  <option value={unit} key={unit}>
                    {UNIT_LABELS[unit]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Объём до фильтрации (опц.)</span>
              <input
                value={preparationDraft.altVolume}
                onChange={(e) => setPreparationDraft((prev) => ({ ...prev, altVolume: e.target.value }))}
                placeholder="1.5"
              />
            </label>
          </div>

          {renderPreparationComponentsEditor(preparationDraft.components, (components) => {
            setPreparationDraft((prev) => ({ ...prev, components }));
          })}

          <div className="wsv-row">
            <button
              type="button"
              className="wsv-btn wsv-btn--primary"
              onClick={() => void onSubmitPreparation()}
              disabled={isBusy('preparation:create')}
            >
              {isBusy('preparation:create') ? 'Сохраняю…' : 'Создать заготовку'}
            </button>
            <button type="button" className="wsv-btn" onClick={resetPreparationDraft}>Сбросить</button>
          </div>
        </SectionCard>
        ) : null}

        <SectionCard title="Техкарты заготовок">
          {filteredPreparations.length ? (
            <div className="wsv-cards">
              {filteredPreparations.map((row) => (
                <article
                  key={row.id}
                  className={`wsv-mini-card${selectedPrepId === row.id ? ' wsv-mini-card--active' : ''}`}
                >
                  <div className="wsv-mini-card__head">
                    <strong>{row.title}</strong>
                    <span>{formatMoney(row.costPerUnit)}</span>
                  </div>
                  <div className="wsv-mini-card__meta">Выход: {formatValue(row.yieldValue, row.yieldUnit)}</div>
                  {row.altVolume !== null ? (
                    <div className="wsv-mini-card__meta">
                      До фильтрации: {formatValue(row.altVolume, row.yieldUnit)}
                    </div>
                  ) : null}
                  <div className="wsv-row">
                    <button type="button" className="wsv-link" onClick={() => void onSelectPreparation(row.id)}>
                      Рассчитать
                    </button>
                    {canDeletePreparations ? (
                      <button
                        type="button"
                        className="wsv-link wsv-link--danger"
                        onClick={() => {
                          if (!window.confirm(`Удалить заготовку «${row.title}»?`)) return;
                          void runMutate('preparation:delete', async () => {
                            await deletePreparation(row.id);
                            if (selectedPrepId === row.id) {
                              setSelectedPrepId(null);
                              setPrepCalc(null);
                            }
                          });
                        }}
                        disabled={isBusy('preparation:delete')}
                      >
                        Удалить
                      </button>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState title="Нет заготовок" subtitle="Создай первую техкарту prep и зафиксируй выход." />
          )}

          {selectedPrepId && prepCalc ? (
            <div className="wsv-calc">
              <div className="wsv-calc__head">
                <h4>{prepCalc.title}</h4>
                <span>Себестоимость расчёта: {formatMoney(prepCalc.cost)}</span>
              </div>
              <div className="wsv-mini-card__meta">
                Режим: {prepCalcBasisLabel(prepCalc.calculationBasis)}
              </div>
              {prepCalc.baseCost !== undefined && prepCalc.baseCost !== prepCalc.cost ? (
                <div className="wsv-mini-card__meta">Базовая себестоимость рецепта: {formatMoney(prepCalc.baseCost)}</div>
              ) : null}

              <div className="wsv-calc-modes">
                <div className="wsv-calc-mode">
                  <strong>По выходу</strong>
                  <div className="wsv-row">
                    <input
                      value={prepCalcVolume}
                      onChange={(e) => setPrepCalcVolume(e.target.value)}
                      placeholder="Целевой выход (например 2.5)"
                    />
                    <button
                      type="button"
                      className="wsv-btn"
                      onClick={() => {
                        const volume = parseNumberInput(prepCalcVolume);
                        if (volume === null || volume <= 0) {
                          setWorkspaceError('Укажи корректный целевой выход.');
                          return;
                        }
                        void loadPreparationCalc(selectedPrepId, { volume });
                      }}
                      disabled={prepCalcLoading}
                    >
                      {prepCalcLoading ? 'Считаю…' : 'Рассчитать'}
                    </button>
                  </div>
                </div>

                {prepCalc.altVolume !== null && prepCalc.altVolume > 0 ? (
                  <div className="wsv-calc-mode">
                    <strong>По объёму до фильтрации</strong>
                    <div className="wsv-row">
                      <input
                        value={prepCalcAltVolume}
                        onChange={(e) => setPrepCalcAltVolume(e.target.value)}
                        placeholder="Стартовый объём (например 4)"
                      />
                      <button
                        type="button"
                        className="wsv-btn"
                        onClick={() => {
                          const altVolume = parseNumberInput(prepCalcAltVolume);
                          if (altVolume === null || altVolume <= 0) {
                            setWorkspaceError('Укажи корректный объём до фильтрации.');
                            return;
                          }
                          void loadPreparationCalc(selectedPrepId, { altVolume });
                        }}
                        disabled={prepCalcLoading}
                      >
                        {prepCalcLoading ? 'Считаю…' : 'Рассчитать'}
                      </button>
                    </div>
                  </div>
                ) : null}

                <div className="wsv-calc-mode">
                  <strong>По известному компоненту</strong>
                  <div className="wsv-row">
                    <select
                      value={prepCalcKnownComponentIndex}
                      onChange={(e) => setPrepCalcKnownComponentIndex(e.target.value)}
                    >
                      <option value="">Выбери компонент</option>
                      {prepCalc.breakdown.map((item, index) => (
                        <option key={`${item.type}-${item.id}-${index}`} value={String(index)}>
                          {item.name} ({formatValue(item.amount, item.unit)})
                        </option>
                      ))}
                    </select>
                    <input
                      value={prepCalcKnownAmount}
                      onChange={(e) => setPrepCalcKnownAmount(e.target.value)}
                      placeholder="Известное количество"
                    />
                    <button
                      type="button"
                      className="wsv-btn"
                      onClick={() => {
                        const knownAmount = parseNumberInput(prepCalcKnownAmount);
                        const knownComponentIndex = Number(prepCalcKnownComponentIndex);
                        if (!Number.isInteger(knownComponentIndex) || knownComponentIndex < 0) {
                          setWorkspaceError('Сначала выбери компонент для расчёта.');
                          return;
                        }
                        if (knownAmount === null || knownAmount <= 0) {
                          setWorkspaceError('Укажи корректное известное количество компонента.');
                          return;
                        }
                        void loadPreparationCalc(selectedPrepId, {
                          knownComponentIndex,
                          knownAmount,
                        });
                      }}
                      disabled={prepCalcLoading}
                    >
                      {prepCalcLoading ? 'Считаю…' : 'Рассчитать'}
                    </button>
                  </div>
                </div>
              </div>

              <div className="wsv-row">
                <button
                  type="button"
                  className="wsv-btn"
                  onClick={() => {
                    setPrepCalcVolume('');
                    setPrepCalcAltVolume('');
                    setPrepCalcKnownComponentIndex('');
                    setPrepCalcKnownAmount('');
                    void loadPreparationCalc(selectedPrepId);
                  }}
                  disabled={prepCalcLoading}
                >
                  Сбросить к базовому рецепту
                </button>
              </div>

              <div className="wsv-listing">
                <div>Базовый выход: {formatValue(prepCalc.yieldValue, prepCalc.yieldUnit)}</div>
                <div>Себестоимость / ед.: {formatMoney(prepCalc.costPerUnit)}</div>
                {prepCalc.altVolume !== null ? (
                  <div>Базовый объём до фильтрации: {formatValue(prepCalc.altVolume, prepCalc.yieldUnit)}</div>
                ) : null}
                {prepCalc.requestedVolume !== undefined ? (
                  <div>Расчётный выход: {formatValue(prepCalc.requestedVolume, prepCalc.yieldUnit)}</div>
                ) : null}
                {prepCalc.requestedAltVolume !== undefined ? (
                  <div>
                    Расчётный объём до фильтрации: {formatValue(prepCalc.requestedAltVolume, prepCalc.yieldUnit)}
                  </div>
                ) : null}
                {prepCalc.costForRequested !== undefined ? (
                  <div>Себестоимость расчётного объёма: {formatMoney(prepCalc.costForRequested)}</div>
                ) : prepCalc.costForVolume !== undefined ? (
                  <div>Себестоимость расчётного объёма: {formatMoney(prepCalc.costForVolume)}</div>
                ) : null}
              </div>

              {renderPreparationBreakdown(prepCalc.breakdown)}
            </div>
          ) : null}
        </SectionCard>
      </div>
    );
  };

  const renderCocktails = () => {
    if (!hasEstablishment) return renderEstablishmentRequired();
    if (!canReadCocktails) {
      return <EmptyState title="Нет доступа" subtitle="У тебя нет прав на просмотр коктейльных карт." />;
    }

    return (
      <div className="wsv-grid wsv-grid--dual">
        {canCreateCocktails ? (
        <SectionCard title="Новая карточка коктейля">
          <div className="wsv-form-grid">
            <label>
              <span>Название</span>
              <input
                value={cocktailDraft.title}
                onChange={(e) => setCocktailDraft((prev) => ({ ...prev, title: e.target.value }))}
                placeholder="Basil Smash"
              />
            </label>
            <label>
              <span>Категория</span>
              <select
                value={cocktailDraft.category}
                onChange={(e) => setCocktailDraft((prev) => ({ ...prev, category: e.target.value }))}
              >
                {Object.entries(COCKTAIL_CATEGORY_LABELS).map(([value, label]) => (
                  <option value={value} key={value}>{label}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Выход</span>
              <input
                value={cocktailDraft.outputValue}
                onChange={(e) => setCocktailDraft((prev) => ({ ...prev, outputValue: e.target.value }))}
                placeholder="0.16"
              />
            </label>
            <label>
              <span>Ед. выхода</span>
              <select
                value={normalizeUnitOption(cocktailDraft.outputUnit) || 'л'}
                onChange={(e) => setCocktailDraft((prev) => ({ ...prev, outputUnit: e.target.value }))}
              >
                {UNIT_OPTIONS.map((unit) => (
                  <option value={unit} key={unit}>
                    {UNIT_LABELS[unit]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Подача</span>
              <input
                value={cocktailDraft.serving}
                onChange={(e) => setCocktailDraft((prev) => ({ ...prev, serving: e.target.value }))}
                placeholder="Купе, двойной стрейн"
              />
            </label>
            <label>
              <span>Украшение</span>
              <input
                value={cocktailDraft.garnish}
                onChange={(e) => setCocktailDraft((prev) => ({ ...prev, garnish: e.target.value }))}
                placeholder="Лист базилика"
              />
            </label>
            <label>
              <span>Метод</span>
              <input
                value={cocktailDraft.method}
                onChange={(e) => setCocktailDraft((prev) => ({ ...prev, method: e.target.value }))}
                placeholder="Shake"
              />
            </label>
            <label>
              <span>Фото URL</span>
              <input
                value={cocktailDraft.photoUrl}
                onChange={(e) => setCocktailDraft((prev) => ({ ...prev, photoUrl: e.target.value }))}
                placeholder="https://..."
              />
            </label>
          </div>

          <label className="wsv-block">
            <span>Комментарий/стандарт</span>
            <textarea
              value={cocktailDraft.notes}
              onChange={(e) => setCocktailDraft((prev) => ({ ...prev, notes: e.target.value }))}
              placeholder="Температура подачи, лед, скорость сборки"
            />
          </label>

          {renderPreparationComponentsEditor(cocktailDraft.components, (components) => {
            setCocktailDraft((prev) => ({ ...prev, components }));
          })}

          <div className="wsv-row">
            <button
              type="button"
              className="wsv-btn wsv-btn--primary"
              onClick={() => void onSubmitCocktail()}
              disabled={isBusy('cocktail:create')}
            >
              {isBusy('cocktail:create') ? 'Сохраняю…' : 'Создать карточку'}
            </button>
            <button type="button" className="wsv-btn" onClick={resetCocktailDraft}>Сбросить</button>
          </div>
        </SectionCard>
        ) : null}

        <SectionCard title="Карты коктейлей">
          {filteredCocktails.length ? (
            <div className="wsv-cards">
              {filteredCocktails.map((row) => (
                <article
                  key={row.id}
                  className={`wsv-mini-card${selectedCocktailId === row.id ? ' wsv-mini-card--active' : ''}`}
                >
                  <div className="wsv-mini-card__head">
                    <strong>{row.title}</strong>
                    <span>{COCKTAIL_CATEGORY_LABELS[row.category] || row.category}</span>
                  </div>
                  <div className="wsv-mini-card__meta">
                    Выход: {formatValue(row.outputValue, row.outputUnit)}
                  </div>
                  <div className="wsv-mini-card__meta">Подача: {row.serving || '—'}</div>
                  <div className="wsv-mini-card__meta">Украшение: {row.garnish || '—'}</div>
                  <div className="wsv-row">
                    <button type="button" className="wsv-link" onClick={() => void onSelectCocktail(row.id)}>
                      Открыть
                    </button>
                    {canDeleteCocktails ? (
                      <button
                        type="button"
                        className="wsv-link wsv-link--danger"
                        onClick={() => {
                          if (!window.confirm(`Удалить карточку «${row.title}»?`)) return;
                          void runMutate('cocktail:delete', async () => {
                            await deleteCocktail(row.id);
                            if (selectedCocktailId === row.id) {
                              setSelectedCocktailId(null);
                              setCocktailCalc(null);
                            }
                          });
                        }}
                        disabled={isBusy('cocktail:delete')}
                      >
                        Удалить
                      </button>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState title="Нет коктейлей" subtitle="Добавь первую техкарту с подачей и garnish." />
          )}

          {selectedCocktailId && cocktailCalc ? (
            <div className="wsv-calc">
              <div className="wsv-calc__head">
                <h4>{cocktailCalc.title}</h4>
                <span>Себестоимость: {formatMoney(cocktailCalc.totalCost)}</span>
              </div>

              <div className="wsv-listing">
                <div>Выход: {formatValue(cocktailCalc.outputValue, cocktailCalc.outputUnit)}</div>
                <div>Себестоимость / ед.: {formatMoney(cocktailCalc.costPerOutput)}</div>
                <div>Метод: {cocktailCalc.method || '—'}</div>
                <div>Подача: {cocktailCalc.serving || '—'}</div>
                <div>Украшение: {cocktailCalc.garnish || '—'}</div>
              </div>

              <div className="wsv-row">
                <input
                  value={cocktailOutput}
                  onChange={(e) => setCocktailOutput(e.target.value)}
                  placeholder="Расчёт на выход (например 0.8)"
                />
                <button
                  type="button"
                  className="wsv-btn"
                  onClick={() => {
                    const output = parseNumberInput(cocktailOutput);
                    void loadCocktailCalc(selectedCocktailId, output ?? undefined);
                  }}
                  disabled={cocktailCalcLoading}
                >
                  {cocktailCalcLoading ? 'Считаю…' : 'Пересчитать'}
                </button>
              </div>

              {cocktailCalc.costForRequestedOutput !== undefined ? (
                <div className="wsv-listing">
                  <div>Себестоимость заданного выхода: {formatMoney(cocktailCalc.costForRequestedOutput)}</div>
                </div>
              ) : null}

              {cocktailCalc.photoUrl ? (
                <a
                  href={cocktailCalc.photoUrl.startsWith('/v1/') ? absoluteApiUrl(cocktailCalc.photoUrl) : cocktailCalc.photoUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="wsv-link"
                >
                  Открыть фото подачи
                </a>
              ) : null}

              {canUploadCocktailPhoto && selectedCocktailId ? (
                <div className="wsv-row">
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(e) => setSelectedCocktailPhoto(e.target.files?.[0] || null)}
                  />
                  <button
                    type="button"
                    className="wsv-btn"
                    disabled={!selectedCocktailPhoto || isBusy('cocktail:photo')}
                    onClick={() => {
                      if (!selectedCocktailPhoto) return;
                      void runMutate('cocktail:photo', async () => {
                        await uploadCocktailPhoto(selectedCocktailId, selectedCocktailPhoto);
                        setSelectedCocktailPhoto(null);
                        await loadCocktailCalc(selectedCocktailId);
                      });
                    }}
                  >
                    {isBusy('cocktail:photo') ? 'Загружаю фото…' : 'Загрузить фото'}
                  </button>
                </div>
              ) : null}

              <div className="wsv-breakdown">
                {cocktailCalc.breakdown.map((item) => (
                  <div key={`${item.type}-${item.id}-${item.name}`} className="wsv-breakdown__row">
                    <span>{item.name}</span>
                    <span>{formatValue(item.amount, item.unit)}</span>
                    <span>{formatMoney(item.cost)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </SectionCard>
      </div>
    );
  };

  const renderTraining = () => {
    if (!hasEstablishment) return renderEstablishmentRequired();
    if (!canReadTraining) {
      return <EmptyState title="Нет доступа" subtitle="У тебя нет прав на просмотр обучения." />;
    }

    return (
      <div className="wsv-grid">
        {canManageTraining ? (
          <SectionCard
            title={editingTopicId ? 'Редактирование блока обучения' : 'Новый учебный блок'}
            right={
              editingTopicId ? (
                <button type="button" className="wsv-btn" onClick={resetTopicDraft}>Отмена</button>
              ) : undefined
            }
          >
            <div className="wsv-form-grid">
              <label>
                <span>Категория</span>
                <input
                  value={topicDraft.category}
                  onChange={(e) => setTopicDraft((prev) => ({ ...prev, category: e.target.value }))}
                  placeholder="Алкоголь"
                />
              </label>
              <label>
                <span>Заголовок</span>
                <input
                  value={topicDraft.title}
                  onChange={(e) => setTopicDraft((prev) => ({ ...prev, title: e.target.value }))}
                  placeholder="Базовые крепкие категории"
                />
              </label>
              <label>
                <span>Порядок</span>
                <input
                  value={topicDraft.position}
                  onChange={(e) => setTopicDraft((prev) => ({ ...prev, position: e.target.value }))}
                  placeholder="100"
                />
              </label>
              <label className="wsv-field--wide">
                <span>Краткое описание</span>
                <textarea
                  value={topicDraft.summary}
                  onChange={(e) => setTopicDraft((prev) => ({ ...prev, summary: e.target.value }))}
                  rows={2}
                  placeholder="Короткий конспект блока"
                />
              </label>
              <label className="wsv-field--wide">
                <span>Тезисы (по одному на строку)</span>
                <textarea
                  value={topicDraft.bullets}
                  onChange={(e) => setTopicDraft((prev) => ({ ...prev, bullets: e.target.value }))}
                  rows={5}
                  placeholder={'Профиль сырья и дистилляции\\nКак объяснять гостю стиль напитка'}
                />
              </label>
            </div>
            <div className="wsv-row">
              <button
                type="button"
                className="wsv-btn wsv-btn--primary"
                onClick={() => void onSubmitTopic()}
                disabled={isBusy('training:create') || isBusy('training:update')}
              >
                {editingTopicId
                  ? isBusy('training:update')
                    ? 'Сохраняю…'
                    : 'Сохранить'
                  : isBusy('training:create')
                    ? 'Создаю…'
                    : 'Создать блок'}
              </button>
            </div>
          </SectionCard>
        ) : null}

        <SectionCard title="Учебные блоки">
          {filteredTopics.length ? (
            <div className="wsv-cards">
              {filteredTopics.map((topic) => (
                <article key={topic.id} className="wsv-topic">
                  <div className="wsv-topic__category">{topic.category}</div>
                  <h4>{topic.title}</h4>
                  <p>{topic.summary}</p>
                  <ul className="wsv-list">
                    {topic.bullets.map((line, idx) => (
                      <li key={`${topic.id}-bullet-${idx}`}>{line}</li>
                    ))}
                  </ul>

                  {canManageTraining ? (
                    <div className="wsv-row">
                      <button
                        type="button"
                        className="wsv-link"
                        onClick={() => {
                          setEditingTopicId(topic.id);
                          setTopicDraft({
                            category: topic.category,
                            title: topic.title,
                            summary: topic.summary,
                            bullets: topic.bullets.join('\n'),
                            position: String(topic.position || 100),
                          });
                        }}
                      >
                        Изменить
                      </button>
                      <button
                        type="button"
                        className="wsv-link wsv-link--danger"
                        onClick={() => {
                          if (!window.confirm(`Удалить учебный блок «${topic.title}»?`)) return;
                          void runMutate(`training:delete:${topic.id}`, async () => {
                            await deleteTrainingTopic(topic.id);
                            if (editingTopicId === topic.id) {
                              resetTopicDraft();
                            }
                          });
                        }}
                        disabled={isBusy(`training:delete:${topic.id}`)}
                      >
                        Удалить
                      </button>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          ) : (
            <EmptyState title="Пока нет учебных блоков" subtitle="Добавь первые материалы для обучения команды." />
          )}
        </SectionCard>
      </div>
    );
  };

  const renderTests = () => {
    if (!hasEstablishment) return renderEstablishmentRequired();
    if (!canTakeTests) {
      return <EmptyState title="Нет доступа" subtitle="У тебя нет прав на прохождение тестов." />;
    }

    const answeredCount = quizQuestions.reduce((acc, q) => {
      const key = String(q.id);
      return acc + (typeof quizAnswers[key] === 'number' ? 1 : 0);
    }, 0);

    const localKnownCorrect = canManageTests
      ? quizQuestions.reduce((acc, q) => {
          if (typeof q.correctOption !== 'number') return acc;
          const key = String(q.id);
          return acc + (quizAnswers[key] === q.correctOption ? 1 : 0);
        }, 0)
      : null;

    return (
      <div className="wsv-grid">
        {canManageTests ? (
          <SectionCard
            title={editingQuestionId ? 'Редактирование вопроса теста' : 'Новый вопрос теста'}
            right={
              editingQuestionId ? (
                <button type="button" className="wsv-btn" onClick={resetQuestionDraft}>Отмена</button>
              ) : undefined
            }
          >
            <div className="wsv-form-grid">
              <label className="wsv-field--wide">
                <span>Вопрос</span>
                <textarea
                  value={questionDraft.question}
                  onChange={(e) => setQuestionDraft((prev) => ({ ...prev, question: e.target.value }))}
                  rows={2}
                  placeholder="Какой метод чаще всего применяют для Manhattan?"
                />
              </label>
              <label className="wsv-field--wide">
                <span>Варианты ответов (по одному на строку)</span>
                <textarea
                  value={questionDraft.options}
                  onChange={(e) => setQuestionDraft((prev) => ({ ...prev, options: e.target.value }))}
                  rows={4}
                  placeholder={'Shake\\nStir\\nBuild\\nBlend'}
                />
              </label>
              <label>
                <span>Индекс правильного варианта (с нуля)</span>
                <input
                  value={questionDraft.correctOption}
                  onChange={(e) => setQuestionDraft((prev) => ({ ...prev, correctOption: e.target.value }))}
                  placeholder="0"
                />
              </label>
              <label>
                <span>Порядок</span>
                <input
                  value={questionDraft.position}
                  onChange={(e) => setQuestionDraft((prev) => ({ ...prev, position: e.target.value }))}
                  placeholder="100"
                />
              </label>
              <label className="wsv-field--wide">
                <span>Подсказка</span>
                <input
                  value={questionDraft.hint}
                  onChange={(e) => setQuestionDraft((prev) => ({ ...prev, hint: e.target.value }))}
                  placeholder="Короткая подсказка для сотрудника"
                />
              </label>
            </div>
            <div className="wsv-row">
              <button
                type="button"
                className="wsv-btn wsv-btn--primary"
                onClick={() => void onSubmitQuizQuestion()}
                disabled={isBusy('quiz:create') || isBusy('quiz:update')}
              >
                {editingQuestionId
                  ? isBusy('quiz:update')
                    ? 'Сохраняю…'
                    : 'Сохранить'
                  : isBusy('quiz:create')
                    ? 'Создаю…'
                    : 'Создать вопрос'}
              </button>
            </div>
          </SectionCard>
        ) : null}

        <SectionCard
          title="Проверка знаний"
          right={
            <button
              type="button"
              className="wsv-btn"
              onClick={() => {
                setQuizAnswers({});
                setQuizSubmitted(false);
              }}
            >
              Сбросить тест
            </button>
          }
        >
          {quizQuestions.length ? (
            <>
              <div className="wsv-quiz">
                {quizQuestions.map((question, index) => (
                  <article key={question.id} className="wsv-quiz__question">
                    <h4>{index + 1}. {question.question}</h4>
                    <div className="wsv-quiz__options">
                      {question.options.map((option, optionIndex) => {
                        const questionKey = String(question.id);
                        const checked = quizAnswers[questionKey] === optionIndex;
                        const showCorrect =
                          quizSubmitted &&
                          canManageTests &&
                          typeof question.correctOption === 'number' &&
                          question.correctOption === optionIndex;
                        return (
                          <label
                            key={`${question.id}-opt-${optionIndex}`}
                            className={`wsv-quiz__option${checked ? ' wsv-quiz__option--checked' : ''}${showCorrect ? ' wsv-quiz__option--correct' : ''}`}
                          >
                            <input
                              type="radio"
                              name={`quiz-${question.id}`}
                              value={String(optionIndex)}
                              checked={checked}
                              onChange={() => {
                                setQuizAnswers((prev) => ({ ...prev, [questionKey]: optionIndex }));
                                setQuizSubmitted(false);
                              }}
                            />
                            <span>{option}</span>
                          </label>
                        );
                      })}
                    </div>
                    {question.hint ? <p className="wsv-tip">Подсказка: {question.hint}</p> : null}
                  </article>
                ))}
              </div>

              <div className="wsv-row">
                <button type="button" className="wsv-btn wsv-btn--primary" onClick={onSubmitQuiz}>
                  Завершить тест
                </button>
                <span className="wsv-muted">Отвечено: {answeredCount} / {quizQuestions.length}</span>
                {localKnownCorrect !== null ? (
                  <span className="wsv-muted">Локально верно: {localKnownCorrect} / {quizQuestions.length}</span>
                ) : null}
              </div>

              {quizSubmitted && quizHistory.length ? (
                <div className="wsv-banner">
                  Результат сохранён: {quizHistory[0]}% (проверка выполнена на сервере)
                </div>
              ) : null}
            </>
          ) : (
            <EmptyState title="Тест не настроен" subtitle="Добавьте вопросы в банк тестов." />
          )}
        </SectionCard>

        {canManageTests ? (
          <SectionCard title="Банк вопросов теста">
            {filteredQuizQuestions.length ? (
              <div className="wsv-cards">
                {filteredQuizQuestions.map((question, idx) => (
                  <article key={question.id} className="wsv-topic">
                    <div className="wsv-topic__category">Вопрос #{idx + 1}</div>
                    <h4>{question.question}</h4>
                    <ul className="wsv-list">
                      {question.options.map((option, optIndex) => (
                        <li key={`${question.id}-${optIndex}`}>
                          {option}
                          {typeof question.correctOption === 'number' && question.correctOption === optIndex ? ' (верный)' : ''}
                        </li>
                      ))}
                    </ul>
                    {question.hint ? <p>{question.hint}</p> : null}
                    <div className="wsv-row">
                      <button
                        type="button"
                        className="wsv-link"
                        onClick={() => {
                          setEditingQuestionId(question.id);
                          setQuestionDraft({
                            question: question.question,
                            options: question.options.join('\n'),
                            correctOption: String(question.correctOption ?? 0),
                            hint: question.hint || '',
                            position: String(question.position || 100),
                          });
                        }}
                      >
                        Изменить
                      </button>
                      <button
                        type="button"
                        className="wsv-link wsv-link--danger"
                        onClick={() => {
                          if (!window.confirm('Удалить вопрос из теста?')) return;
                          void runMutate(`quiz:delete:${question.id}`, async () => {
                            await deleteQuizQuestion(question.id);
                            if (editingQuestionId === question.id) {
                              resetQuestionDraft();
                            }
                          });
                        }}
                        disabled={isBusy(`quiz:delete:${question.id}`)}
                      >
                        Удалить
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState title="Вопросов пока нет" subtitle="Создай первый вопрос для запуска тестов." />
            )}
          </SectionCard>
        ) : null}

        <SectionCard title="История прохождений">
          {quizHistory.length ? (
            <div className="wsv-history">
              {quizHistory.map((score, index) => (
                <div key={`${score}-${index}`} className="wsv-history__item">
                  <strong>{score}%</strong>
                  <span>Попытка #{index + 1}</span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="Пока без попыток" subtitle="Пройди тест, чтобы увидеть историю результатов." />
          )}
        </SectionCard>

        {quizSummary ? (
          <SectionCard title={canViewTeamAnalytics ? 'Аналитика команды' : 'Личная аналитика'}>
            <div className="wsv-metrics-grid">
              <MetricCard
                label="Попыток"
                value={String(quizSummary.totals.attempts || 0)}
                note={`Участников: ${quizSummary.totals.participants || 0}`}
              />
              <MetricCard
                label="Средний балл"
                value={`${quizSummary.totals.avg_score || 0}%`}
                note="По выбранной области доступа"
              />
              <MetricCard
                label="Лучший балл"
                value={`${quizSummary.totals.best_score || 0}%`}
                note="За весь период"
              />
              <MetricCard
                label="Режим"
                value={quizSummary.scope === 'team' ? 'Команда' : 'Личный'}
                note="Согласно permission-матрице"
              />
            </div>

            {quizSummary.latest.length ? (
              <div className="wsv-table-wrap">
                <table className="wsv-table">
                  <thead>
                    <tr>
                      <th>Сотрудник</th>
                      <th>Результат</th>
                      <th>Время</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quizSummary.latest.slice(0, 8).map((row) => (
                      <tr key={`quiz-latest-${row.id}`}>
                        <td>{row.user_name || row.user_phone || '—'}</td>
                        <td>{row.score}% ({row.correct_answers}/{row.total_questions})</td>
                        <td>{new Date(row.created_at).toLocaleString('ru-RU')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </SectionCard>
        ) : null}
      </div>
    );
  };

  const renderDocs = () => {
    if (!canReadDocs) {
      return <EmptyState title="Нет доступа" subtitle="У тебя нет прав на просмотр документации." />;
    }

    return (
    <div className="wsv-grid">
      <SectionCard
        title="База документов"
        right={
          canExportDocs ? (
            <button
              type="button"
              className="wsv-btn"
              onClick={() => {
                void runMutate('docs:export', async () => {
                  await downloadProtectedCsv('/v1/docs/export.csv', 'docs_export.csv');
                });
              }}
              disabled={isBusy('docs:export')}
            >
              {isBusy('docs:export') ? 'Готовлю CSV…' : 'Экспорт CSV'}
            </button>
          ) : undefined
        }
      >
        {filteredDocuments.length ? (
          <div className="wsv-docs">
            {filteredDocuments.map((doc) => (
              <article key={doc.code} className="wsv-doc">
                <div className="wsv-doc__head">
                  <strong>{doc.title}</strong>
                  <code>{doc.code}</code>
                </div>
                <p>{doc.description}</p>
                <label className="wsv-check">
                  <input
                    type="checkbox"
                    checked={!!docAcks[doc.code]}
                    onChange={() => toggleDocumentAck(doc.code)}
                  />
                  <span>Ознакомлен(а)</span>
                </label>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState title="Ничего не найдено" subtitle="Уточни поисковый запрос по коду или названию." />
        )}
      </SectionCard>
    </div>
    );
  };

  const renderForms = () => {
    if (!hasEstablishment) return renderEstablishmentRequired();
    if (!canReadForms) {
      return <EmptyState title="Нет доступа" subtitle="У тебя нет прав на модуль заявок." />;
    }

    return (
      <div className="wsv-grid wsv-grid--dual">
        {canCreateForms || canUpdateOwnForms || canUpdateAnyForms ? (
        <SectionCard
          title={editingRequestId ? 'Редактирование заявки' : 'Новая заявка'}
          right={
            editingRequestId ? (
              <button type="button" className="wsv-btn" onClick={resetRequestDraft}>Отмена</button>
            ) : undefined
          }
        >
          <div className="wsv-form-grid">
            <label>
              <span>Тип</span>
              <select
                value={requestDraft.kind}
                onChange={(e) => setRequestDraft((prev) => ({ ...prev, kind: e.target.value }))}
              >
                {requestTemplates.map((template) => (
                  <option value={template.kind} key={template.kind}>
                    {REQUEST_KIND_LABELS[template.kind] || template.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Статус при сохранении</span>
              <select
                value={requestDraft.status}
                onChange={(e) => setRequestDraft((prev) => ({
                  ...prev,
                  status: e.target.value === 'draft' ? 'draft' : 'submitted',
                }))}
              >
                <option value="submitted">Отправить</option>
                <option value="draft">Черновик</option>
              </select>
            </label>
            <label>
              <span>Заголовок</span>
              <input
                value={requestDraft.title}
                onChange={(e) => setRequestDraft((prev) => ({ ...prev, title: e.target.value }))}
                placeholder="Например: Срочный заказ фруктов"
              />
            </label>
          </div>

          <label className="wsv-block">
            <span>Содержание</span>
            <textarea
              value={requestDraft.detailsText}
              onChange={(e) => setRequestDraft((prev) => ({ ...prev, detailsText: e.target.value }))}
              placeholder="Кратко и по пунктам: что нужно, когда, в каком объёме"
            />
          </label>

          <div className="wsv-row">
            <button
              type="button"
              className="wsv-btn wsv-btn--primary"
              onClick={() => void onSubmitRequest()}
              disabled={isBusy('request:save')}
            >
              {isBusy('request:save') ? 'Сохраняю…' : editingRequestId ? 'Сохранить изменения' : 'Создать заявку'}
            </button>
          </div>
        </SectionCard>
        ) : null}

        <SectionCard
          title="Журнал заявок"
          right={
            canExportForms ? (
              <button
                type="button"
                className="wsv-btn"
                onClick={() => {
                  void runMutate('forms:export', async () => {
                    await downloadProtectedCsv('/v1/forms/export.csv', 'forms_export.csv');
                  });
                }}
                disabled={isBusy('forms:export')}
              >
                {isBusy('forms:export') ? 'Готовлю CSV…' : 'Экспорт CSV'}
              </button>
            ) : undefined
          }
        >
          {requests.length ? (
            <div className="wsv-cards">
              {requests.map((row) => (
                <article key={row.id} className="wsv-mini-card">
                  <div className="wsv-mini-card__head">
                    <strong>{row.title}</strong>
                    <span className={`wsv-status wsv-status--${row.status}`}>
                      {REQUEST_STATUS_LABELS[row.status] || row.status}
                    </span>
                  </div>

                  <div className="wsv-mini-card__meta">Тип: {REQUEST_KIND_LABELS[row.kind] || row.kind}</div>
                  <div className="wsv-mini-card__meta">Автор: {row.createdByName || row.createdByPhone || '—'}</div>
                  <div className="wsv-mini-card__meta">Создано: {new Date(row.createdAt).toLocaleString('ru-RU')}</div>

                  <p className="wsv-mini-card__text">{String((row.details as { text?: string }).text || 'Без деталей')}</p>

                  <div className="wsv-row">
                    {canUpdateAnyForms || (canUpdateOwnForms && row.createdBy === user?.sub) ? (
                      <button
                        type="button"
                        className="wsv-link"
                        onClick={() => {
                          setEditingRequestId(row.id);
                          setRequestDraft({
                            kind: row.kind,
                            title: row.title,
                            detailsText: String((row.details as { text?: string }).text || ''),
                            status: row.status === 'draft' ? 'draft' : 'submitted',
                          });
                        }}
                      >
                        Редактировать
                      </button>
                    ) : null}

                    {canManageFormStatuses ? (
                      <select
                        value={row.status}
                        onChange={(e) => {
                          const status = e.target.value;
                          void runMutate(`request:status:${row.id}`, async () => {
                            await updateRequestStatus(row.id, status);
                          });
                        }}
                      >
                        {REQUEST_STATUSES_FOR_MANAGER.map((status) => (
                          <option value={status} key={status}>
                            {REQUEST_STATUS_LABELS[status] || status}
                          </option>
                        ))}
                      </select>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState title="Заявок пока нет" subtitle="Создай первую заявку на поставку, списание или сервис." />
          )}
        </SectionCard>
      </div>
    );
  };

  const renderTeam = () => {
    if (!hasEstablishment) return renderEstablishmentRequired();
    if (!canReadTeam) {
      return <EmptyState title="Нет доступа" subtitle="У тебя нет прав на просмотр модуля команды." />;
    }

    const now = Date.now();

    return (
      <div className="wsv-grid wsv-grid--dual">
        <SectionCard title="Состав команды">
          {team.rows.length ? (
            <div className="wsv-table-wrap">
              <table className="wsv-table">
                <thead>
                  <tr>
                    <th>Сотрудник</th>
                    <th>Телефон</th>
                    <th>Роль</th>
                    <th>Добавлен</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {team.rows.map((member) => (
                    <tr key={member.membershipId}>
                      <td>{member.name || 'Без имени'} {member.surname || ''}</td>
                      <td>{member.phone}</td>
                      <td>
                        {canManageTeam ? (
                          <select
                            value={member.role}
                            onChange={(e) => {
                              const nextRole = e.target.value === 'manager' ? 'manager' : 'staff';
                              void runMutate(`team:role:${member.membershipId}`, async () => {
                                await updateTeamRole(member.membershipId, nextRole);
                              });
                            }}
                          >
                            <option value="manager">Менеджер</option>
                            <option value="staff">Сотрудник</option>
                          </select>
                        ) : (
                          roleLabel(member.role)
                        )}
                      </td>
                      <td>{new Date(member.createdAt).toLocaleDateString('ru-RU')}</td>
                      <td>
                        {canManageTeam && member.userId !== user?.sub ? (
                          <button
                            type="button"
                            className="wsv-link wsv-link--danger"
                            onClick={() => {
                              if (!window.confirm('Отозвать доступ у сотрудника?')) return;
                              void runMutate(`team:revoke:${member.membershipId}`, async () => {
                                await revokeTeamMember(member.membershipId);
                              });
                            }}
                          >
                            Удалить
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="Команда пуста" subtitle="После приглашения сотрудники появятся в этом списке." />
          )}
        </SectionCard>

        {canReadInvites || canCreateInvites ? (
          <SectionCard title="Приглашения и onboarding">
            {canCreateInvites ? (
              <>
                <div className="wsv-form-grid">
                  <label>
                    <span>Телефон сотрудника</span>
                    <input
                      value={inviteDraft.phone}
                      onChange={(e) => setInviteDraft((prev) => ({ ...prev, phone: e.target.value }))}
                      placeholder="+7 9XX XXX XX XX"
                    />
                  </label>
                  <label>
                    <span>Имя</span>
                    <input
                      value={inviteDraft.name}
                      onChange={(e) => setInviteDraft((prev) => ({ ...prev, name: e.target.value }))}
                      placeholder="Иван"
                    />
                  </label>
                  <label>
                    <span>Фамилия</span>
                    <input
                      value={inviteDraft.surname}
                      onChange={(e) => setInviteDraft((prev) => ({ ...prev, surname: e.target.value }))}
                      placeholder="Петров"
                    />
                  </label>
                  <label>
                    <span>Роль</span>
                    <select
                      value={inviteDraft.role}
                      onChange={(e) =>
                        setInviteDraft((prev) => ({
                          ...prev,
                          role: e.target.value === 'manager' ? 'manager' : 'staff',
                        }))
                      }
                      disabled={!canManageTeam}
                    >
                      {canManageTeam ? <option value="manager">Менеджер</option> : null}
                      <option value="staff">Сотрудник</option>
                    </select>
                  </label>
                  <label>
                    <span>Срок жизни инвайта (часы)</span>
                    <input
                      value={inviteDraft.ttlHours}
                      onChange={(e) => setInviteDraft((prev) => ({ ...prev, ttlHours: e.target.value }))}
                      placeholder="72"
                    />
                  </label>
                </div>

                <div className="wsv-row">
                  <button
                    type="button"
                    className="wsv-btn wsv-btn--primary"
                    onClick={() => void onSubmitInvite()}
                    disabled={isBusy('invite:create')}
                  >
                    {isBusy('invite:create') ? 'Создаю инвайт…' : 'Создать инвайт'}
                  </button>
                </div>

                {lastInviteInfo ? (
                  <div className="wsv-banner">{lastInviteInfo}</div>
                ) : null}

                {lastInviteLink ? (
                  <div className="wsv-stack">
                    <label className="wsv-block">
                      <span>Ссылка приглашения</span>
                      <input value={lastInviteLink} readOnly />
                    </label>
                    <div className="wsv-row">
                      <a className="wsv-link" href={lastInviteLink} target="_blank" rel="noreferrer">
                        Открыть onboarding
                      </a>
                      <button
                        type="button"
                        className="wsv-link"
                        onClick={() => {
                          if (!lastInviteLink) return;
                          if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
                            void navigator.clipboard.writeText(lastInviteLink).catch(() => {});
                          }
                        }}
                      >
                        Копировать ссылку
                      </button>
                    </div>
                  </div>
                ) : null}
              </>
            ) : null}

            {canReadInvites ? (
              invites.length ? (
                <div className="wsv-table-wrap">
                  <table className="wsv-table">
                    <thead>
                      <tr>
                        <th>Телефон</th>
                        <th>Сотрудник</th>
                        <th>Роль</th>
                        <th>Статус</th>
                        <th>Истекает</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {invites.map((invite) => {
                        const isExpired = !invite.acceptedAt && !invite.revokedAt && new Date(invite.expiresAt).getTime() <= now;
                        const canRevoke = !invite.acceptedAt && !invite.revokedAt && !isExpired;
                        const status = invite.acceptedAt
                          ? 'Принято'
                          : invite.revokedAt
                            ? 'Отозвано'
                            : isExpired
                              ? 'Истекло'
                              : 'Активно';

                        return (
                          <tr key={invite.id}>
                            <td>{invite.invitedPhone}</td>
                            <td>{`${invite.invitedName || 'Без имени'} ${invite.invitedSurname || ''}`.trim()}</td>
                            <td>{roleLabel(invite.role)}</td>
                            <td>{status}</td>
                            <td>{new Date(invite.expiresAt).toLocaleString('ru-RU')}</td>
                            <td className="wsv-table__actions">
                              {canCancelInvites && canRevoke ? (
                                <button
                                  type="button"
                                  className="wsv-link wsv-link--danger"
                                  onClick={() => {
                                    if (!window.confirm('Отозвать приглашение?')) return;
                                    void runMutate(`invite:revoke:${invite.id}`, async () => {
                                      await revokeInvite(invite.id);
                                    });
                                  }}
                                  disabled={isBusy(`invite:revoke:${invite.id}`)}
                                >
                                  Отозвать
                                </button>
                              ) : null}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState title="Инвайтов пока нет" subtitle="Создай первое приглашение для onboarding сотрудника." />
              )
            ) : (
              <p className="wsv-muted">Нет прав на просмотр журнала приглашений.</p>
            )}
          </SectionCard>
        ) : null}
      </div>
    );
  };

  const moduleTitle = modules.find((item) => item.id === activeModule)?.label || 'Главная';

  const renderModuleContent = () => {
    if (loading) {
      return <EmptyState title="Загружаю рабочее пространство" subtitle="Получаю актуальные данные сервиса…" />;
    }

    switch (activeModule) {
      case 'dashboard':
        return renderDashboard();
      case 'ingredients':
        return renderIngredients();
      case 'preparations':
        return renderPreparations();
      case 'cocktails':
        return renderCocktails();
      case 'training':
        return renderTraining();
      case 'tests':
        return renderTests();
      case 'docs':
        return renderDocs();
      case 'forms':
        return renderForms();
      case 'team':
        return renderTeam();
      default:
        return renderDashboard();
    }
  };

  return (
    <div className={`wsv-shell wsv-shell--${layout}`}>
      <aside className="wsv-sidebar">
        <div className="wsv-brand">
          <strong>ПРО.БАР</strong>
          <span>Операционная платформа</span>
        </div>

        <nav className="wsv-nav" aria-label="Модули">
          {modules.map(moduleNav)}
        </nav>

        <div className="wsv-sidebar__footer">
          <div className="wsv-user">
            <span className="wsv-user__name">{user?.name || user?.phone || 'Пользователь'}</span>
            <span className="wsv-user__meta">{roleLabel(user?.role)} · {user?.establishment_name || 'Без заведения'}</span>
          </div>
        </div>
      </aside>

      <section className="wsv-main">
        <header className="wsv-header">
          <div className="wsv-header__title">
            <h1>{moduleTitle}</h1>
            <p>{hasEstablishment ? user?.establishment_name : 'Личный режим без заведения'}</p>
          </div>

          <div className="wsv-header__tools">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск"
              className="wsv-search"
            />

            <button
              type="button"
              className="wsv-icon-btn"
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
              aria-label={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
            >
              {theme === 'dark' ? '☀' : '◐'}
            </button>

            <button
              type="button"
              className="wsv-icon-btn"
              title="Выйти"
              aria-label="Выйти"
              onClick={() => {
                void logout();
              }}
            >
              ↪
            </button>
          </div>
        </header>

        {isMobile ? (
          <div className="wsv-mobile-nav" aria-label="Модули">
            {modules.map((item) => (
              <button
                type="button"
                key={item.id}
                className={`wsv-mobile-nav__item${item.id === activeModule ? ' wsv-mobile-nav__item--active' : ''}`}
                onClick={() => setActiveModule(item.id)}
              >
                <span>{item.icon}</span>
                <small>{item.label}</small>
              </button>
            ))}
          </div>
        ) : null}

        {workspaceError ? (
          <div className="wsv-alert" role="alert">
            {workspaceError}
          </div>
        ) : null}

        <main className="wsv-content">{renderModuleContent()}</main>
      </section>
    </div>
  );
};

export default WorkspaceShell;
