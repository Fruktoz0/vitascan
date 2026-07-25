import { useWindowDimensions } from 'react-native';

export const BREAKPOINT_DESKTOP = 768;
export const CONTENT_MAX_WIDTH = 1200;

export function useResponsive() {
  const { width, height } = useWindowDimensions();
  const isDesktop = width >= BREAKPOINT_DESKTOP;
  return {
    width,
    height,
    isDesktop,
    contentMaxWidth: isDesktop ? CONTENT_MAX_WIDTH : width,
    /** Approximate column count for grids */
    columns: width >= 1100 ? 3 : width >= BREAKPOINT_DESKTOP ? 2 : 1,
  };
}
