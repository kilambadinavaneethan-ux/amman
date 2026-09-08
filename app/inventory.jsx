import ProtectedRoute from "./components/ProtectedRoute";
import Inventory from "./pages/Inventory";

export default function InventoryRoute() {
  return (
    <ProtectedRoute>
      <Inventory />
    </ProtectedRoute>
  );
}
