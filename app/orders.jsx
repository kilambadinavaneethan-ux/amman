import ProtectedRoute from "./components/ProtectedRoute";
import Orders from "./pages/Orders";

export default function OrdersRoute() {
  return (
    <ProtectedRoute>
      <Orders />
    </ProtectedRoute>
  );
}
