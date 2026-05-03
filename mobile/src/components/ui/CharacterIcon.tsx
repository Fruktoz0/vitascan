import React from 'react';
import Svg, { Path, Circle, SvgProps } from 'react-native-svg';
import { Colors } from '../../design/tokens';

export function CharacterIcon(props: SvgProps) {
  return (
    <Svg
      viewBox="0 0 100 100"
      width={100}
      height={100}
      {...props}
    >
      <Path
        d="M30,40 C20,35 15,45 15,55 C15,70 30,85 50,85 C70,85 85,70 85,55 C85,45 80,35 70,40 C75,30 70,20 60,15 C50,10 40,15 35,25 C25,20 20,30 30,40"
        fill={Colors.dashboard.primaryFixed}
        stroke={Colors.dashboard.stroke}
        strokeWidth="1.5"
      />
      <Circle cx="40" cy="55" fill={Colors.dashboard.stroke} r="3" />
      <Circle cx="60" cy="55" fill={Colors.dashboard.stroke} r="3" />
      <Path
        d="M45,65 Q50,70 55,65"
        fill="none"
        stroke={Colors.dashboard.stroke}
        strokeLinecap="round"
        strokeWidth="1.5"
      />
      <Path
        d="M40,85 L40,95 M60,85 L60,95"
        stroke={Colors.dashboard.stroke}
        strokeWidth="1.5"
      />
    </Svg>
  );
}

export function SparkleIcon(props: SvgProps) {
  return (
    <Svg
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.5"
      viewBox="0 0 24 24"
      width={24}
      height={24}
      {...props}
    >
      <Path d="M12 3v3m0 12v3m9-9h-3M6 12H3m14.485-6.364l-2.121 2.121M7.636 17.657l-2.121 2.121m14.485 0l-2.121-2.121M7.636 6.343L5.515 4.222" />
    </Svg>
  );
}
