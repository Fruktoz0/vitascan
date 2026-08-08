import type { CSSProperties } from 'react';
import type { IconType } from 'react-icons';
import {
  MdAdd,
  MdAddCircle,
  MdArrowBack,
  MdArrowForward,
  MdBakeryDining,
  MdBolt,
  MdCalendarMonth,
  MdCalendarToday,
  MdCheck,
  MdChevronLeft,
  MdChevronRight,
  MdClose,
  MdCrisisAlert,
  MdDinnerDining,
  MdDirectionsWalk,
  MdDownload,
  MdEdit,
  MdEggAlt,
  MdEmojiEvents,
  MdEnergySavingsLeaf,
  MdEvent,
  MdFavorite,
  MdFavoriteBorder,
  MdFlashlightOff,
  MdFlashlightOn,
  MdGrain,
  MdHeight,
  MdIcecream,
  MdLocalFireDepartment,
  MdLockOutline,
  MdLogout,
  MdLunchDining,
  MdMonitorWeight,
  MdMoreHoriz,
  MdOpacity,
  MdOutlineEmail,
  MdOutlineKeyboard,
  MdOutlineManageAccounts,
  MdOutlineMilitaryTech,
  MdOutlineNote,
  MdPeopleOutline,
  MdPersonOutline,
  MdPhotoCamera,
  MdPhotoLibrary,
  MdPieChartOutline,
  MdPsychology,
  MdPublic,
  MdQrCodeScanner,
  MdRamenDining,
  MdRefresh,
  MdRemove,
  MdRestaurant,
  MdScience,
  MdScreenRotation,
  MdSearch,
  MdShield,
  MdStar,
  MdThumbDownOffAlt,
  MdThumbUpOffAlt,
  MdVerified,
  MdVisibility,
  MdVisibilityOff,
  MdWaterDrop,
  MdWhatshot,
  MdFitnessCenter,
  MdExpandMore,
  MdExpandLess,
  MdContentCopy,
} from 'react-icons/md';
import { FaAppleAlt } from 'react-icons/fa';
import {
  IoBicycleOutline,
  IoBook,
  IoBookOutline,
  IoFitness,
  IoFitnessOutline,
  IoHome,
  IoHomeOutline,
  IoMaleFemaleOutline,
  IoNotificationsOutline,
  IoPeople,
  IoPerson,
  IoPersonOutline,
  IoQrCode,
  IoQrCodeOutline,
  IoRestaurantOutline,
  IoScaleOutline,
  IoWater,
  IoWaterOutline,
} from 'react-icons/io5';

export type AppIconProps = {
  size?: number;
  color?: string;
  className?: string;
  style?: CSSProperties;
};

function wrap(Icon: IconType) {
  return function AppIcon({ size = 20, color = 'currentColor', className, style }: AppIconProps) {
    return <Icon size={size} color={color} className={className} style={style} />;
  };
}

export const IconAdd = wrap(MdAdd);
export const IconRemove = wrap(MdRemove);
export const IconAddCircle = wrap(MdAddCircle);
export const IconArrowBack = wrap(MdArrowBack);
export const IconArrowForward = wrap(MdArrowForward);
export const IconBakeryDining = wrap(MdBakeryDining);
export const IconLunchDining = wrap(MdLunchDining);
export const IconRamenDining = wrap(MdRamenDining);
export const IconIcecream = wrap(MdIcecream);
export const IconCalendarToday = wrap(MdCalendarToday);
export const IconCheck = wrap(MdCheck);
export const IconChevronLeft = wrap(MdChevronLeft);
export const IconChevronRight = wrap(MdChevronRight);
export const IconClose = wrap(MdClose);
export const IconDownload = wrap(MdDownload);
export const IconEdit = wrap(MdEdit);
export const IconEggAlt = wrap(MdEggAlt);
export const IconGrain = wrap(MdGrain);
export const IconEmailOutline = wrap(MdOutlineEmail);
export const IconEvent = wrap(MdEvent);
export const IconFire = wrap(MdLocalFireDepartment);
export const IconHeight = wrap(MdHeight);
export const IconLocalFire = wrap(MdLocalFireDepartment);
export const IconLockOutline = wrap(MdLockOutline);
export const IconLogout = wrap(MdLogout);
export const IconOpacity = wrap(MdOpacity);
export const IconPersonOutline = wrap(MdPersonOutline);
export const IconQrCodeScanner = wrap(MdQrCodeScanner);
export const IconRestaurant = wrap(MdRestaurant);
export const IconDirectionsWalk = wrap(MdDirectionsWalk);
export const IconSearch = wrap(MdSearch);
export const IconShield = wrap(MdShield);
export const IconWaterDrop = wrap(MdWaterDrop);
export const IconWeight = wrap(MdMonitorWeight);
export const IconFlashlight = wrap(MdFlashlightOn);
export const IconFlashlightOff = wrap(MdFlashlightOff);
export const IconKeyboardOutline = wrap(MdOutlineKeyboard);
export const IconEarth = wrap(MdPublic);
export const IconStar = wrap(MdStar);
export const IconTrophy = wrap(MdEmojiEvents);
export const IconMedalOutline = wrap(MdOutlineMilitaryTech);
export const IconTarget = wrap(MdCrisisAlert);
export const IconAccountEditOutline = wrap(MdOutlineManageAccounts);
export const IconSilverware = wrap(MdDinnerDining);
export const IconCalendarMonthOutline = wrap(MdCalendarMonth);
export const IconNoteOutline = wrap(MdOutlineNote);
export const IconFireCommunity = wrap(MdWhatshot);
export const IconThumbDown = wrap(MdThumbDownOffAlt);
export const IconThumbUp = wrap(MdThumbUpOffAlt);
export const IconBolt = wrap(MdBolt);
export const IconPieChartOutline = wrap(MdPieChartOutline);
export const IconApple = wrap(FaAppleAlt);
export const IconLeaf = wrap(MdEnergySavingsLeaf);
export const IconBrain = wrap(MdPsychology);
export const IconPhotoCamera = wrap(MdPhotoCamera);
export const IconPhotoLibrary = wrap(MdPhotoLibrary);
export const IconHeart = wrap(MdFavorite);
export const IconHeartOutline = wrap(MdFavoriteBorder);
export const IconScience = wrap(MdScience);
export const IconVerified = wrap(MdVerified);
export const IconVisibility = wrap(MdVisibility);
export const IconVisibilityOff = wrap(MdVisibilityOff);
export const IconPeopleOutline = wrap(MdPeopleOutline);
export const IconRestaurantOutline = wrap(IoRestaurantOutline);
export const IconHome = wrap(IoHome);
export const IconHomeOutline = wrap(IoHomeOutline);
export const IconBook = wrap(IoBook);
export const IconBookOutline = wrap(IoBookOutline);
export const IconQrCode = wrap(IoQrCode);
export const IconQrCodeOutline = wrap(IoQrCodeOutline);
export const IconPersonFilled = wrap(IoPerson);
export const IconPersonOutlineIo = wrap(IoPersonOutline);
export const IconNotificationsOutline = wrap(IoNotificationsOutline);
export const IconWater = wrap(IoWater);
export const IconWaterOutline = wrap(IoWaterOutline);
export const IconPeople = wrap(IoPeople);
export const IconScaleOutline = wrap(IoScaleOutline);
export const IconMoreHoriz = wrap(MdMoreHoriz);
export const IconBicycleOutline = wrap(IoBicycleOutline);
export const IconMaleFemaleOutline = wrap(IoMaleFemaleOutline);
export const IconFitness = wrap(IoFitness);
export const IconFitnessOutline = wrap(IoFitnessOutline);
export const IconFitnessCenter = wrap(MdFitnessCenter);
export const IconExpandMore = wrap(MdExpandMore);
export const IconExpandLess = wrap(MdExpandLess);
export const IconContentCopy = wrap(MdContentCopy);
export const IconRefresh = wrap(MdRefresh);
export const IconScreenRotation = wrap(MdScreenRotation);

export const TAB_ICONS = {
  home: { outline: IconHomeOutline, filled: IconHome },
  diary: { outline: IconBookOutline, filled: IconBook },
  scan: { outline: IconQrCodeOutline, filled: IconQrCode },
  body: { outline: IconScaleOutline, filled: IconScaleOutline },
  fitness: { outline: IconFitnessOutline, filled: IconFitness },
  profile: { outline: IconPersonOutlineIo, filled: IconPersonFilled },
} as const;
