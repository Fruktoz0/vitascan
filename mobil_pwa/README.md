# VitaScan Mobile PWA

React + Vite PWA clone of the Expo `mobile` app — same design tokens, same API, mobile-only layout. Post-login onboarding wizard is intentionally omitted.

## Setup

```bash
cd mobil_pwa
npm install
```

Create `.env` (already present locally if copied):

```
VITE_API_URL=http://192.168.1.115:3005
```

## Scripts

```bash
npm run dev      # http://localhost:5174
npm run build
npm run preview
```

## Notes

- Auth: login/register → home (no onboarding gate)
- Tabs: Home, Food Library, Scanner, Profile
- Stack: Personal data, Notifications, Date picker, Data vault, Admin
- PWA: `vite-plugin-pwa`, portrait standalone
