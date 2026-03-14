import { Redirect } from 'expo-router';

// Ez a fájl csak átirányít, az igazi tartalom a (tabs)/home.tsx-ben van
export default function Index() {
  return <Redirect href="/(tabs)/home" />;
}
