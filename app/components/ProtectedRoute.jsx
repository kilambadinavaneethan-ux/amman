import React, { useContext, useEffect } from "react";
import { useRouter } from "expo-router";
import { AuthContext } from "../context/AuthContext";
import SplashScreen from "../../src/screens/SplashScreen";

function ProtectedRoute({ children }) {
  const { user, loading } = useContext(AuthContext);
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      // User is not authenticated, redirect to login
      router.replace("/login");
    }
  }, [user, loading, router]);

  if (loading) {
    // Show splash loader screen while checking auth session state
    return <SplashScreen />;
  }

  // If session checks complete and user exists, render target screen children
  return user ? children : null;
}

export default ProtectedRoute;
