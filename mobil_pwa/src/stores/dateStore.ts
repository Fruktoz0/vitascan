import { create } from 'zustand';

interface DateState {
  selectedDate: Date;
  changeDateBy: (days: number) => void;
  setDate: (date: Date) => void;
  resetDate: () => void;
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
