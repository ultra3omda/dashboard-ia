import { useEffect, useState, ReactNode } from "react";
import { bootstrapStorage, clearCache, subscribeToStorage } from "@/lib/storage";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";

/**
 * Initial-data loader. Mounted inside ProtectedRoute so it only runs for
 * authenticated users. Populates the in-memory storage cache used by legacy
 * pages via `storage.ts` getters.
 *
 * Also rerenders children when the cache changes so that pages using
 * synchronous getters (getSoldeClients, getFactures, etc.) see fresh data
 * after an import or a settings update.
 */
export function DataBootstrap({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [cacheVersion, setCacheVersion] = useState(0);

  useEffect(() => {
    if (!user) {
      clearCache();
      setLoading(false);
      return;
    }
    let mounted = true;
    setLoading(true);
    bootstrapStorage()
      .catch(err => {
        console.error("bootstrapStorage failed:", err);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [user]);

  // Rerender children every time the cache notifies a change
  useEffect(() => {
    const unsubscribe = subscribeToStorage(() => {
      setCacheVersion(v => v + 1);
    });
    return unsubscribe;
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Chargement de vos données…</p>
        </div>
      </div>
    );
  }

  return <div key={cacheVersion}>{children}</div>;
}
