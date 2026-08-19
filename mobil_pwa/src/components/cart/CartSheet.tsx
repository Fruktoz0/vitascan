import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Colors } from '../../design/tokens';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import {
  listProgress,
  selectViewList,
  useCartStore,
  type CartItem,
  type CartList,
} from '../../stores/cartStore';
import DoodleCharacter from '../ui/DoodleCharacter';
import {
  IconAdd,
  IconArrowBack,
  IconCheck,
  IconChevronRight,
  IconDelete,
  IconExpandLess,
  IconExpandMore,
  IconShare,
  IconShoppingBasket,
} from '../ui/Icons';
import { SwipeDeleteRow } from '../ui/SwipeDeleteRow';
import { useShareInbox } from '../../stores/shareInbox';
import styles from './CartSheet.module.css';

const CART_UNITS = ['db', 'g', 'kg', 'ml', 'l', 'csomag', 'adag'] as const;
type CartUnit = (typeof CART_UNITS)[number];
const WHEEL_H = 40;

function sortItems(items: CartItem[]): CartItem[] {
  return [...items].sort((a, b) => {
    if (a.checked !== b.checked) return a.checked ? 1 : -1;
    return b.addedAt - a.addedAt;
  });
}

function lineText(item: CartItem, t: (key: string) => string): string {
  return item.qtyLabel ? `${item.name} — ${formatQtyLabel(item.qtyLabel, t)}` : item.name;
}

function formatQtyLabel(label: string, t: (key: string) => string): string {
  const { qty, unit } = parseQtyLabel(label);
  return `${qty} ${unitLabel(unit, t)}`;
}

function unitLabel(unit: CartUnit, t: (key: string) => string): string {
  const keys: Record<CartUnit, string> = {
    db: 'food.unitDb',
    g: 'food.unitG',
    kg: 'cart.unitKg',
    ml: 'cart.unitMl',
    l: 'cart.unitL',
    csomag: 'cart.unitPack',
    adag: 'food.unitAdag',
  };
  return t(keys[unit]);
}

function qtyOptions(unit: CartUnit): string[] {
  if (unit === 'g' || unit === 'ml') {
    return Array.from({ length: 40 }, (_, i) => String((i + 1) * 25));
  }
  if (unit === 'kg' || unit === 'l') {
    return ['0.5', '1', '1.5', '2', '2.5', '3', '4', '5'];
  }
  return Array.from({ length: 20 }, (_, i) => String(i + 1));
}

function parseQtyLabel(label?: string): { qty: string; unit: CartUnit } {
  const raw = (label ?? '').trim();
  const m = raw.match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/);
  if (!m) return { qty: '1', unit: 'db' };
  const u = m[2].toLowerCase().replace(/\./g, '').trim();
  const map: Record<string, CartUnit> = {
    db: 'db',
    pc: 'db',
    g: 'g',
    kg: 'kg',
    ml: 'ml',
    l: 'l',
    csomag: 'csomag',
    pack: 'csomag',
    adag: 'adag',
    serving: 'adag',
  };
  return { qty: m[1].replace(',', '.'), unit: map[u] ?? 'db' };
}

function withCurrent(options: string[], current: string): string[] {
  if (!current || options.includes(current)) return options;
  return [current, ...options];
}

async function shareText(title: string, text: string): Promise<'shared' | 'copied' | 'idle'> {
  try {
    if (typeof navigator.share === 'function') {
      await navigator.share({ title, text });
      return 'shared';
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return 'idle';
  }
  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    return 'idle';
  }
}

function WheelPicker({
  items,
  value,
  onChange,
  wide,
  boxed,
}: {
  items: string[];
  value: string;
  onChange: (value: string) => void;
  wide?: boolean;
  boxed?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const lock = useRef(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const i = Math.max(0, items.indexOf(value));
    lock.current = true;
    el.scrollTop = i * WHEEL_H;
    const t = window.setTimeout(() => {
      lock.current = false;
    }, 80);
    return () => window.clearTimeout(t);
  }, [value, items]);

  const step = (dir: -1 | 1) => {
    const i = Math.max(0, items.indexOf(value));
    const next = items[i + dir];
    if (next) onChange(next);
  };

  const wheel = (
    <div
      ref={ref}
      className={`${styles.wheel} ${wide ? styles.wheelWide : ''} ${boxed ? styles.wheelBoxed : ''}`}
      onScroll={() => {
        if (timer.current) window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => {
          const el = ref.current;
          if (!el || lock.current) return;
          const i = Math.min(items.length - 1, Math.max(0, Math.round(el.scrollTop / WHEEL_H)));
          el.scrollTo({ top: i * WHEEL_H, behavior: 'smooth' });
          const next = items[i];
          if (next && next !== value) onChange(next);
        }, 80);
      }}
    >
      {items.map((item) => (
        <div key={item} className={styles.wheelItem}>
          {item}
        </div>
      ))}
    </div>
  );

  if (!boxed) return wheel;

  const i = Math.max(0, items.indexOf(value));
  return (
    <div className={styles.wheelCue}>
      <button
        type="button"
        className={styles.wheelCueBtn}
        disabled={i <= 0}
        onClick={() => step(-1)}
        tabIndex={-1}
        aria-hidden
      >
        <IconExpandLess size={16} color={Colors.dashboard.stroke} />
      </button>
      {wheel}
      <button
        type="button"
        className={styles.wheelCueBtn}
        disabled={i >= items.length - 1}
        onClick={() => step(1)}
        tabIndex={-1}
        aria-hidden
      >
        <IconExpandMore size={16} color={Colors.dashboard.stroke} />
      </button>
    </div>
  );
}

function qtyToneClass(unit: CartUnit): string {
  const map: Record<CartUnit, string> = {
    db: styles.qtyDb,
    g: styles.qtyWeight,
    kg: styles.qtyWeight,
    ml: styles.qtyPack,
    l: styles.qtyPack,
    csomag: styles.qtyPack,
    adag: styles.qtyServing,
  };
  return map[unit];
}

function QtyUnitWheels({
  qty,
  unit,
  onQty,
  onUnit,
  t,
}: {
  qty: string;
  unit: CartUnit;
  onQty: (qty: string) => void;
  onUnit: (unit: CartUnit) => void;
  t: (key: string) => string;
}) {
  const qtys = withCurrent(qtyOptions(unit), qty);
  const units = CART_UNITS.map((u) => unitLabel(u, t));
  const unitValue = unitLabel(unit, t);
  return (
    <div className={styles.itemWheels}>
      <WheelPicker items={qtys} value={qty} onChange={onQty} />
      <WheelPicker
        items={units}
        value={unitValue}
        wide
        onChange={(label) => {
          const next = CART_UNITS.find((u) => unitLabel(u, t) === label);
          if (next) onUnit(next);
        }}
      />
    </div>
  );
}

const LIST_TONES = [styles.toneMint, styles.tonePeach, styles.toneLavender] as const;

function listToneClass(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash += id.charCodeAt(i) * (i + 1);
  return LIST_TONES[hash % LIST_TONES.length] ?? LIST_TONES[0];
}

function listShareChip(
  list: CartList,
  t: (key: string) => string,
  outgoingCartPartners: string[] = [],
): string | null {
  if (list.shared) {
    return list.ownerLabel ? `${t('cart.sharedBadge')} · ${list.ownerLabel}` : t('cart.sharedBadge');
  }
  const names =
    list.sharedWith && list.sharedWith.length > 0 ? list.sharedWith : outgoingCartPartners;
  if (names.length > 0) {
    return `${t('cart.sharedOutBadge')} · ${names.join(', ')}`;
  }
  return null;
}

function ListCard({ list, onClick }: { list: CartList; onClick: () => void }) {
  const { t } = useTranslation();
  const outgoingCartPartners = useShareInbox((s) => s.outgoingCartPartners);
  const { checked, total } = listProgress(list);
  const pct = total > 0 ? Math.round((checked / total) * 100) : 0;
  const left = Math.max(0, total - checked);
  const done = total > 0 && left === 0;
  const shareChip = listShareChip(list, t, outgoingCartPartners);
  return (
    <button type="button" className={styles.bento} onClick={onClick}>
      <span className={styles.bentoShadow} />
      <span className={`${styles.bentoInner} ${listToneClass(list.id)}`}>
        <span className={styles.listCardTop}>
          <span className={styles.listCardIcon}>
            <IconShoppingBasket size={18} color={Colors.dashboard.stroke} />
          </span>
          <span className={styles.listCardCopy}>
            <span className={styles.listCardName}>{list.name}</span>
            <span className={styles.listCardMeta}>
              {total === 0 ? t('cart.progressEmpty') : t('cart.progress', { checked, total })}
            </span>
            {total > 0 ? (
              <span className={styles.listCardTrack} aria-hidden>
                <span className={styles.listCardFill} style={{ width: `${pct}%` }} />
              </span>
            ) : null}
          </span>
          <span className={`${styles.remainPill} ${done ? styles.remainDone : ''}`}>
            {total === 0 ? (
              <span className={styles.remainUnit}>—</span>
            ) : done ? (
              <>
                <span className={styles.remainNum}>✓</span>
                <span className={styles.remainUnit}>{t('cart.done')}</span>
              </>
            ) : (
              <>
                <span className={styles.remainNum}>{left}</span>
                <span className={styles.remainUnit}>{t('cart.remainingShort')}</span>
              </>
            )}
          </span>
          <IconChevronRight size={18} color={Colors.dashboard.stroke} />
        </span>
        {shareChip ? <span className={styles.sharedChip}>{shareChip}</span> : null}
      </span>
    </button>
  );
}

function CreateListCard({
  submitLabel,
  autoFocus,
  onCreate,
}: {
  submitLabel: string;
  autoFocus?: boolean;
  onCreate: (name: string) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  return (
    <form
      className={styles.bento}
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = name.trim();
        if (!trimmed) return;
        onCreate(trimmed);
        setName('');
      }}
    >
      <span className={styles.bentoShadow} />
      <span className={`${styles.bentoInner} ${styles.createInner}`}>
        <input
          className={styles.nameInput}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('cart.newListPlaceholder')}
          maxLength={40}
          autoFocus={autoFocus}
          aria-label={t('cart.newList')}
        />
        <button type="submit" className={styles.addMini} disabled={!name.trim()} aria-label={submitLabel}>
          <IconAdd size={20} color={Colors.dashboard.stroke} />
        </button>
      </span>
    </form>
  );
}

export default function CartSheet() {
  const { t } = useTranslation();
  const titleId = useId();
  const open = useCartStore((s) => s.sheetOpen);
  const lists = useCartStore((s) => s.lists);
  const viewListId = useCartStore((s) => s.viewListId);
  const closeSheet = useCartStore((s) => s.closeSheet);
  const openList = useCartStore((s) => s.openList);
  const closeList = useCartStore((s) => s.closeList);
  const createList = useCartStore((s) => s.createList);
  const deleteList = useCartStore((s) => s.deleteList);
  const addItem = useCartStore((s) => s.addItem);
  const updateItem = useCartStore((s) => s.updateItem);
  const toggle = useCartStore((s) => s.toggle);
  const remove = useCartStore((s) => s.remove);
  const clearChecked = useCartStore((s) => s.clearChecked);
  const [shareHint, setShareHint] = useState<string | null>(null);
  const [itemName, setItemName] = useState('');
  const [itemQty, setItemQty] = useState('1');
  const [itemUnit, setItemUnit] = useState<CartUnit>('db');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const addPanelRef = useRef<HTMLFormElement>(null);

  const viewList = useMemo(() => selectViewList({ lists, viewListId }), [lists, viewListId]);
  const items = viewList?.items ?? [];
  const sorted = useMemo(() => sortItems(items), [items]);
  const checkedCount = useMemo(() => items.filter((item) => item.checked).length, [items]);
  const inDetail = Boolean(viewList);
  const outgoingCartPartners = useShareInbox((s) => s.outgoingCartPartners);
  const viewShareChip = viewList ? listShareChip(viewList, t, outgoingCartPartners) : null;

  useEffect(() => {
    if (open) void useShareInbox.getState().refresh();
  }, [open]);

  useEffect(() => {
    if (!open) {
      setShareHint(null);
      setItemName('');
      setItemQty('1');
      setItemUnit('db');
      setEditingId(null);
      setDeleteOpen(false);
      setAddOpen(false);
      return;
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (useCartStore.getState().viewListId) closeList();
        else closeSheet();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, closeSheet, closeList]);

  useEffect(() => {
    setAddOpen(false);
  }, [viewListId]);

  useEffect(() => {
    if (!addOpen) return;
    const closeIfOutside = (target: EventTarget | null) => {
      if (addPanelRef.current?.contains(target as Node)) return;
      setAddOpen(false);
    };
    const onPointerDown = (e: PointerEvent) => closeIfOutside(e.target);
    const onFocusIn = (e: FocusEvent) => closeIfOutside(e.target);
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('focusin', onFocusIn);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('focusin', onFocusIn);
    };
  }, [addOpen]);

  if (!open || typeof document === 'undefined') return null;

  const qtyLabelOf = (qty: string, unit: CartUnit) => `${qty} ${unitLabel(unit, t)}`;

  const handleAddItem = () => {
    addItem({ name: itemName, qtyLabel: qtyLabelOf(itemQty || '1', itemUnit) });
    setItemName('');
    setItemQty(itemUnit === 'g' || itemUnit === 'ml' ? '100' : '1');
  };

  const handleShare = () => {
    if (!viewList) return;
    const body = sorted.map((item) => `${item.checked ? '✓ ' : ''}${lineText(item, t)}`).join('\n');
    void shareText(viewList.name, `${viewList.name}\n${body}`).then((result) => {
      if (result === 'copied') setShareHint(t('cart.copied'));
    });
  };

  return createPortal(
    <div
      className={styles.overlay}
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeSheet();
      }}
    >
      <div
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <header className={styles.header}>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={inDetail ? closeList : closeSheet}
            aria-label={t('common.back')}
          >
            <IconArrowBack size={20} color={Colors.dashboard.stroke} />
          </button>
          <div className={styles.headerText}>
            <h2 id={titleId} className={styles.title}>
              {inDetail ? viewList!.name : t('cart.title')}
            </h2>
            {viewShareChip ? <span className={styles.sharedChip}>{viewShareChip}</span> : null}
            <p className={styles.subtitle}>
              {inDetail
                ? items.length === 0
                  ? t('cart.progressEmpty')
                  : t('cart.progress', { checked: checkedCount, total: items.length })
                : t('cart.listsCount', { count: lists.length })}
            </p>
          </div>
          {inDetail && !viewList?.shared ? (
            <button
              type="button"
              className={styles.closeBtn}
              onClick={() => setDeleteOpen(true)}
              aria-label={t('cart.deleteList')}
            >
              <IconDelete size={18} color={Colors.dashboard.stroke} />
            </button>
          ) : (
            <span className={styles.headerSpacer} aria-hidden />
          )}
        </header>

        {inDetail ? (
          <form
            ref={addPanelRef}
            className={styles.addPanel}
            onFocus={() => setAddOpen(true)}
            onClick={() => setAddOpen(true)}
            onSubmit={(e) => {
              e.preventDefault();
              handleAddItem();
            }}
          >
            <div className={styles.bento}>
              <span className={styles.bentoShadow} />
              <div className={`${styles.bentoInner} ${styles.addInner} ${addOpen ? styles.addInnerOpen : ''}`}>
                <div className={styles.addRow}>
                  <input
                    className={styles.addName}
                    value={itemName}
                    onChange={(e) => setItemName(e.target.value)}
                    placeholder={t('cart.itemNamePlaceholder')}
                    maxLength={80}
                    aria-label={t('cart.itemNamePlaceholder')}
                  />
                  <button
                    type="submit"
                    className={styles.addMini}
                    disabled={!itemName.trim()}
                    aria-label={t('cart.add')}
                  >
                    <IconAdd size={22} color={Colors.dashboard.stroke} />
                  </button>
                </div>
                {addOpen ? (
                  <div className={styles.addMeta}>
                    <div className={styles.addQty}>
                      <WheelPicker
                        boxed
                        items={withCurrent(qtyOptions(itemUnit), itemQty)}
                        value={itemQty}
                        onChange={setItemQty}
                      />
                    </div>
                    <div className={styles.addUnit}>
                      <WheelPicker
                        boxed
                        wide
                        items={CART_UNITS.map((u) => unitLabel(u, t))}
                        value={unitLabel(itemUnit, t)}
                        onChange={(label) => {
                          const next = CART_UNITS.find((u) => unitLabel(u, t) === label);
                          if (!next) return;
                          setItemUnit(next);
                          const opts = qtyOptions(next);
                          if (!opts.includes(itemQty)) setItemQty(opts[0] ?? '1');
                        }}
                      />
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </form>
        ) : null}

        <div className={styles.body}>
          {!inDetail ? (
            <>
              {lists.length === 0 ? (
                <div className={styles.empty}>
                  <DoodleCharacter size={72} mood="curious" />
                  <p className={styles.emptyTitle}>{t('cart.emptyNoLists')}</p>
                  <p className={styles.emptyHint}>{t('cart.emptyHint')}</p>
                </div>
              ) : (
                <div className={styles.cardList}>
                  {lists.map((list) => (
                    <ListCard key={list.id} list={list} onClick={() => openList(list.id)} />
                  ))}
                </div>
              )}
              <CreateListCard
                submitLabel={t('cart.createList')}
                autoFocus={lists.length === 0}
                onCreate={(name) => {
                  void createList(name);
                }}
              />
            </>
          ) : sorted.length === 0 ? (
            <div className={styles.empty}>
              <DoodleCharacter size={64} mood="calm" />
              <p className={styles.emptyTitle}>{t('cart.emptyTitle')}</p>
              <p className={styles.emptyHint}>{t('cart.emptyListHint')}</p>
            </div>
          ) : (
            <ul className={styles.list}>
              {sorted.map((item) => {
                const parsed = parseQtyLabel(item.qtyLabel);
                const editing = editingId === item.id;
                return (
                  <li key={item.id} className={styles.itemSlot}>
                    <SwipeDeleteRow
                      enabled={!editing}
                      deleteLabel={t('common.delete')}
                      onDelete={() => remove(item.id)}
                    >
                      <div className={`${styles.itemBento} ${item.checked ? styles.rowChecked : ''}`}>
                        <span className={styles.itemShadow} />
                        <div className={`${styles.itemInner} ${editing && !item.checked ? styles.itemInnerEditing : ''}`}>
                          <button
                            type="button"
                            className={`${styles.check} ${item.checked ? styles.checkOn : ''}`}
                            onClick={() => {
                              if (editing) setEditingId(null);
                              toggle(item.id);
                            }}
                            aria-pressed={item.checked}
                            aria-label={item.name}
                          >
                            {item.checked ? <IconCheck size={16} color={Colors.dashboard.stroke} /> : null}
                          </button>
                          <button
                            type="button"
                            className={styles.rowMain}
                            onClick={() => {
                              if (editing) setEditingId(null);
                              toggle(item.id);
                            }}
                          >
                            <span className={styles.rowName}>{item.name}</span>
                          </button>
                          {editing && !item.checked ? (
                            <QtyUnitWheels
                              qty={parsed.qty}
                              unit={parsed.unit}
                              t={t}
                              onQty={(qty) => updateItem(item.id, { qtyLabel: qtyLabelOf(qty, parsed.unit) })}
                              onUnit={(unit) => {
                                const opts = qtyOptions(unit);
                                const qty = opts.includes(parsed.qty) ? parsed.qty : (opts[0] ?? '1');
                                updateItem(item.id, { qtyLabel: qtyLabelOf(qty, unit) });
                              }}
                            />
                          ) : item.qtyLabel ? (
                            item.checked ? (
                              <span className={`${styles.qtyChip} ${qtyToneClass(parsed.unit)}`}>
                                <span className={styles.qtyNum}>{parsed.qty}</span>
                                <span className={styles.qtyUnit}>{unitLabel(parsed.unit, t)}</span>
                              </span>
                            ) : (
                              <button
                                type="button"
                                className={`${styles.qtyChip} ${qtyToneClass(parsed.unit)}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingId(item.id);
                                }}
                              >
                                <span className={styles.qtyNum}>{parsed.qty}</span>
                                <span className={styles.qtyUnit}>{unitLabel(parsed.unit, t)}</span>
                              </button>
                            )
                          ) : null}
                        </div>
                      </div>
                    </SwipeDeleteRow>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {inDetail && items.length > 0 ? (
          <footer className={styles.footer}>
            {shareHint ? <p className={styles.shareHint}>{shareHint}</p> : null}
            <div className={styles.footerRow}>
              <button
                type="button"
                className={styles.ghostBtn}
                disabled={checkedCount === 0}
                onClick={clearChecked}
              >
                {t('cart.clearChecked')}
              </button>
              <button type="button" className={styles.shareBtn} onClick={handleShare}>
                <IconShare size={18} color={Colors.dashboard.stroke} />
                {t('cart.share')}
              </button>
            </div>
          </footer>
        ) : null}

        <ConfirmDialog
          visible={deleteOpen && Boolean(viewList)}
          title={t('cart.deleteList')}
          message={t('cart.deleteListMessage', { name: viewList?.name ?? '' })}
          confirmLabel={t('common.delete')}
          cancelLabel={t('common.cancel')}
          destructive
          onConfirm={() => {
            if (viewList) deleteList(viewList.id);
            setDeleteOpen(false);
          }}
          onClose={() => setDeleteOpen(false)}
        />
      </div>
    </div>,
    document.body,
  );
}

export function CartListPicker() {
  const { t } = useTranslation();
  const titleId = useId();
  const picker = useCartStore((s) => s.picker);
  const lists = useCartStore((s) => s.lists);
  const closePicker = useCartStore((s) => s.closePicker);
  const createList = useCartStore((s) => s.createList);
  const addRecipeIngredients = useCartStore((s) => s.addRecipeIngredients);
  const openList = useCartStore((s) => s.openList);

  if (!picker || typeof document === 'undefined') return null;

  const commit = (listId: string) => {
    addRecipeIngredients(picker.recipeId, picker.lines, listId);
    closePicker();
    openList(listId);
  };

  return createPortal(
    <div
      className={styles.pickerOverlay}
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) closePicker();
      }}
    >
      <div
        className={styles.pickerSheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className={styles.pickerTitle}>
          {t('cart.pickList')}
        </h2>
        <p className={styles.pickerHint}>{t('cart.pickListHint', { title: picker.recipeTitle })}</p>
        {lists.length > 0 ? (
          <div className={styles.cardList}>
            {lists.map((list) => (
              <ListCard key={list.id} list={list} onClick={() => commit(list.id)} />
            ))}
          </div>
        ) : null}
        <div className={styles.pickerCreate}>
          <CreateListCard
            submitLabel={t('cart.createAndAdd')}
            autoFocus={lists.length === 0}
            onCreate={async (name) => {
              const id = await createList(name);
              if (id) commit(id);
            }}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}
