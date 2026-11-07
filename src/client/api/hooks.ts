import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BodyLogInput } from '../../shared/schemas';
import type { BackupInfo, BodyLog, BodyLogDetail, DailyStat, Dashboard } from '../../shared/types';
import { api } from './client';

export const keys = {
  bodyLog: (date: string) => ['bodyLog', date] as const,
  bodyLogs: ['bodyLogs'] as const,
  dashboard: (date: string) => ['dashboard', date] as const,
  statsDaily: ['statsDaily'] as const,
  backups: ['backups'] as const,
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

export function useCreateBackup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<{ file: string }>('/api/backups', { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.backups }),
  });
}
