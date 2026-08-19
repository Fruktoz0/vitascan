import { create } from 'zustand';
import { getItem, setItem } from '../services/storage';

const STORAGE_BASE = 'vitascan.cart';
const MAX_LISTS = 20;

export type CartItem = {
  id: string;
  name: string;
  qtyLabel?: string;
  foodId?: string;
  recipeId?: string;
  checked: boolean;
  addedAt: number;
};

export type CartAddInput = {
  name: string;
  qtyLabel?: string;
  foodId?: string;
  recipeId?: string;
};

export type CartList = {
  id: string;
  name: string;
  items: CartItem[];
  createdAt: number;
};

export type CartRecipePicker = {
  recipeId: string;
  recipeTitle: string;
  lines: CartAddInput[];
};

type CartState = {
  userId: string | null;
  lists: CartList[];
  activeListId: string | null;
  viewListId: string | null;
  sheetOpen: boolean;
  picker: CartRecipePicker | null;
  hydrated: boolean;
  hydrate: (userId: string | null) => Promise<void>;
  createList: (name: string) => string | null;
  renameList: (id: string, name: string) => void;
  deleteList: (id: string) => void;
  addItem: (input: CartAddInput, listId?: string) => void;
  updateItem: (id: string, patch: { qtyLabel?: string; name?: string }) => void;
  addRecipeIngredients: (recipeId: string, lines: CartAddInput[], listId?: string) => void;
  toggle: (id: string) => void;
  remove: (id: string) => void;
  clearChecked: () => void;
  openSheet: () => void;
  openList: (id: string) => void;
  closeList: () => void;
  closeSheet: () => void;
  openRecipePicker: (picker: CartRecipePicker) => void;
  closePicker: () => void;
};

function namespaced(userId: string): string {
  return `${STORAGE_BASE}.${userId}`;
}

function newId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `c_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function persist(userId: string | null, lists: CartList[], activeListId: string | null): void {
  if (!userId) return;
  void setItem(namespaced(userId), JSON.stringify({ v: 2, lists, activeListId }));
}

function foldName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

function isSameLine(item: CartItem, input: CartAddInput): boolean {
  if (input.foodId && item.foodId && item.foodId === input.foodId) return true;
  if (input.foodId || item.foodId) return false;
  return foldName(item.name) === foldName(input.name) && (item.qtyLabel ?? '') === (input.qtyLabel ?? '');
}

function parseItem(row: unknown): CartItem | null {
  if (!row || typeof row !== 'object') return null;
  const rec = row as Record<string, unknown>;
  if (typeof rec.id !== 'string' || typeof rec.name !== 'string' || !rec.name.trim()) return null;
  return {
    id: rec.id,
    name: rec.name.trim(),
    qtyLabel: typeof rec.qtyLabel === 'string' && rec.qtyLabel.trim() ? rec.qtyLabel : undefined,
    foodId: typeof rec.foodId === 'string' && rec.foodId ? rec.foodId : undefined,
    recipeId: typeof rec.recipeId === 'string' && rec.recipeId ? rec.recipeId : undefined,
    checked: rec.checked === true,
    addedAt: typeof rec.addedAt === 'number' ? rec.addedAt : Date.now(),
  };
}

function parseList(row: unknown): CartList | null {
  if (!row || typeof row !== 'object') return null;
  const rec = row as Record<string, unknown>;
  if (typeof rec.id !== 'string' || typeof rec.name !== 'string' || !rec.name.trim()) return null;
  const items = Array.isArray(rec.items)
    ? rec.items.map(parseItem).filter((item): item is CartItem => item != null)
    : [];
  return {
    id: rec.id,
    name: rec.name.trim(),
    items,
    createdAt: typeof rec.createdAt === 'number' ? rec.createdAt : Date.now(),
  };
}

function parsePayload(raw: string | null): { lists: CartList[]; activeListId: string | null } {
  if (!raw) return { lists: [], activeListId: null };
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      const items = parsed.map(parseItem).filter((item): item is CartItem => item != null);
      if (items.length === 0) return { lists: [], activeListId: null };
      const list: CartList = { id: newId(), name: 'Kosár', items, createdAt: Date.now() };
      return { lists: [list], activeListId: list.id };
    }
    if (!parsed || typeof parsed !== 'object') return { lists: [], activeListId: null };
    const rec = parsed as Record<string, unknown>;
    const lists = Array.isArray(rec.lists)
      ? rec.lists.map(parseList).filter((list): list is CartList => list != null)
      : [];
    const active =
      typeof rec.activeListId === 'string' && lists.some((list) => list.id === rec.activeListId)
        ? rec.activeListId
        : (lists[0]?.id ?? null);
    return { lists, activeListId: active };
  } catch {
    return { lists: [], activeListId: null };
  }
}

function packRecipe(recipeId: string, lines: CartAddInput[]): CartItem[] {
  const now = Date.now();
  return lines
    .map((line, i) => {
      const name = line.name.trim();
      if (!name) return null;
      const item: CartItem = {
        id: newId(),
        name,
        qtyLabel: line.qtyLabel?.trim() || undefined,
        foodId: line.foodId || undefined,
        recipeId,
        checked: false,
        addedAt: now - i,
      };
      return item;
    })
    .filter((row): row is CartItem => row != null);
}

export function listProgress(list: CartList): { checked: number; total: number } {
  const total = list.items.length;
  const checked = list.items.filter((item) => item.checked).length;
  return { checked, total };
}

export function selectViewList(state: { lists: CartList[]; viewListId: string | null }): CartList | null {
  return state.lists.find((list) => list.id === state.viewListId) ?? null;
}

export function selectTotalCount(lists: CartList[]): number {
  return lists.reduce((sum, list) => sum + list.items.length, 0);
}

let hydrateGen = 0;

export const useCartStore = create<CartState>((set, get) => ({
  userId: null,
  lists: [],
  activeListId: null,
  viewListId: null,
  sheetOpen: false,
  picker: null,
  hydrated: false,

  hydrate: async (userId) => {
    const gen = ++hydrateGen;
    set({ userId, sheetOpen: false, picker: null, viewListId: null, hydrated: false });
    if (!userId) {
      set({ lists: [], activeListId: null, viewListId: null, hydrated: true });
      return;
    }
    const next = parsePayload(await getItem(namespaced(userId)));
    if (gen !== hydrateGen) return;
    set({ ...next, viewListId: null, hydrated: true });
  },

  createList: (name) => {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const { userId, lists } = get();
    if (lists.length >= MAX_LISTS) return null;
    const list: CartList = { id: newId(), name: trimmed, items: [], createdAt: Date.now() };
    const next = [...lists, list];
    set({ lists: next, activeListId: list.id, viewListId: list.id });
    persist(userId, next, list.id);
    return list.id;
  },

  renameList: (id, name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const { userId, lists, activeListId } = get();
    const next = lists.map((list) => (list.id === id ? { ...list, name: trimmed } : list));
    set({ lists: next });
    persist(userId, next, activeListId);
  },

  deleteList: (id) => {
    const { userId, lists, activeListId, viewListId } = get();
    const next = lists.filter((list) => list.id !== id);
    const nextActive = activeListId === id ? (next[0]?.id ?? null) : activeListId;
    const nextView = viewListId === id ? null : viewListId;
    set({ lists: next, activeListId: nextActive, viewListId: nextView });
    persist(userId, next, nextActive);
  },

  addItem: (input, listId) => {
    const name = input.name.trim();
    if (!name) return;
    const qtyLabel = input.qtyLabel?.trim() || undefined;
    const nextInput: CartAddInput = {
      name,
      qtyLabel,
      foodId: input.foodId,
      recipeId: input.recipeId,
    };
    const { userId, lists, activeListId, viewListId } = get();
    const targetId = listId ?? viewListId ?? activeListId;
    if (!targetId || !lists.some((list) => list.id === targetId)) return;
    const next = lists.map((list) => {
      if (list.id !== targetId) return list;
      const idx = list.items.findIndex((item) => isSameLine(item, nextInput));
      if (idx >= 0) {
        const prev = list.items[idx];
        const merged: CartItem = {
          ...prev,
          name,
          qtyLabel: qtyLabel ?? prev.qtyLabel,
          foodId: nextInput.foodId ?? prev.foodId,
          checked: false,
          addedAt: Date.now(),
        };
        return { ...list, items: [merged, ...list.items.filter((_, i) => i !== idx)] };
      }
      return {
        ...list,
        items: [
          {
            id: newId(),
            name,
            qtyLabel,
            foodId: nextInput.foodId,
            recipeId: nextInput.recipeId,
            checked: false,
            addedAt: Date.now(),
          },
          ...list.items,
        ],
      };
    });
    set({ lists: next, activeListId: targetId, viewListId: targetId });
    persist(userId, next, targetId);
  },

  updateItem: (id, patch) => {
    const { userId, lists, activeListId, viewListId } = get();
    const targetId = viewListId ?? activeListId;
    if (!targetId) return;
    const next = lists.map((list) => {
      if (list.id !== targetId) return list;
      return {
        ...list,
        items: list.items.map((item) => {
          if (item.id !== id) return item;
          return {
            ...item,
            name: patch.name?.trim() || item.name,
            qtyLabel: patch.qtyLabel !== undefined ? patch.qtyLabel.trim() || undefined : item.qtyLabel,
          };
        }),
      };
    });
    set({ lists: next });
    persist(userId, next, activeListId);
  },

  addRecipeIngredients: (recipeId, lines, listId) => {
    if (!recipeId) return;
    const packed = packRecipe(recipeId, lines);
    if (packed.length === 0) return;
    const { userId, lists, activeListId } = get();
    const targetId = listId ?? activeListId;
    if (!targetId || !lists.some((list) => list.id === targetId)) return;
    const next = lists.map((list) => {
      if (list.id !== targetId) return list;
      return {
        ...list,
        items: [...packed, ...list.items.filter((item) => item.recipeId !== recipeId)],
      };
    });
    set({ lists: next, activeListId: targetId, viewListId: targetId });
    persist(userId, next, targetId);
  },

  toggle: (id) => {
    const { userId, lists, activeListId, viewListId } = get();
    const targetId = viewListId ?? activeListId;
    if (!targetId) return;
    const next = lists.map((list) =>
      list.id === targetId
        ? { ...list, items: list.items.map((item) => (item.id === id ? { ...item, checked: !item.checked } : item)) }
        : list,
    );
    set({ lists: next });
    persist(userId, next, activeListId);
  },

  remove: (id) => {
    const { userId, lists, activeListId, viewListId } = get();
    const targetId = viewListId ?? activeListId;
    if (!targetId) return;
    const next = lists.map((list) =>
      list.id === targetId ? { ...list, items: list.items.filter((item) => item.id !== id) } : list,
    );
    set({ lists: next });
    persist(userId, next, activeListId);
  },

  clearChecked: () => {
    const { userId, lists, activeListId, viewListId } = get();
    const targetId = viewListId ?? activeListId;
    if (!targetId) return;
    const next = lists.map((list) =>
      list.id === targetId ? { ...list, items: list.items.filter((item) => !item.checked) } : list,
    );
    set({ lists: next });
    persist(userId, next, activeListId);
  },

  openSheet: () => set({ sheetOpen: true, viewListId: null }),
  openList: (id) => {
    const { userId, lists } = get();
    if (!lists.some((list) => list.id === id)) return;
    set({ sheetOpen: true, viewListId: id, activeListId: id });
    persist(userId, lists, id);
  },
  closeList: () => set({ viewListId: null }),
  closeSheet: () => set({ sheetOpen: false, viewListId: null }),
  openRecipePicker: (picker) => set({ picker }),
  closePicker: () => set({ picker: null }),
}));
