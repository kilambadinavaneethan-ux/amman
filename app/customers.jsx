import ProtectedRoute from "./components/ProtectedRoute";
import Customers from "./pages/Customers";

export default function CustomersRoute() {
  return (
    <ProtectedRoute>
      <Customers />
    </ProtectedRoute>
  );
}

