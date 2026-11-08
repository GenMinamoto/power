import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { kcalFromPfc, round, sumNutrients, type Nutrients } from '../../shared/calc';
import { MEAL_TYPES, type MealType } from '../../shared/constants';
import type { BodyLogInput, CopyMealsInput, FoodInput, GoalInput, MealEntryInput, ProfileInput } from '../../shared/schemas';
import type { BackupInfo, BodyLog, BodyLogDetail, DailyStat, Dashboard, DayMeals, Food, Goal, MealEntry, Profile } from '../../shared/types';
import { api } from './client';

export const keys = {
  meals: (date: string) => ['meals', date] as const,
  foods: (q: string) => ['foods', q] as const,
  bodyLog: (date: string) => ['bodyLog', date] as const,
  bodyLogs: ['bodyLogs'] as const,
  dashboard: (date: string) => ['dashboard', date] as const,
  statsDaily: ['statsDaily'] as const,
  backups: ['backups'] as const,
  profile: ['profile'] as const,
  goals: ['goals'] as const,
};

export const useBodyLog = (date: string) =>
  useQuery({ queryKey: keys.bodyLog(date), queryFn: () => api<BodyLogDetail>(`/api/body-logs/${date}`) });

export const useBodyLogs = () => useQuery({ queryKey: keys.bodyLogs, queryFn: () => api<BodyLog[]>('/api/body-logs') });

export const useDashboard = (date: string) =>
  useQuery({ queryKey: keys.dashboard(date), queryFn: () => api<Dashboard>(`/api/dashboard?date=${date}`) });

/** グラフ用。全期間を 1 回取得し、期間の切り替えは画面側で絞り込む */
export const useStatsDaily = () => useQuery({ queryKey: keys.statsDaily, queryFn: () => api<DailyStat[]>('/api/stats/daily') });

export const useBackups = () => useQuery({ queryKey: keys.backups, queryFn: () => api<BackupInfo[]>('/api/backups') });

/** 体組成が変わったときに再取得するもの */
function useInvalidateBody() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['bodyLog'] }),
      qc.invalidateQueries({ queryKey: keys.bodyLogs }),
      qc.invalidateQueries({ queryKey: ['dashboard'] }),
      qc.invalidateQueries({ queryKey: keys.statsDaily }),
    ]);
}

export function useSaveBodyLog() {
  const invalidate = useInvalidateBody();
  return useMutation({
    mutationFn: ({ date, input }: { date: string; input: BodyLogInput }) =>
      api<BodyLog>(`/api/body-logs/${date}`, { method: 'PUT', body: input }),
    onSuccess: invalidate,
  });
}

export function useDeleteBodyLog() {
  const invalidate = useInvalidateBody();
  return useMutation({
    mutationFn: (date: string) => api<void>(`/api/body-logs/${date}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });
}

// ── 食事 ─────────────────────────────

export const useMeals = (date: string) =>
  useQuery({ queryKey: keys.meals(date), queryFn: () => api<DayMeals>(`/api/meals?date=${date}`) });

/** entries から小計・合計を計算し直す（楽観的更新用） */
function recompute(day: DayMeals, entries: MealEntry[]): DayMeals {
  const subtotals = Object.fromEntries(
    MEAL_TYPES.map((t) => [t, sumNutrients(entries.filter((e) => e.mealType === t))]),
  ) as Record<MealType, Nutrients>;
  return { ...day, entries, subtotals, total: sumNutrients(entries) };
}

/** サーバーと同じ整形（丸め・kcal の補完）を画面側でも行い、保存前の表示をそろえる */
function preview(input: MealEntryInput, id: number, sortOrder: number): MealEntry {
  const p = round(input.proteinG, 1);
  const f = round(input.fatG, 1);
  const c = round(input.carbsG, 1);
  return {
    id,
    sortOrder,
    date: input.date,
    mealType: input.mealType,
    foodName: input.foodName.trim(),
    amountNote: input.amountNote?.trim() || null,
    foodId: input.foodId,
    multiplier: input.multiplier,
    kcal: input.kcal == null ? kcalFromPfc(p, f, c) : Math.round(input.kcal),
    proteinG: p,
    fatG: f,
    carbsG: c,
    memo: input.memo?.trim() || null,
  };
}

function useInvalidateMeals() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['meals'] }),
      qc.invalidateQueries({ queryKey: ['dashboard'] }),
      qc.invalidateQueries({ queryKey: keys.statsDaily }),
      // 食品の使用回数（候補の並び順）が変わる
      qc.invalidateQueries({ queryKey: ['foods'] }),
    ]);
}

let tempId = -1;

/**
 * 食事の追加・更新・削除。サーバーの応答を待たずに画面へ反映し（楽観的更新）、
 * 失敗したら元に戻す。
 */
function useMealMutation<V>(
  date: string,
  mutationFn: (v: V) => Promise<unknown>,
  apply: (day: DayMeals, v: V) => MealEntry[],
) {
  const qc = useQueryClient();
  const invalidate = useInvalidateMeals();
  const key = keys.meals(date);
  return useMutation({
    mutationFn,
    onMutate: async (v: V) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<DayMeals>(key);
      if (prev) qc.setQueryData<DayMeals>(key, recompute(prev, apply(prev, v)));
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
    },
    onSettled: invalidate,
  });
}

export function useAddMeal(date: string) {
  return useMealMutation(
    date,
    (input: MealEntryInput) => api<MealEntry>('/api/meals', { method: 'POST', body: input }),
    (day, input) => {
      const same = day.entries.filter((e) => e.mealType === input.mealType);
      const order = same.length ? Math.max(...same.map((e) => e.sortOrder)) + 1 : 0;
      const entries = [...day.entries, preview(input, tempId--, order)];
      return entries.sort(
        (a, b) => MEAL_TYPES.indexOf(a.mealType) - MEAL_TYPES.indexOf(b.mealType) || a.sortOrder - b.sortOrder,
      );
    },
  );
}

export function useUpdateMeal(date: string) {
  return useMealMutation(
    date,
    ({ id, input }: { id: number; input: MealEntryInput }) => api<MealEntry>(`/api/meals/${id}`, { method: 'PUT', body: input }),
    (day, { id, input }) => day.entries.map((e) => (e.id === id ? preview(input, id, e.sortOrder) : e)),
  );
}

export function useDeleteMeal(date: string) {
  return useMealMutation(
    date,
    (id: number) => api<void>(`/api/meals/${id}`, { method: 'DELETE' }),
    (day, id) => day.entries.filter((e) => e.id !== id),
  );
}

export function useCopyMeals() {
  const invalidate = useInvalidateMeals();
  return useMutation({
    mutationFn: (input: CopyMealsInput) => api<{ copied: number }>('/api/meals/copy', { method: 'POST', body: input }),
    onSuccess: invalidate,
  });
}

// ── マイ食品 ─────────────────────────

/** q が空なら全件、あれば部分一致（最大20件） */
export const useFoods = (q: string, enabled = true) =>
  useQuery({
    queryKey: keys.foods(q),
    queryFn: () => api<Food[]>(`/api/foods${q ? `?q=${encodeURIComponent(q)}` : ''}`),
    enabled,
    placeholderData: keepPreviousData,
    staleTime: 10_000,
  });

function useInvalidateFoods() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['foods'] });
}

export function useCreateFood() {
  const invalidate = useInvalidateFoods();
  return useMutation({
    mutationFn: (input: FoodInput) => api<Food>('/api/foods', { method: 'POST', body: input }),
    onSuccess: invalidate,
  });
}

export function useUpdateFood() {
  const invalidate = useInvalidateFoods();
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: FoodInput }) => api<Food>(`/api/foods/${id}`, { method: 'PUT', body: input }),
    onSuccess: invalidate,
  });
}

export function useDeleteFood() {
  const invalidate = useInvalidateFoods();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api<void>(`/api/foods/${id}`, { method: 'DELETE' }),
    // 食事記録の food_id が外れるので食事も取り直す
    onSuccess: () => Promise.all([invalidate(), qc.invalidateQueries({ queryKey: ['meals'] })]),
  });
}

// ── プロフィール・目標 ───────────────

export const useProfile = () => useQuery({ queryKey: keys.profile, queryFn: () => api<Profile>('/api/profile') });

export function useSaveProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ProfileInput) => api<Profile>('/api/profile', { method: 'PUT', body: input }),
    onSuccess: (p) => qc.setQueryData(keys.profile, p),
  });
}

/** 開始日の新しい順 */
export const useGoals = () => useQuery({ queryKey: keys.goals, queryFn: () => api<Goal[]>('/api/goals') });

/** 目標が変わると、食事の達成率・ホーム・グラフの目標線が変わる */
function useInvalidateGoals() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: keys.goals }),
      qc.invalidateQueries({ queryKey: ['meals'] }),
      qc.invalidateQueries({ queryKey: ['dashboard'] }),
      qc.invalidateQueries({ queryKey: keys.statsDaily }),
    ]);
}

export function useSaveGoal() {
  const invalidate = useInvalidateGoals();
  return useMutation({
    mutationFn: (input: GoalInput) => api<Goal>('/api/goals', { method: 'POST', body: input }),
    onSuccess: invalidate,
  });
}

export function useDeleteGoal() {
  const invalidate = useInvalidateGoals();
  return useMutation({
    mutationFn: (id: number) => api<void>(`/api/goals/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });
}

// ── データ管理 ───────────────────────

export function useCreateBackup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<{ file: string }>('/api/backups', { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.backups }),
  });
}
