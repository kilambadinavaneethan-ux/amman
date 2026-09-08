import ProtectedRoute from "./components/ProtectedRoute";
import Home from "./pages/Home";

export default function HomeRoute() {
  return (
    <ProtectedRoute>
      <Home />
    </ProtectedRoute>
  );
}

