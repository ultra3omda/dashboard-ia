import { useState, useCallback, useEffect } from "react";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { SidebarProvider } from "@/components/ui/sidebar";
import AppSidebar from "@/components/AppSidebar";
import TopBar from "@/components/TopBar";
import ImportModal from "@/components/ImportModal";
import Dashboard from "@/pages/Dashboard";
import AnalyseIA from "@/pages/AnalyseIA";
import Encours from "@/pages/Encours";
import Factures from "@/pages/Factures";
import Previsions from "@/pages/Previsions";
import Actions from "@/pages/Actions";
import Parametres from "@/pages/Parametres";
import NotFound from "@/pages/NotFound";
import { hasData, getSoldeClients, getActiveFactures, getActions } from "@/lib/storage";

const queryClient = new QueryClient();

function DebugPanel() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "d") {
        e.preventDefault();
        setVisible(v => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  if (!visible) return null;

  const solde = getSoldeClients();
  const factures = getActiveFactures();
  const actions = getActions();
  const lsKeys = Object.keys(localStorage).filter(k => k.startsWith("medianet_"));

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[9999] bg-foreground text-background p-4 max-h-[50vh] overflow-auto font-mono text-xs">
      <div className="flex justify-between items-center mb-2">
        <span className="font-bold text-sm">🐛 Debug Panel (Ctrl+D to close)</span>
        <button onClick={() => setVisible(false)} className="px-2 py-0.5 bg-background text-foreground rounded">Close</button>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="font-bold mb-1">localStorage keys:</p>
          {lsKeys.map(k => {
            const raw = localStorage.getItem(k);
            const size = raw ? (raw.length / 1024).toFixed(1) + " KB" : "empty";
            return <p key={k}>{k}: {size}</p>;
          })}
          {lsKeys.length === 0 && <p className="text-red-400">No medianet_* keys found</p>}
        </div>
        <div>
          <p className="font-bold mb-1">Row counts:</p>
          <p>Solde clients: {solde.length}</p>
          <p>Active factures: {factures.length}</p>
          <p>Actions: {actions.length}</p>
        </div>
      </div>
      {solde.length > 0 && (
        <div className="mt-2">
          <p className="font-bold mb-1">Solde sample (first 3):</p>
          <pre className="whitespace-pre-wrap">{JSON.stringify(solde.slice(0, 3), null, 2)}</pre>
        </div>
      )}
      {factures.length > 0 && (
        <div className="mt-2">
          <p className="font-bold mb-1">Factures sample (first 3):</p>
          <pre className="whitespace-pre-wrap">{JSON.stringify(factures.slice(0, 3), null, 2)}</pre>
        </div>
      )}
    </div>
  );
}

const App = () => {
  const [refreshKey, setRefreshKey] = useState(0);

  const handleDataChange = useCallback(() => {
    setRefreshKey(k => k + 1);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AppInner refreshKey={refreshKey} handleDataChange={handleDataChange} />
          <DebugPanel />
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

function AppInner({ refreshKey, handleDataChange }: { refreshKey: number; handleDataChange: () => void }) {
  const [showImport, setShowImport] = useState(false);
  const location = useLocation();

  useEffect(() => {
    // On masque le modal d'import global sur la page Analyse IA
    // (celle-ci gère son propre upload de Balance.xlsx via iframe).
    if (location.pathname.startsWith("/analyse-ia")) return;
    if (!hasData()) setShowImport(true);
  }, [location.pathname]);

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
