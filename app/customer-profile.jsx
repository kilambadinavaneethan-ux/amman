import ProtectedRoute from "./components/ProtectedRoute";
import CustomerProfile from "./pages/CustomerProfile";

export default function CustomerProfileRoute() {
  return (
    <ProtectedRoute>
      <CustomerProfile />
    </ProtectedRoute>
  );
}
