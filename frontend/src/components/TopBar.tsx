import { useMemo } from "react";

import { SidebarTrigger } from "@/components/ui/sidebar";
import { getSoldeClients, getActiveFactures } from "@/lib/storage";

function formatTND(amount: number): string {
  return new Intl.NumberFormat("fr-TN", { style: "decimal", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount) + " TND";
}

export default function TopBar({ refreshKey }: { refreshKey: number }) {
  const { totalEncours, encoursHorsGroupe, todayStr } = useMemo(() => {
    const solde = getSoldeClients();
    const factures = getActiveFactures();

    const totalEncours = solde.reduce((sum, c) => sum + (c.montantDu > 0 ? c.montantDu : 0), 0);

    // Build group set from invoices
    const groupNames = new Set<string>();
    factures.forEach(f => { if (f.isCustomerGroup) groupNames.add(f.nomClient.toLowerCase().trim()); });

    const encoursHorsGroupe = solde
      .filter(c => !groupNames.has(c.nom.toLowerCase().trim()))
      .reduce((sum, c) => sum + (c.montantDu > 0 ? c.montantDu : 0), 0);

    const todayStr = new Date().toLocaleDateString("fr-FR", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

    return { totalEncours, encoursHorsGroupe, todayStr };
  }, [refreshKey]);

  return (
    <header className="h-14 border-b bg-background flex items-center justify-between px-4 shrink-0">
      <div className="flex items-center gap-3">
        <SidebarTrigger />
      </div>
      <div className="flex items-center gap-6 text-sm">
        <div className="hidden sm:block">
          <span className="text-muted-foreground">Encours total</span>
          <span className="ml-2 font-semibold text-foreground">{formatTND(totalEncours)}</span>
        </div>
        <div className="hidden md:block h-4 w-px bg-border" />
        <div className="hidden md:block">
          <span className="text-muted-foreground">Hors Groupe</span>
          <span className="ml-2 font-semibold text-primary">{formatTND(encoursHorsGroupe)}</span>
        </div>
        <div className="h-4 w-px bg-border" />
        <span className="text-muted-foreground capitalize">{todayStr}</span>
      </div>
    </header>
  );
}
