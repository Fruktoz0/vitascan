import { Colors } from '../design/tokens';
import {
  IconBakeryDining,
  IconEggAlt,
  IconIcecream,
  IconLunchDining,
  IconRamenDining,
} from '../components/ui/Icons';

export type MealType = 'BREAKFAST' | 'TIZORAI' | 'LUNCH' | 'UZSONNA' | 'DINNER' | 'SNACK';

export const MEAL_META: Record<MealType, { Icon: typeof IconBakeryDining; bg: string }> = {
  BREAKFAST: { Icon: IconBakeryDining, bg: Colors.dashboard.tertiaryFixed },
  TIZORAI: { Icon: IconEggAlt, bg: Colors.dashboard.primaryFixed },
  LUNCH: { Icon: IconLunchDining, bg: Colors.dashboard.errorContainer },
  UZSONNA: { Icon: IconIcecream, bg: Colors.dashboard.secondaryContainer },
  DINNER: { Icon: IconRamenDining, bg: Colors.dashboard.surfaceContainerHigh },
  SNACK: { Icon: IconIcecream, bg: Colors.dashboard.blobPeach },
};
