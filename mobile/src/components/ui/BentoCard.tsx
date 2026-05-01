import React from 'react';
import { View, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { Colors } from '../../design/tokens';

interface BentoCardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  backgroundColor?: string;
  padding?: number;
}

export function BentoCard({ 
  children, 
  style, 
  backgroundColor = '#ffffff',
  padding = 20
}: BentoCardProps) {
  return (
    <View style={[styles.container, style]}>
      {/* Hard Shadow */}
      <View style={styles.shadow} />
      
      {/* Main Content Card */}
      <View style={[
        styles.inner, 
        { backgroundColor, padding }
      ]}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    marginBottom: 16,
  },
  shadow: {
    position: 'absolute',
    top: 4,
    left: 4,
    right: -4,
    bottom: -4,
    backgroundColor: Colors.dashboard.shadowHard,
    borderRadius: 32,
  },
  inner: {
    borderRadius: 32,
    borderWidth: 0.8,
    borderColor: Colors.dashboard.stroke,
    overflow: 'hidden',
  },
});
