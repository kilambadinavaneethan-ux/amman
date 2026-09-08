import React from "react";
import ProtectedRoute from "../components/ProtectedRoute";
import FirebaseManagementScreen from "../../src/screens/settings/FirebaseManagementScreen";

export default function FirebaseManagementRoute() {
  return (
    <ProtectedRoute>
      <FirebaseManagementScreen />
    </ProtectedRoute>
  );
}
