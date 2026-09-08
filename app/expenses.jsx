import ProtectedRoute from "./components/ProtectedRoute";
import Expenses from "./pages/Expenses";

export default function ExpensesRoute() {
  return (
    <ProtectedRoute>
      <Expenses />
    </ProtectedRoute>
  );
}
