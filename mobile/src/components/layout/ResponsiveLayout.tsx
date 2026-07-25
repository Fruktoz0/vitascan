import React from 'react';
import { View, StyleSheet, ViewStyle, StyleProp, Platform } from 'react-native';
import { useResponsive, CONTENT_MAX_WIDTH } from '../../hooks/useResponsive';

interface ResponsiveLayoutProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Extra horizontal padding inside the constrained shell */
  padded?: boolean;
}

/**
 * Mobile (<768): full width.
 * Desktop (≥768): max-width 1200px, centered.
 */
export function ResponsiveLayout({ children, style, padded = false }: ResponsiveLayoutProps) {
  const { isDesktop } = useResponsive();

  return (
    <View
      style={[
        styles.outer,
        isDesktop && styles.outerDesktop,
        padded && styles.padded,
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** Shared web cursor helper for Pressables / buttons */
export const webPointer =
  Platform.OS === 'web' ? ({ cursor: 'pointer' } as const) : null;

const styles = StyleSheet.create({
  outer: {
    flex: 1,
    width: '100%',
    alignSelf: 'stretch',
  },
  outerDesktop: {
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: 'center',
    width: '100%',
  },
  padded: {
    paddingHorizontal: 16,
  },
});

export default ResponsiveLayout;
