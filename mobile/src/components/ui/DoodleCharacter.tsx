import React from 'react';
import { View, StyleProp, ViewStyle } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';

interface DoodleCharacterProps {
  size?: number;
  style?: StyleProp<ViewStyle>;
}

export default function DoodleCharacter({ size = 100, style }: DoodleCharacterProps) {
  return (
    <View style={style}>
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Path
          d="M30,40 C20,35 15,45 15,55 C15,70 30,85 50,85 C70,85 85,70 85,55 C85,45 80,35 70,40 C75,30 70,20 60,15 C50,10 40,15 35,25 C25,20 20,30 30,40"
          fill="#d9e6da"
          stroke="#1A1A1A"
          strokeWidth="1.5"
        />
        <Circle cx="40" cy="55" r="3" fill="#1A1A1A" />
        <Circle cx="60" cy="55" r="3" fill="#1A1A1A" />
        <Path
          d="M45,65 Q50,70 55,65"
          fill="none"
          stroke="#1A1A1A"
          strokeLinecap="round"
          strokeWidth="1.5"
        />
        <Path
          d="M40,85 L40,95 M60,85 L60,95"
          stroke="#1A1A1A"
          strokeWidth="1.5"
        />
      </Svg>
    </View>
  );
}
