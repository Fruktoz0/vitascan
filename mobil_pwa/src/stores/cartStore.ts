import { create } from 'zustand';
import { cartApi, type CartListDto } from '../services/api';
import { deleteItem, getItem } from '../services/storage';

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
  shared?: boolean;
  ownerLabel?: string;
  ownerId?: string;
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
  refreshFromServer: () => Promise<void>;
  createList: (name: string) => Promise<string | null>;
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

function fromDto(list: CartListDto): CartList {
  return {
    id: list.id,
    name: list.name,
    createdAt: list.createdAt,
    shared: list.shared,
    ownerLabel: list.ownerLabel,
    ownerId: list.ownerId,
    items: list.items.map((item) => ({
      id: item.id,
      name: item.name,
      qtyLabel: item.qtyLabel,
      foodId: item.foodId,
      recipeId: item.recipeId,
      checked: item.checked,
      addedAt: item.addedAt,
    })),
  };
}

function upsertList(lists: CartList[], next: CartList): CartList[] {
  const idx = lists.findIndex((list) => list.id === next.id);
  if (idx < 0) return [...lists, next];
  const copy = [...lists];
  copy[idx] = next;
  return copy;
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

function applyLists(
  set: (partial: Partial<CartState>) => void,
  get: () => CartState,
  lists: CartList[],
) {
  const { activeListId, viewListId } = get();
  const nextActive = lists.some((list) => list.id === activeListId) ? activeListId : (lists[0]?.id ?? null);
  const nextView = viewListId && lists.some((list) => list.id === viewListId) ? viewListId : null;
  set({ lists, activeListId: nextActive, viewListId: nextView, hydrated: true });
}

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
    try {
      let { lists } = await cartApi.list();
      if (gen !== hydrateGen) return;
      const own = lists.filter((list) => !list.shared);
      if (own.length === 0) {
        const local = parsePayload(await getItem(namespaced(userId)));
        if (local.lists.length > 0) {
          const migrated = await cartApi.migrate(
            local.lists.map((list) => ({
              name: list.name,
              items: list.items.map((item) => ({
                name: item.name,
                qtyLabel: item.qtyLabel,
                foodId: item.foodId,
                recipeId: item.recipeId,
                checked: item.checked,
                addedAt: item.addedAt,
              })),
            })),
          );
          lists = migrated.lists;
          await deleteItem(namespaced(userId));
        }
      }
      if (gen !== hydrateGen) return;
      applyLists(set, get, lists.map(fromDto));
    } catch {
      if (gen !== hydrateGen) return;
      const next = parsePayload(await getItem(namespaced(userId)));
      if (gen !== hydrateGen) return;
      set({ ...next, viewListId: null, hydrated: true });
    }
  },

  refreshFromServer: async () => {
    const { userId } = get();
    if (!userId) return;
    try {
      const { lists } = await cartApi.list();
      applyLists(set, get, lists.map(fromDto));
    } catch {
      /* keep current */
    }
  },

  createList: async (name) => {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const { lists } = get();
    if (lists.filter((list) => !list.shared).length >= MAX_LISTS) return null;
    try {
      const created = fromDto(await cartApi.createList(trimmed));
      const next = upsertList(get().lists, created);
      set({ lists: next, activeListId: created.id, viewListId: created.id });
      return created.id;
    } catch {
      return null;
    }
  },

  renameList: (id, name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    set({ lists: get().lists.map((list) => (list.id === id ? { ...list, name: trimmed } : list)) });
    void cartApi.renameList(id, trimmed).then((dto) => {
      set({ lists: upsertList(get().lists, fromDto(dto)) });
    });
  },

  deleteList: (id) => {
    const { lists, activeListId, viewListId } = get();
    const next = lists.filter((list) => list.id !== id);
    const nextActive = activeListId === id ? (next[0]?.id ?? null) : activeListId;
    const nextView = viewListId === id ? null : viewListId;
    set({ lists: next, activeListId: nextActive, viewListId: nextView });
    void cartApi.deleteList(id).catch(() => {
      void get().refreshFromServer();
    });
  },

  addItem: (input, listId) => {
    const name = input.name.trim();
    if (!name) return;
    const targetId = listId ?? get().viewListId ?? get().activeListId;
    if (!targetId) return;
    void cartApi
      .addItem(targetId, {
        name,
        qtyLabel: input.qtyLabel?.trim() || undefined,
        foodId: input.foodId,
        recipeId: input.recipeId,
      })
      .then(({ list }) => {
        set({ lists: upsertList(get().lists, fromDto(list)), activeListId: targetId, viewListId: targetId });
      });
  },

  updateItem: (id, patch) => {
    void cartApi
      .updateItem(id, {
        name: patch.name,
        qtyLabel: patch.qtyLabel,
      })
      .then(({ list }) => {
        set({ lists: upsertList(get().lists, fromDto(list)) });
      });
  },

  addRecipeIngredients: (recipeId, lines, listId) => {
    if (!recipeId) return;
    const packed = lines
      .map((line) => ({ name: line.name.trim(), qtyLabel: line.qtyLabel, foodId: line.foodId }))
      .filter((line) => line.name);
    if (packed.length === 0) return;
    const targetId = listId ?? get().activeListId;
    if (!targetId) return;
    void cartApi.addRecipe(targetId, recipeId, packed).then(({ list }) => {
      set({ lists: upsertList(get().lists, fromDto(list)), activeListId: targetId, viewListId: targetId });
    });
  },

  toggle: (id) => {
    const { lists, viewListId, activeListId } = get();
    const targetId = viewListId ?? activeListId;
    const list = lists.find((row) => row.id === targetId);
    const item = list?.items.find((row) => row.id === id);
    if (!item) return;
    const nextChecked = !item.checked;
    set({
      lists: lists.map((row) =>
        row.id === targetId
          ? { ...row, items: row.items.map((it) => (it.id === id ? { ...it, checked: nextChecked } : it)) }
          : row,
      ),
    });
    void cartApi.updateItem(id, { checked: nextChecked }).then(({ list: dto }) => {
      set({ lists: upsertList(get().lists, fromDto(dto)) });
    });
  },

  remove: (id) => {
    const { lists, viewListId, activeListId } = get();
    const targetId = viewListId ?? activeListId;
    set({
      lists: lists.map((row) =>
        row.id === targetId ? { ...row, items: row.items.filter((item) => item.id !== id) } : row,
      ),
    });
    void cartApi.deleteItem(id).then(({ list }) => {
      set({ lists: upsertList(get().lists, fromDto(list)) });
    });
  },

  clearChecked: () => {
    const targetId = get().viewListId ?? get().activeListId;
    if (!targetId) return;
    set({
      lists: get().lists.map((row) =>
        row.id === targetId ? { ...row, items: row.items.filter((item) => !item.checked) } : row,
      ),
    });
    void cartApi.clearChecked(targetId).then(({ list }) => {
      set({ lists: upsertList(get().lists, fromDto(list)) });
    });
  },

  openSheet: () => set({ sheetOpen: true, viewListId: null }),
  openList: (id) => {
    const { lists } = get();
    if (!lists.some((list) => list.id === id)) return;
    set({ sheetOpen: true, viewListId: id, activeListId: id });
  },
  closeList: () => set({ viewListId: null }),
  closeSheet: () => set({ sheetOpen: false, viewListId: null }),
  openRecipePicker: (picker) => set({ picker }),
  closePicker: () => set({ picker: null }),
}));
