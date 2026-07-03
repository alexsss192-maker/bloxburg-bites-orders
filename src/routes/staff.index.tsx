import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/staff/")({
  component: () => <Navigate to="/staff/orders" replace />,
});