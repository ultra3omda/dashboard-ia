import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogOut, Settings, User } from "lucide-react";
import { getSoldeClients, getActiveFactures } from "@/lib/storage";
import { useAuth } from "@/contexts/AuthContext";

function formatTND(amount: number): string {
  return (
    new Intl.NumberFormat("fr-TN", {
      style: "decimal",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount) + " TND"
  );
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? "")
    .join("");
}

function roleLabel(role: string): string {
  const labels: Record<string, string> = {
    super_admin: "Super Admin",
    admin: "Administrateur",
    ceo: "CEO",
    cfo: "CFO",
    chef_dep: "Chef de département",
    chef_projet: "Chef de projet",
    agent: "Agent recouvrement",
  };
  return labels[role] ?? role;
}

export default function TopBar({ refreshKey }: { refreshKey: number }) {
  const { user, org, logout } = useAuth();
  const navigate = useNavigate();

  const { totalEncours, encoursHorsGroupe, todayStr } = useMemo(() => {
    const solde = getSoldeClients();
    const factures = getActiveFactures();

    const totalEncours = solde.reduce(
      (sum, c) => sum + (c.montantDu > 0 ? c.montantDu : 0),
      0
    );

    const groupNames = new Set<string>();
    factures.forEach(f => {
      if (f.isCustomerGroup) groupNames.add(f.nomClient.toLowerCase().trim());
    });

    const encoursHorsGroupe = solde
      .filter(c => !groupNames.has(c.nom.toLowerCase().trim()))
      .reduce((sum, c) => sum + (c.montantDu > 0 ? c.montantDu : 0), 0);

    const todayStr = new Date().toLocaleDateString("fr-FR", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    return { totalEncours, encoursHorsGroupe, todayStr };
  }, [refreshKey]);

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <header className="h-14 border-b bg-background flex items-center justify-between px-4 shrink-0">
      <div className="flex items-center gap-3">
        <SidebarTrigger />
        {org && (
          <div className="hidden sm:block text-sm">
            <span className="text-muted-foreground">Org :</span>
            <span className="ml-1.5 font-medium">{org.name}</span>
          </div>
        )}
      </div>
      <div className="flex items-center gap-4 text-sm">
        <div className="hidden sm:block">
          <span className="text-muted-foreground">Encours total</span>
          <span className="ml-2 font-semibold text-foreground">{formatTND(totalEncours)}</span>
        </div>
        <div className="hidden md:block h-4 w-px bg-border" />
        <div className="hidden md:block">
          <span className="text-muted-foreground">Hors Groupe</span>
          <span className="ml-2 font-semibold text-primary">{formatTND(encoursHorsGroupe)}</span>
        </div>
        <div className="hidden lg:block h-4 w-px bg-border" />
        <span className="hidden lg:block text-muted-foreground capitalize">{todayStr}</span>

        {user && (
          <>
            <div className="h-4 w-px bg-border" />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full">
                  <Avatar className="h-9 w-9">
                    <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                      {getInitials(user.full_name)}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel>
                  <div className="space-y-1">
                    <p className="font-semibold text-sm">{user.full_name}</p>
                    <p className="text-xs text-muted-foreground">{user.email}</p>
                    <p className="text-xs text-primary font-medium">{roleLabel(user.role)}</p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate("/parametres")}>
                  <Settings className="h-4 w-4 mr-2" />
                  Paramètres
                </DropdownMenuItem>
                <DropdownMenuItem disabled>
                  <User className="h-4 w-4 mr-2" />
                  Mon compte
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive">
                  <LogOut className="h-4 w-4 mr-2" />
                  Déconnexion
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
      </div>
    </header>
  );
}
