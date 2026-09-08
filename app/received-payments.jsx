import ProtectedRoute from "./components/ProtectedRoute";
import ReceivedPayments from "./pages/ReceivedPayments";

export default function ReceivedPaymentsRoute() {
  return (
    <ProtectedRoute>
      <ReceivedPayments />
    </ProtectedRoute>
  );
}
