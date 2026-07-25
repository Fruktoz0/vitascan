import {
  IconBicycleOutline,
  IconBolt,
  IconMaleFemaleOutline,
  IconOpacity,
  IconPersonOutline,
  IconRestaurant,
} from '../components/ui/Icons';
import type { BodyPart } from '../services/api';

export const BODY_PARTS: BodyPart[] = ['ARM', 'THIGH', 'WAIST', 'FOREARM', 'HIP', 'CHEST'];

export const BODY_PART_META: Record<
  BodyPart,
  { labelKey: string; bg: string; Icon: typeof IconPersonOutline }
> = {
  ARM: { labelKey: 'bodyData.arm', bg: '#D8EADF', Icon: IconBolt },
  THIGH: { labelKey: 'bodyData.thigh', bg: '#D2E6EF', Icon: IconBicycleOutline },
  WAIST: { labelKey: 'bodyData.waist', bg: '#F0E6D4', Icon: IconPersonOutline },
  FOREARM: { labelKey: 'bodyData.forearm', bg: '#D8DDD6', Icon: IconOpacity },
  HIP: { labelKey: 'bodyData.hip', bg: '#F5D6DE', Icon: IconMaleFemaleOutline },
  CHEST: { labelKey: 'bodyData.chest', bg: '#EDE4D4', Icon: IconRestaurant },
};

export function isBodyPart(v: string | null | undefined): v is BodyPart {
  return !!v && (BODY_PARTS as string[]).includes(v);
}
