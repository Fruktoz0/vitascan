import { useEffect } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { useCartStore } from '../../stores/cartStore';
import CartSheet, { CartListPicker } from './CartSheet';

export default function CartHost() {
  const userId = useAuthStore((s) => s.user?.id ?? null);

  useEffect(() => {
    void useCartStore.getState().hydrate(userId);
  }, [userId]);

  return (
    <>
      <CartSheet />
      <CartListPicker />
    </>
  );
}
