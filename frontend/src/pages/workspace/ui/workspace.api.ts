import { api } from '../../../shared/api';

function asNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function asString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

const UNIT_ALIASES: Record<string, string> = {
  мл: 'мл',
  ml: 'мл',
  l: 'л',
  л: 'л',
  cl: 'cl',
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

function normalizeUnit(value: unknown): string | null {
  const raw = asString(value);
  if (!raw) return null;
  const key = raw.toLowerCase();
  return UNIT_ALIASES[key] || raw;
}

function apiBase(): string {
  const envBase = (import.meta.env.VITE_API_URL || '').trim().replace(/\/+$/, '');
  if (envBase) return envBase;
  if (typeof window !== 'undefined') {
    return `${window.location.protocol}//${window.location.hostname}:3001`;
  }
  return '';
}

export function absoluteApiUrl(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${apiBase()}${p}`;
}

export type Ingredient = {
  id: number;
  name: string;
  packVolume: number | null;
  packCost: number | null;
  unit: string | null;
  costPerUnit: number | null;
};

export type PreparationSummary = {
  id: number;
  title: string;
  yieldValue: number | null;
  yieldUnit: string | null;
  altVolume: number | null;
  costPerUnit: number | null;
};

export type PreparationBreakdownItem = {
  type: 'ingredient' | 'preparation';
  id: number;
  name: string;
  amount: number;
  unit: string | null;
  cost: number;
  expanded?: PreparationBreakdownItem[];
};

export type PreparationCalc = {
  id: number;
  title: string;
  yieldValue: number | null;
  yieldUnit: string | null;
  altVolume: number | null;
  cost: number;
  baseCost?: number;
  costPerUnit: number | null;
  requestedVolume?: number;
  requestedAltVolume?: number;
  costForVolume?: number;
  costForRequested?: number;
  scaleFactor?: number;
  calculationBasis?: 'base' | 'yield' | 'alt_volume' | 'known_component';
  knownComponent?: {
    index?: number;
    id: number;
    type: 'ingredient' | 'preparation';
    amount: number;
  };
  breakdown: PreparationBreakdownItem[];
};

export type CocktailSummary = {
  id: number;
  title: string;
  category: string;
  outputValue: number | null;
  outputUnit: string | null;
  garnish: string | null;
  serving: string | null;
  photoUrl: string | null;
  totalCost: number | null;
  costPerOutput: number | null;
};

export type CocktailBreakdownItem = {
  type: 'ingredient' | 'preparation';
  id: number;
  name: string;
  amount: number;
  unit: string | null;
  cost: number;
};

export type CocktailCalc = {
  id: number;
  title: string;
  category: string;
  outputValue: number | null;
  outputUnit: string | null;
  garnish: string | null;
  serving: string | null;
  method: string | null;
  photoUrl: string | null;
  notes: string | null;
  totalCost: number;
  costPerOutput: number | null;
  requestedOutput?: number;
  costForRequestedOutput?: number;
  breakdown: CocktailBreakdownItem[];
};

export type OperationRequestTemplate = {
  kind: string;
  title: string;
  fields: string[];
};

export type OperationRequest = {
  id: number;
  kind: string;
  title: string;
  details: Record<string, unknown>;
  status: string;
  createdAt: string;
  updatedAt: string;
  createdBy: number;
  createdByName: string | null;
  createdByPhone: string | null;
};

export type TeamMember = {
  membershipId: number;
  userId: number;
  role: 'manager' | 'staff';
  createdAt: string;
  phone: string;
  name: string | null;
  surname: string | null;
};

export type TeamPayload = {
  canManage: boolean;
  rows: TeamMember[];
};

export type TeamInvite = {
  id: number;
  invitedPhone: string;
  invitedName: string | null;
  invitedSurname: string | null;
  role: 'manager' | 'staff';
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

export type CreateInviteResult = {
  id?: number;
  expiresAt?: string;
  inviteUrl?: string;
  inviteToken?: string;
  linkedExistingUser?: boolean;
  membershipId?: number;
  linkedUser?: {
    id: number;
    phone: string;
    name: string | null;
    surname: string | null;
  };
};

export type PublicInviteInfo = {
  id: number;
  role: 'manager' | 'staff';
  invitedName: string | null;
  invitedSurname: string | null;
  invitedPhoneMasked: string | null;
  establishmentId: number;
  establishmentName: string;
  expiresAt: string;
};

export type DocumentItem = {
  code: string;
  title: string;
  description: string;
};

export type LearningTopic = {
  id: number;
  category: string;
  title: string;
  summary: string;
  bullets: string[];
  position: number;
  isActive: boolean;
};

export type QuizQuestion = {
  id: number;
  question: string;
  options: string[];
  hint: string | null;
  correctOption?: number;
  position: number;
  isActive: boolean;
};

export type QuizSummary = {
  scope: 'team' | 'own';
  totals: {
    attempts: number;
    avg_score: number;
    best_score: number;
    participants: number;
  };
  latest: Array<{
    id: number;
    user_id: number;
    score: number;
    total_questions: number;
    correct_answers: number;
    duration_sec: number;
    created_at: string;
    user_name: string | null;
    user_phone: string | null;
  }>;
  trend: Array<{
    day: string;
    attempts: number;
    avg_score: number;
  }>;
};

export type MixComponent = {
  type: 'ingredient' | 'preparation';
  id: number;
  amount: number;
  unit: string | null;
};

export type CreatePreparationPayload = {
  title: string;
  yieldValue: number | null;
  yieldUnit: string | null;
  altVolume: number | null;
  components: MixComponent[];
};

export type PreparationCalcQuery = {
  volume?: number;
  altVolume?: number;
  knownComponentIndex?: number;
  knownComponentId?: number;
  knownComponentType?: 'ingredient' | 'preparation';
  knownAmount?: number;
};

export type CreateCocktailPayload = {
  title: string;
  category: string;
  outputValue: number | null;
  outputUnit: string | null;
  garnish: string | null;
  serving: string | null;
  method: string | null;
  photoUrl: string | null;
  notes: string | null;
  components: MixComponent[];
};

function normalizeIngredient(row: any): Ingredient {
  return {
    id: Number(row.id),
    name: String(row.name || ''),
    packVolume: asNumber(row.packVolume),
    packCost: asNumber(row.packCost),
    unit: normalizeUnit(row.unit),
    costPerUnit: asNumber(row.costPerUnit),
  };
}

function normalizePreparationSummary(row: any): PreparationSummary {
  return {
    id: Number(row.id),
    title: String(row.title || ''),
    yieldValue: asNumber(row.yield_value),
    yieldUnit: normalizeUnit(row.yield_unit),
    altVolume: asNumber(row.alt_volume),
    costPerUnit: asNumber(row.cost_per_unit),
  };
}

function normalizePreparationBreakdown(row: any): PreparationBreakdownItem {
  return {
    type: row?.type === 'preparation' ? 'preparation' : 'ingredient',
    id: Number(row?.id),
    name: String(row?.name || ''),
    amount: asNumber(row?.amount) || 0,
    unit: normalizeUnit(row?.unit),
    cost: asNumber(row?.cost) || 0,
    expanded: Array.isArray(row?.expanded)
      ? row.expanded.map((item: any) => normalizePreparationBreakdown(item))
      : undefined,
  };
}

function normalizePreparationCalc(row: any): PreparationCalc {
  const knownType: 'ingredient' | 'preparation' =
    row?.known_component_type === 'preparation' ? 'preparation' : 'ingredient';
  const knownComponent = row?.known_component_id
    ? {
        index: asNumber(row.known_component_index) ?? undefined,
        id: Number(row.known_component_id),
        type: knownType,
        amount: asNumber(row.known_component_amount) || 0,
      }
    : undefined;

  return {
    id: Number(row.id),
    title: String(row.title || ''),
    yieldValue: asNumber(row.yield_value),
    yieldUnit: asString(row.yield_unit),
    altVolume: asNumber(row.alt_volume),
    cost: asNumber(row.cost) || 0,
    baseCost: asNumber(row.base_cost) || undefined,
    costPerUnit: asNumber(row.cost_per_unit),
    requestedVolume: asNumber(row.requested_volume) || undefined,
    requestedAltVolume: asNumber(row.requested_alt_volume) || undefined,
    costForVolume: asNumber(row.cost_for_volume) || undefined,
    costForRequested: asNumber(row.cost_for_requested) || undefined,
    scaleFactor: asNumber(row.scale_factor) || undefined,
    calculationBasis: (() => {
      if (
        row?.calculation_basis === 'yield'
        || row?.calculation_basis === 'alt_volume'
        || row?.calculation_basis === 'known_component'
      ) {
        return row.calculation_basis;
      }
      return 'base';
    })(),
    knownComponent,
    breakdown: Array.isArray(row.breakdown) ? row.breakdown.map((b: any) => normalizePreparationBreakdown(b)) : [],
  };
}

function normalizeCocktailSummary(row: any): CocktailSummary {
  return {
    id: Number(row.id),
    title: String(row.title || ''),
    category: String(row.category || 'cocktail'),
    outputValue: asNumber(row.output_value),
    outputUnit: normalizeUnit(row.output_unit),
    garnish: asString(row.garnish),
    serving: asString(row.serving),
    photoUrl: asString(row.photo_url),
    totalCost: asNumber(row.total_cost),
    costPerOutput: asNumber(row.cost_per_output),
  };
}

function normalizeCocktailCalc(row: any): CocktailCalc {
  return {
    id: Number(row.id),
    title: String(row.title || ''),
    category: String(row.category || 'cocktail'),
    outputValue: asNumber(row.output_value),
    outputUnit: normalizeUnit(row.output_unit),
    garnish: asString(row.garnish),
    serving: asString(row.serving),
    method: asString(row.method),
    photoUrl: asString(row.photo_url),
    notes: asString(row.notes),
    totalCost: asNumber(row.total_cost) || 0,
    costPerOutput: asNumber(row.cost_per_output),
    requestedOutput: asNumber(row.requested_output) || undefined,
    costForRequestedOutput: asNumber(row.cost_for_requested_output) || undefined,
    breakdown: Array.isArray(row.breakdown)
      ? row.breakdown.map((b: any) => ({
          type: b.type === 'preparation' ? 'preparation' : 'ingredient',
          id: Number(b.id),
          name: String(b.name || ''),
          amount: asNumber(b.amount) || 0,
          unit: normalizeUnit(b.unit),
          cost: asNumber(b.cost) || 0,
        }))
      : [],
  };
}

function normalizeRequest(row: any): OperationRequest {
  return {
    id: Number(row.id),
    kind: String(row.kind || ''),
    title: String(row.title || ''),
    details: row.details && typeof row.details === 'object' ? row.details : {},
    status: String(row.status || 'submitted'),
    createdAt: String(row.created_at || ''),
    updatedAt: String(row.updated_at || ''),
    createdBy: Number(row.created_by),
    createdByName: asString(row.created_by_name),
    createdByPhone: asString(row.created_by_phone),
  };
}

function normalizeInvite(row: any): TeamInvite {
  return {
    id: Number(row.id),
    invitedPhone: String(row.invited_phone || ''),
    invitedName: asString(row.invited_name),
    invitedSurname: asString(row.invited_surname),
    role: row.role === 'manager' ? 'manager' : 'staff',
    expiresAt: String(row.expires_at || ''),
    acceptedAt: asString(row.accepted_at),
    revokedAt: asString(row.revoked_at),
    createdAt: String(row.created_at || ''),
  };
}

function normalizeLearningTopic(row: any): LearningTopic {
  return {
    id: Number(row.id),
    category: String(row.category || 'Общее'),
    title: String(row.title || ''),
    summary: String(row.summary || ''),
    bullets: Array.isArray(row.bullets) ? row.bullets.map((x: unknown) => String(x || '')).filter(Boolean) : [],
    position: Number(row.position || 100),
    isActive: row.is_active !== false,
  };
}

function normalizeQuizQuestion(row: any): QuizQuestion {
  const parsedCorrect = asNumber((row as any).correct_option);
  return {
    id: Number(row.id),
    question: String(row.question || ''),
    options: Array.isArray(row.options) ? row.options.map((x: unknown) => String(x || '')).filter(Boolean) : [],
    hint: asString(row.hint),
    correctOption: parsedCorrect === null ? undefined : Math.trunc(parsedCorrect),
    position: Number(row.position || 100),
    isActive: row.is_active !== false,
  };
}

export async function createEstablishment(name: string): Promise<void> {
  await api('/v1/auth/establishments', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export async function listIngredients(): Promise<Ingredient[]> {
  const rows = await api<any[]>('/v1/ingredients', { method: 'GET' });
  return rows.map(normalizeIngredient);
}

export async function createIngredient(payload: {
  name: string;
  packVolume: number | null;
  packCost: number | null;
  unit: string | null;
}): Promise<void> {
  await api('/v1/ingredients', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateIngredient(
  id: number,
  payload: { name: string; packVolume: number | null; packCost: number | null; unit: string | null }
): Promise<void> {
  await api(`/v1/ingredients/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function deleteIngredient(id: number): Promise<void> {
  await api(`/v1/ingredients/${id}`, { method: 'DELETE' });
}

export async function listPreparations(): Promise<PreparationSummary[]> {
  const rows = await api<any[]>('/v1/preparations', { method: 'GET' });
  return rows.map(normalizePreparationSummary);
}

export async function createPreparation(payload: CreatePreparationPayload): Promise<void> {
  await api('/v1/preparations', {
    method: 'POST',
    body: JSON.stringify({
      title: payload.title,
      yield_value: payload.yieldValue,
      yield_unit: payload.yieldUnit,
      alt_volume: payload.altVolume,
      components: payload.components,
    }),
  });
}

export async function deletePreparation(id: number): Promise<void> {
  await api(`/v1/preparations/${id}`, { method: 'DELETE' });
}

export async function getPreparationCalc(id: number, query?: PreparationCalcQuery): Promise<PreparationCalc> {
  const params = new URLSearchParams();
  if (query?.volume && query.volume > 0) params.set('volume', String(query.volume));
  if (query?.altVolume && query.altVolume > 0) params.set('alt_volume', String(query.altVolume));
  if (Number.isInteger(query?.knownComponentIndex) && (query?.knownComponentIndex ?? -1) >= 0) {
    params.set('known_component_index', String(query?.knownComponentIndex));
  } else if (Number.isInteger(query?.knownComponentId) && (query?.knownComponentId ?? 0) > 0) {
    params.set('known_component_id', String(query?.knownComponentId));
    if (query?.knownComponentType) params.set('known_component_type', query.knownComponentType);
  }
  if (query?.knownAmount && query.knownAmount > 0) params.set('known_amount', String(query.knownAmount));
  const queryString = params.toString();
  const url = queryString ? `/v1/preparations/${id}/calc?${queryString}` : `/v1/preparations/${id}/calc`;
  const row = await api<any>(url, { method: 'GET' });
  return normalizePreparationCalc(row);
}

export async function listCocktails(): Promise<CocktailSummary[]> {
  const rows = await api<any[]>('/v1/cocktails', { method: 'GET' });
  return rows.map(normalizeCocktailSummary);
}

export async function createCocktail(payload: CreateCocktailPayload): Promise<void> {
  await api('/v1/cocktails', {
    method: 'POST',
    body: JSON.stringify({
      title: payload.title,
      category: payload.category,
      output_value: payload.outputValue,
      output_unit: payload.outputUnit,
      garnish: payload.garnish,
      serving: payload.serving,
      method: payload.method,
      photo_url: payload.photoUrl,
      notes: payload.notes,
      components: payload.components,
    }),
  });
}

export async function deleteCocktail(id: number): Promise<void> {
  await api(`/v1/cocktails/${id}`, { method: 'DELETE' });
}

export async function getCocktailCalc(id: number, output?: number): Promise<CocktailCalc> {
  const query = output && output > 0 ? `?output=${encodeURIComponent(String(output))}` : '';
  const row = await api<any>(`/v1/cocktails/${id}/calc${query}`, { method: 'GET' });
  return normalizeCocktailCalc(row);
}

export async function uploadCocktailPhoto(id: number, file: File): Promise<string> {
  const formData = new FormData();
  formData.append('photo', file);

  const csrfResponse = await fetch(absoluteApiUrl('/v1/auth/csrf-token'), {
    method: 'GET',
    credentials: 'include',
  });
  const csrfData = await csrfResponse.json();
  const csrfToken = String(csrfData?.csrfToken || '');

  const response = await fetch(absoluteApiUrl(`/v1/cocktails/${id}/photo`), {
    method: 'POST',
    credentials: 'include',
    headers: {
      'X-CSRF-Token': csrfToken,
    },
    body: formData,
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const error = new Error(data?.error || response.statusText);
    throw error;
  }

  const data = await response.json();
  return String(data.photo_url || '');
}

export async function listFormTemplates(): Promise<OperationRequestTemplate[]> {
  const rows = await api<any[]>('/v1/forms/templates', { method: 'GET' });
  return rows.map((row) => ({
    kind: String(row.kind || ''),
    title: String(row.title || ''),
    fields: Array.isArray(row.fields) ? row.fields.map((x: unknown) => String(x)) : [],
  }));
}

export async function listRequests(): Promise<OperationRequest[]> {
  const rows = await api<any[]>('/v1/forms', { method: 'GET' });
  return rows.map(normalizeRequest);
}

export async function createRequest(payload: {
  kind: string;
  title: string;
  details: Record<string, unknown>;
  status?: 'draft' | 'submitted';
}): Promise<void> {
  await api('/v1/forms', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateRequest(
  id: number,
  payload: { title: string; details: Record<string, unknown> }
): Promise<void> {
  await api(`/v1/forms/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function updateRequestStatus(id: number, status: string): Promise<void> {
  await api(`/v1/forms/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export async function listTeam(): Promise<TeamPayload> {
  const row = await api<any>('/v1/team', { method: 'GET' });
  const rows: TeamMember[] = Array.isArray(row.rows)
    ? row.rows.map((x: any) => ({
        membershipId: Number(x.membership_id),
        userId: Number(x.user_id),
        role: x.role === 'manager' ? 'manager' : 'staff',
        createdAt: String(x.created_at || ''),
        phone: String(x.phone || ''),
        name: asString(x.name),
        surname: asString(x.surname),
      }))
    : [];

  return {
    canManage: !!row.can_manage,
    rows,
  };
}

export async function updateTeamRole(membershipId: number, role: 'manager' | 'staff'): Promise<void> {
  await api(`/v1/team/${membershipId}/role`, {
    method: 'PATCH',
    body: JSON.stringify({ role }),
  });
}

export async function revokeTeamMember(membershipId: number): Promise<void> {
  await api(`/v1/team/${membershipId}`, { method: 'DELETE' });
}

export async function listInvites(): Promise<TeamInvite[]> {
  const rows = await api<any[]>('/v1/team/invites', { method: 'GET' });
  return rows.map(normalizeInvite);
}

export async function createInvite(payload: {
  phone: string;
  name?: string;
  surname?: string;
  role: 'manager' | 'staff';
  ttlHours?: number;
}): Promise<CreateInviteResult> {
  const row = await api<any>('/v1/team/invites', {
    method: 'POST',
    body: JSON.stringify({
      phone: payload.phone,
      name: payload.name,
      surname: payload.surname,
      role: payload.role,
      ttl_hours: payload.ttlHours,
    }),
  });

  if (row.linked_existing_user) {
    return {
      linkedExistingUser: true,
      membershipId: Number(row.membership_id || 0),
      linkedUser: row.user
        ? {
            id: Number(row.user.id),
            phone: String(row.user.phone || ''),
            name: asString(row.user.name),
            surname: asString(row.user.surname),
          }
        : undefined,
    };
  }

  return {
    id: row.id === undefined || row.id === null ? undefined : Number(row.id),
    expiresAt: String(row.expires_at || ''),
    inviteUrl: String(row.invite_url || ''),
    inviteToken: String(row.invite_token || ''),
  };
}

export async function revokeInvite(inviteId: number): Promise<void> {
  await api(`/v1/team/invites/${inviteId}`, { method: 'DELETE' });
}

export async function getPublicInvite(token: string): Promise<PublicInviteInfo> {
  const row = await api<any>(`/v1/auth/invite/${encodeURIComponent(token)}`, { method: 'GET' });
  return {
    id: Number(row.id),
    role: row.role === 'manager' ? 'manager' : 'staff',
    invitedName: asString(row.invited_name),
    invitedSurname: asString(row.invited_surname),
    invitedPhoneMasked: asString(row.invited_phone_masked),
    establishmentId: Number(row.establishment_id),
    establishmentName: String(row.establishment_name || ''),
    expiresAt: String(row.expires_at || ''),
  };
}

export async function acceptPublicInvite(
  token: string,
  payload: { name: string; surname?: string; password: string }
): Promise<{ user: any; access?: string }> {
  return api<{ user: any; access?: string }>(`/v1/auth/invite/${encodeURIComponent(token)}/accept`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function listDocs(): Promise<DocumentItem[]> {
  const rows = await api<any[]>('/v1/docs', { method: 'GET' });
  return rows.map((row) => ({
    code: String(row.code || ''),
    title: String(row.title || ''),
    description: String(row.description || ''),
  }));
}

export async function submitQuizAttempt(payload: {
  answers: Record<string, number>;
  durationSec?: number;
}): Promise<{ id: number; score: number; total_questions: number; correct_answers: number; created_at: string }> {
  return api('/v1/analytics/quiz-attempts', {
    method: 'POST',
    body: JSON.stringify({
      answers: payload.answers,
      duration_sec: payload.durationSec ?? 0,
    }),
  });
}

export async function listTrainingTopics(includeArchived = false): Promise<LearningTopic[]> {
  const suffix = includeArchived ? '?include_archived=1' : '';
  const rows = await api<any[]>(`/v1/training/topics${suffix}`, { method: 'GET' });
  return rows.map(normalizeLearningTopic);
}

export async function createTrainingTopic(payload: {
  category: string;
  title: string;
  summary: string;
  bullets: string[];
  position?: number;
}): Promise<void> {
  await api('/v1/training/topics', {
    method: 'POST',
    body: JSON.stringify({
      category: payload.category,
      title: payload.title,
      summary: payload.summary,
      bullets: payload.bullets,
      position: payload.position ?? 100,
    }),
  });
}

export async function updateTrainingTopic(
  id: number,
  payload: {
    category: string;
    title: string;
    summary: string;
    bullets: string[];
    position?: number;
  }
): Promise<void> {
  await api(`/v1/training/topics/${id}`, {
    method: 'PUT',
    body: JSON.stringify({
      category: payload.category,
      title: payload.title,
      summary: payload.summary,
      bullets: payload.bullets,
      position: payload.position ?? 100,
    }),
  });
}

export async function deleteTrainingTopic(id: number): Promise<void> {
  await api(`/v1/training/topics/${id}`, { method: 'DELETE' });
}

export async function listQuizQuestions(params?: {
  includeArchived?: boolean;
  includeCorrect?: boolean;
}): Promise<QuizQuestion[]> {
  const search = new URLSearchParams();
  if (params?.includeArchived) search.set('include_archived', '1');
  if (params?.includeCorrect) search.set('include_correct', '1');
  const suffix = search.toString() ? `?${search.toString()}` : '';
  const rows = await api<any[]>(`/v1/training/quiz-questions${suffix}`, { method: 'GET' });
  return rows.map(normalizeQuizQuestion);
}

export async function createQuizQuestion(payload: {
  question: string;
  options: string[];
  correctOption: number;
  hint?: string | null;
  position?: number;
}): Promise<void> {
  await api('/v1/training/quiz-questions', {
    method: 'POST',
    body: JSON.stringify({
      question: payload.question,
      options: payload.options,
      correct_option: payload.correctOption,
      hint: payload.hint ?? null,
      position: payload.position ?? 100,
    }),
  });
}

export async function updateQuizQuestion(
  id: number,
  payload: {
    question: string;
    options: string[];
    correctOption: number;
    hint?: string | null;
    position?: number;
  }
): Promise<void> {
  await api(`/v1/training/quiz-questions/${id}`, {
    method: 'PUT',
    body: JSON.stringify({
      question: payload.question,
      options: payload.options,
      correct_option: payload.correctOption,
      hint: payload.hint ?? null,
      position: payload.position ?? 100,
    }),
  });
}

export async function deleteQuizQuestion(id: number): Promise<void> {
  await api(`/v1/training/quiz-questions/${id}`, { method: 'DELETE' });
}

export async function getQuizSummary(): Promise<QuizSummary> {
  return api<QuizSummary>('/v1/analytics/quiz-summary', { method: 'GET' });
}

export async function downloadProtectedCsv(path: string, filename: string): Promise<void> {
  const response = await fetch(absoluteApiUrl(path), {
    method: 'GET',
    credentials: 'include',
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const error = new Error(data?.error || response.statusText);
    throw error;
  }

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  window.URL.revokeObjectURL(url);
}
