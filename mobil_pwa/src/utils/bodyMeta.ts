import { Colors } from '../design/tokens';
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
  ARM: { labelKey: 'bodyData.arm', bg: Colors.dashboard.primaryFixed, Icon: IconBolt },
  THIGH: { labelKey: 'bodyData.thigh', bg: Colors.dashboard.tertiaryFixed, Icon: IconBicycleOutline },
  WAIST: { labelKey: 'bodyData.waist', bg: '#F4E5C2', Icon: IconPersonOutline },
  FOREARM: { labelKey: 'bodyData.forearm', bg: '#D4E0D8', Icon: IconOpacity },
  HIP: { labelKey: 'bodyData.hip', bg: '#F5D6E0', Icon: IconMaleFemaleOutline },
  CHEST: { labelKey: 'bodyData.chest', bg: '#E8DCC8', Icon: IconRestaurant },
};

export function isBodyPart(v: string | null | undefined): v is BodyPart {
  return !!v && (BODY_PARTS as string[]).includes(v);
}
