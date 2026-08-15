import { Colors } from '../design/tokens';
import {
  IconBakeryDining,
  IconIcecream,
  IconLeafOutline,
  IconLunchDining,
  IconMilkOff,
  IconRamenDining,
  IconRestaurant,
  IconWheatOff,
} from '../components/ui/Icons';
import type { RecipeCategory, RecipeDietTag } from '../services/api';

export const RECIPE_CATEGORIES: RecipeCategory[] = [
  'BREAKFAST',
  'LUNCH',
  'DINNER',
  'SNACK',
  'DESSERT',
  'OTHER',
];

export const RECIPE_CATEGORY_META: Record<
  RecipeCategory,
  { Icon: typeof IconBakeryDining; bg: string; labelKey: string }
> = {
  BREAKFAST: {
    Icon: IconBakeryDining,
    bg: Colors.dashboard.tertiaryFixed,
    labelKey: 'recipes.categoryBreakfast',
  },
  LUNCH: {
    Icon: IconLunchDining,
    bg: Colors.dashboard.errorContainer,
    labelKey: 'recipes.categoryLunch',
  },
  DINNER: {
    Icon: IconRamenDining,
    bg: Colors.dashboard.surfaceContainerHigh,
    labelKey: 'recipes.categoryDinner',
  },
  SNACK: {
    Icon: IconIcecream,
    bg: Colors.dashboard.blobPeach,
    labelKey: 'recipes.categorySnack',
  },
  DESSERT: {
    Icon: IconIcecream,
    bg: Colors.dashboard.secondaryContainer,
    labelKey: 'recipes.categoryDessert',
  },
  OTHER: {
    Icon: IconRestaurant,
    bg: Colors.dashboard.primaryFixed,
    labelKey: 'recipes.categoryOther',
  },
};

export const RECIPE_DIET_TAGS: RecipeDietTag[] = ['GLUTEN_FREE', 'DAIRY_FREE', 'VEGAN'];

export const RECIPE_DIET_META: Record<
  RecipeDietTag,
  { Icon: typeof IconWheatOff; bg: string; labelKey: string }
> = {
  GLUTEN_FREE: {
    Icon: IconWheatOff,
    bg: Colors.dashboard.softOrange,
    labelKey: 'recipes.dietGlutenFree',
  },
  DAIRY_FREE: {
    Icon: IconMilkOff,
    bg: Colors.dashboard.tertiaryFixed,
    labelKey: 'recipes.dietDairyFree',
  },
  VEGAN: {
    Icon: IconLeafOutline,
    bg: Colors.dashboard.blobMint,
    labelKey: 'recipes.dietVegan',
  },
};
