import { Outlet } from 'react-router-dom';
import CartHost from '../components/cart/CartHost';
import TabBar from './TabBar';

export default function AppShell() {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <Outlet />
      </div>
      <CartHost />
      <TabBar />
    </div>
  );
}
