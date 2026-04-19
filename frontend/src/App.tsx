import { useState, useCallback, useEffect } from "react";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { SidebarProvider } from "@/components/ui/sidebar";

import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { DataBootstrap } from "@/components/DataBootstrap";

import AppSidebar from "@/components/AppSidebar";
import TopBar from "@/components/TopBar";
import ImportModal from "@/components/ImportModal";

import Login from "@/pages/Login";
import RegisterOrg from "@/pages/RegisterOrg";
import Dashboard from "@/pages/Dashboard";
import AnalyseIA from "@/pages/AnalyseIA";
import Encours from "@/pages/Encours";
import Factures from "@/pages/Factures";
import Previsions from "@/pages/Previsions";
import Actions from "@/pages/Actions";
import Rapports from "@/pages/Rapports";
import Parametres from "@/pages/Parametres";
import NotFound from "@/pages/NotFound";

import { hasData } from "@/lib/storage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            {/* Public routes */}
            <Route path="/login" element={<Login />} />
            <Route path="/register-org" element={<RegisterOrg />} />

            {/* Protected app shell */}
            <Route
              path="/*"
              element={
                <ProtectedRoute>
                  <DataBootstrap>
                    <AppShell />
                  </DataBootstrap>
                </ProtectedRoute>
              }
            />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

function AppShell() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [showImport, setShowImport] = useState(false);
  const location = useLocation();
  const { user } = useAuth();

  const handleDataChange = useCallback(() => {
    setRefreshKey(k => k + 1);
  }, []);

  useEffect(() => {
    // Auto-open the import modal only the first time a user lands in an empty workspace
    if (!user) return;
    if (!hasData() && location.pathname !== "/parametres") {
      setShowImport(true);
    }
  }, [location.pathname, user]);

  return (
    <>
      <SidebarProvider>
        <div className="min-h-screen flex w-full">
          <AppSidebar />
          <div className="flex-1 flex flex-col min-w-0">
            <TopBar refreshKey={refreshKey} />
            <main className="flex-1 overflow-auto bg-muted/30" key={refreshKey}>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/analyse-ia" element={<AnalyseIA />} />
                <Route path="/encours" element={<Encours />} />
                <Route path="/factures" element={<Factures />} />
                <Route path="/previsions" element={<Previsions />} />
                <Route path="/actions" element={<Actions />} />
                <Route path="/rapports" element={<Rapports />} />
                <Route path="/parametres" element={<Parametres onDataChange={handleDataChange} />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </main>
          </div>
        </div>
      </SidebarProvider>
      <ImportModal
        open={showImport}
        onClose={(imported) => {
          setShowImport(false);
          if (imported) handleDataChange();
        }}
      />
    </>
  );
}

export default App;
