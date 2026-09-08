import React from "react";
import { View, StyleSheet, ActivityIndicator, StyleProp, ViewStyle, ImageStyle } from "react-native";
import { Image as ExpoImage, ImageProps as ExpoImageProps } from "expo-image";
import { MaterialIcons } from "@expo/vector-icons";

export interface ImagePreviewProps extends Partial<ExpoImageProps> {
  uri: string | null | undefined;
  style?: StyleProp<ImageStyle>;
  containerStyle?: StyleProp<ViewStyle>;
  fallbackIcon?: keyof typeof MaterialIcons.glyphMap;
  fallbackIconSize?: number;
  fallbackIconColor?: string;
  borderRadius?: number;
}

/**
 * High-performance, lazy-loaded, memory & disk cached image component built with `expo-image`.
 */
export const ImagePreview: React.FC<ImagePreviewProps> = ({
  uri,
  style,
  containerStyle,
  fallbackIcon = "image",
  fallbackIconSize = 32,
  fallbackIconColor = "#94a3b8",
  borderRadius = 12,
  contentFit = "cover",
  placeholder,
  ...props
}) => {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(false);

  if (!uri || error) {
    return (
      <View style={[styles.fallbackContainer, { borderRadius }, containerStyle, style]}>
        <MaterialIcons name={fallbackIcon} size={fallbackIconSize} color={fallbackIconColor} />
      </View>
    );
  }

  return (
    <View style={[styles.imageWrapper, { borderRadius }, containerStyle]}>
      <ExpoImage
        source={{ uri }}
        style={[styles.image, { borderRadius }, style]}
        contentFit={contentFit}
        transition={200}
        cachePolicy="memory-disk"
        onLoadStart={() => {
          setLoading(true);
          setError(false);
        }}
        onLoadEnd={() => setLoading(false)}
        onError={() => {
          setLoading(false);
          setError(true);
        }}
        {...props}
      />
      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="small" color="#6366f1" />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  imageWrapper: {
    overflow: "hidden",
    position: "relative",
    backgroundColor: "#f1f5f9",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  fallbackContainer: {
    backgroundColor: "#f1f5f9",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(241, 245, 249, 0.7)",
    justifyContent: "center",
    alignItems: "center",
  },
});
export default ImagePreview;
