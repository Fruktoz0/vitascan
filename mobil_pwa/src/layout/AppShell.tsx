import { Outlet } from 'react-router-dom';
import TabBar from './TabBar';

export default function AppShell() {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <Outlet />
      </div>
      <TabBar />
    </div>
  );
}
