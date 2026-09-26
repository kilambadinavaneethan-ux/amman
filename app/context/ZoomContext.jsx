import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from "react";
import { StyleSheet } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { GestureHandlerRootView, GestureDetector, Gesture } from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
} from "react-native-reanimated";

const ZOOM_STORAGE_KEY = "@app_global_zoom_scale";
const MIN_ZOOM = 0.75;
const DEFAULT_ZOOM = 1.0;
const MAX_ZOOM = 2.5;

export const ZoomContext = createContext({
  scale: DEFAULT_ZOOM,
  zoomPercent: 100,
  minZoom: MIN_ZOOM,
  maxZoom: MAX_ZOOM,
  resetZoom: () => {},
  setZoomScale: (val) => {},
  zoomIn: () => {},
  zoomOut: () => {},
});

export const useZoom = () => useContext(ZoomContext);

export function ZoomProvider({ children }) {
  const scale = useSharedValue(DEFAULT_ZOOM);
  const savedScale = useSharedValue(DEFAULT_ZOOM);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);
  const [zoomPercent, setZoomPercent] = useState(100);

  // Helper to update React state & persist scale to AsyncStorage
  const updateZoomState = useCallback((newScale) => {
    const clamped = Math.min(Math.max(newScale, MIN_ZOOM), MAX_ZOOM);
    const percent = Math.round(clamped * 100);
    setZoomPercent(percent);
    AsyncStorage.setItem(ZOOM_STORAGE_KEY, String(clamped)).catch((err) =>
      console.warn("Failed to persist zoom level", err)
    );
  }, []);

  // Reset zoom scale to 100% default whenever the app launches / opens
  useEffect(() => {
    scale.value = DEFAULT_ZOOM;
    savedScale.value = DEFAULT_ZOOM;
    translateX.value = 0;
    translateY.value = 0;
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
    setZoomPercent(100);
    AsyncStorage.setItem(ZOOM_STORAGE_KEY, String(DEFAULT_ZOOM)).catch(() => {});
  }, []);

  // Manual reset to 100%
  const resetZoom = useCallback(() => {
    scale.value = withTiming(DEFAULT_ZOOM, { duration: 250 });
    translateX.value = withTiming(0, { duration: 250 });
    translateY.value = withTiming(0, { duration: 250 });
    savedScale.value = DEFAULT_ZOOM;
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
    updateZoomState(DEFAULT_ZOOM);
  }, [updateZoomState]);

  // Set explicit zoom scale
  const setZoomScale = useCallback((newScale) => {
    const clamped = Math.min(Math.max(newScale, MIN_ZOOM), MAX_ZOOM);
    scale.value = withTiming(clamped, { duration: 250 });
    savedScale.value = clamped;
    if (clamped === DEFAULT_ZOOM) {
      translateX.value = withTiming(0, { duration: 250 });
      translateY.value = withTiming(0, { duration: 250 });
      savedTranslateX.value = 0;
      savedTranslateY.value = 0;
    }
    updateZoomState(clamped);
  }, [updateZoomState]);

  // Zoom In step (+0.25x / +25%)
  const zoomIn = useCallback(() => {
    const nextScale = Math.min((zoomPercent + 25) / 100, MAX_ZOOM);
    setZoomScale(Math.round(nextScale * 100) / 100);
  }, [zoomPercent, setZoomScale]);

  // Zoom Out step (-0.25x / -25%)
  const zoomOut = useCallback(() => {
    const nextScale = Math.max((zoomPercent - 25) / 100, MIN_ZOOM);
    setZoomScale(Math.round(nextScale * 100) / 100);
  }, [zoomPercent, setZoomScale]);

  // Callback to sync JS state when gesture ends
  const onGestureEndJS = useCallback((finalScale) => {
    updateZoomState(finalScale);
  }, [updateZoomState]);

  // Fast & Responsive Pinch Gesture (2-finger pinch)
  const pinchGesture = Gesture.Pinch()
    .onUpdate((e) => {
      const scaleDelta = (e.scale - 1) * 1.8;
      let nextScale = savedScale.value * (1 + scaleDelta);
      if (nextScale < MIN_ZOOM) {
        nextScale = MIN_ZOOM;
      } else if (nextScale > MAX_ZOOM) {
        nextScale = MAX_ZOOM;
      }
      scale.value = nextScale;
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      runOnJS(onGestureEndJS)(scale.value);
    });

  // Fast 2-Finger Pan Gesture for panning/moving left, right, up, down
  const twoFingerPanGesture = Gesture.Pan()
    .minPointers(2)
    .maxPointers(2)
    .onUpdate((e) => {
      translateX.value = savedTranslateX.value + e.translationX * 1.4;
      translateY.value = savedTranslateY.value + e.translationY * 1.4;
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  // Fast & Responsive Double Tap to Reset Zoom & Center Position
  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .maxDuration(300)
    .onEnd((_e, success) => {
      if (success) {
        runOnJS(resetZoom)();
      }
    });

  // Compose gestures so 2-finger pinch, 2-finger drag pan, and double-tap to reset work simultaneously
  const composedGesture = Gesture.Simultaneous(
    pinchGesture,
    twoFingerPanGesture,
    doubleTapGesture
  );

  // Animated style applied to root content container
  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
        { scale: scale.value },
      ],
    };
  });

  const contextValue = useMemo(
    () => ({
      scale,
      zoomPercent,
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM,
      resetZoom,
      setZoomScale,
      zoomIn,
      zoomOut,
    }),
    [zoomPercent, resetZoom, setZoomScale, zoomIn, zoomOut]
  );

  return (
    <ZoomContext.Provider value={contextValue}>
      <GestureHandlerRootView style={styles.rootContainer}>
        <GestureDetector gesture={composedGesture}>
          <Animated.View style={[styles.animWrapper, animatedStyle]}>
            {children}
          </Animated.View>
        </GestureDetector>
      </GestureHandlerRootView>
    </ZoomContext.Provider>
  );
}

const styles = StyleSheet.create({
  rootContainer: {
    flex: 1,
  },
  animWrapper: {
    flex: 1,
  },
});

export default function ZoomRoutePlaceholder() {
  return null;
}
