import { useEffect, useRef } from 'react';
import { cartApi } from '../../services/api';
import { useAuthStore } from '../../stores/authStore';
import { useCartStore } from '../../stores/cartStore';
import { useShareInbox } from '../../stores/shareInbox';
import CartSheet, { CartListPicker } from './CartSheet';

export default function CartHost() {
  const userId = useAuthStore((s) => s.user?.id ?? null);

  useEffect(() => {
    void useCartStore.getState().hydrate(userId);
    if (userId) void useShareInbox.getState().refresh();
  }, [userId]);

  const timer = useRef<number | null>(null);
  useEffect(() => {
    if (!userId) return;
    const flush = () => {
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        void useCartStore.getState().refreshFromServer();
      }, 40);
    };
    const stop = cartApi.subscribeEvents(flush);
    return () => {
      stop();
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [userId]);

  return (
    <>
      <CartSheet />
      <CartListPicker />
    </>
  );
}
