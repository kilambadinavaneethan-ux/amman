import React from "react";
import { StyleSheet, View } from "react-native";

interface AnimatedPageProps {
  children: React.ReactNode;
  style?: any;
}

export default function AnimatedPage({ children, style }: AnimatedPageProps) {
  return (
    <View style={[styles.container, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

