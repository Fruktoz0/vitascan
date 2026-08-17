import { create } from 'zustand';

interface DateState {
  selectedDate: Date;
  changeDateBy: (days: number) => void;
  setDate: (date: Date) => void;
  resetDate: () => void;
}

/** Local YYYY-MM-DD (avoids UTC shift from toISOString). */
export function toLocalDateStr(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function startOfLocalDay(date: Date = new Date()): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** 0 = today, positive = upcoming, negative = past. */
export function daysFromToday(date: Date): number {
  return Math.round((startOfLocalDay(date).getTime() - startOfLocalDay().getTime()) / 86400000);
}

export const useDateStore = create<DateState>((set) => ({
  selectedDate: new Date(),
  changeDateBy: (days: number) =>
    set((state) => {
      const newDate = new Date(state.selectedDate);
      newDate.setDate(newDate.getDate() + days);
      return { selectedDate: newDate };
    }),
  setDate: (date) => set({ selectedDate: date }),
  resetDate: () => set({ selectedDate: new Date() }),
}));
