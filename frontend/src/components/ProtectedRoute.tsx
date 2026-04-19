import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth, type UserRole } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  return <>{children}</>;
}

export function RoleGuard({
  roles,
  children,
  fallback,
}: {
  roles: UserRole[];
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { hasRole } = useAuth();
  if (!hasRole(roles)) {
    return (
      <>
        {fallback ?? (
          <div className="p-8 text-center text-muted-foreground">
            <p className="font-semibold">Accès refusé</p>
            <p className="text-sm mt-1">Votre rôle ne permet pas d'accéder à cette page.</p>
          </div>
        )}
      </>
    );
  }
  return <>{children}</>;
}
