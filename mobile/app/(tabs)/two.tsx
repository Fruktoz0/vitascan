import { Redirect } from 'expo-router';

// Ez a fájl az Expo template maradványa, átirányít a home-ra
export default function Two() {
  return <Redirect href="/(tabs)/home" />;
}
