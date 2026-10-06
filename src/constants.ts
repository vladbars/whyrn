import type { WhyRNConfig } from './types';

declare const __DEV__: boolean;

export const IS_DEV = typeof __DEV__ !== 'undefined' ? __DEV__ : false;

// React Native / React internals that would only add noise. Always applied.
export const INTERNAL_EXCLUDE: RegExp[] = [
  /^(RN|RCT|__)/,
  /^Animated/,
  /^Virtualized/,
  /^LogBox/,
  /^(View|Text|TextImpl|Image|ImageBackground|ScrollView|ScrollViewBase|ScrollViewStickyHeader|FlatList|SectionList|CellRenderer|Pressable|TouchableOpacity|TouchableHighlight|TouchableWithoutFeedback|TouchableNativeFeedback|TextInput|Switch|ActivityIndicator|RefreshControl|SafeAreaView|KeyboardAvoidingView|Modal|StatusBar|AppContainer|PressabilityDebugView|Anonymous)$/,
];

export const DEFAULT_CONFIG: WhyRNConfig = {
  enabled: IS_DEV,
  trackHooks: true,
  logToConsole: true,
  heatmap: false,
  flashDuration: 600,
  flashColor: '#FF6B6B',
  heatmapColdColor: '#3B82F6',
  heatmapHotColor: '#EF4444',
  maxOverlays: 50,
  include: [],
  exclude: [],
};
