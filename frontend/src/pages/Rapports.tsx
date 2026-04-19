import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Mail, Plus, MoreHorizontal, Send, Pencil, Trash2, CheckCircle2,
  XCircle, Loader2, Sparkles, Calendar, Clock, History,
} from "lucide-react";
import { cn } from "@/lib/utils";
import ReportConfigDialog from "@/components/ReportConfigDialog";
import {
  useReportConfigs, useReportRuns, useUpdateReport,
  useDeleteReport, useRunReportNow,
} from "@/hooks/useReports";
import type { ReportConfig, ReportSchedule } from "@/lib/reportsApi";
import { toast } from "sonner";

const DAY_NAMES = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

function scheduleLabel(s: ReportSchedule): string {
  const time = `${String(s.hour).padStart(2, "0")}:${String(s.minute).padStart(2, "0")} UTC`;
  if (s.frequency === "daily") return `Tous les jours à ${time}`;
  if (s.frequency === "weekly") {
    const day = s.day_of_week !== null ? DAY_NAMES[s.day_of_week] : "?";
    return `${day} à ${time}`;
  }
  if (s.frequency === "monthly") {
    return `Le ${s.day_of_month ?? "?"} du mois à ${time}`;
  }
  return time;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("fr-FR", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function RunStatusBadge({ status }: { status: string }) {
  if (status === "success") {
    return (
      <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]">
        <CheckCircle2 className="h-3 w-3 mr-1" />
        Envoyé
      </Badge>
    );
  }
  if (status === "error") {
    return (
      <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 text-[10px]">
        <XCircle className="h-3 w-3 mr-1" />
        Erreur
      </Badge>
    );
  }
  return <Badge variant="outline" className="text-[10px]">{status}</Badge>;
}

export default function Rapports() {
  const configsQuery = useReportConfigs();
  const runsQuery = useReportRuns(50);
  const updateReport = useUpdateReport();
  const deleteReport = useDeleteReport();
  const runReportNow = useRunReportNow();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ReportConfig | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ReportConfig | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);

  const handleCreate = () => { setEditing(null); setDialogOpen(true); };
  const handleEdit = (c: ReportConfig) => { setEditing(c); setDialogOpen(true); };
  const handleDialogClose = () => { setDialogOpen(false); setEditing(null); };

  const handleToggleEnabled = async (c: ReportConfig, enabled: boolean) => {
    try {
      await updateReport.mutateAsync({ id: c.id, payload: { enabled } });
      toast.success(enabled ? "Rapport activé" : "Rapport désactivé");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erreur";
      toast.error(msg);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      await deleteReport.mutateAsync(confirmDelete.id);
      toast.success("Rapport supprimé");
      setConfirmDelete(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erreur de suppression";
      toast.error(msg);
    }
  };

  const handleRunNow = async (c: ReportConfig) => {
    setRunningId(c.id);
    try {
      const run = await runReportNow.mutateAsync(c.id);
      if (run.status === "success") {
        toast.success("Rapport envoyé", {
          description: `${c.recipients.length} destinataire${c.recipients.length > 1 ? "s" : ""}`,
        });
      } else {
        toast.error("Échec d'envoi", { description: run.error ?? "Erreur inconnue" });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erreur d'envoi";
      toast.error(msg);
    } finally {
      setRunningId(null);
    }
  };

  const configs = configsQuery.data ?? [];
  const runs = runsQuery.data ?? [];

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <Mail className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold">Rapports automatiques</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Rapports envoyés par email de façon récurrente. Le contenu et la fréquence sont personnalisables.
          </p>
        </div>
        <Button onClick={handleCreate}>
          <Plus className="h-4 w-4 mr-2" />
          Nouveau rapport
        </Button>
      </div>

      {/* Configs table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            Rapports configurés
            {configs.length > 0 && (
              <Badge variant="outline" className="ml-2 text-[10px]">{configs.length}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {configsQuery.isLoading ? (
            <div className="p-8 text-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground inline" />
            </div>
          ) : configs.length === 0 ? (
            <div className="p-12 text-center">
              <Mail className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="font-medium">Aucun rapport configuré</p>
              <p className="text-sm text-muted-foreground mt-1">
                Créez votre premier rapport pour l'envoyer automatiquement à votre équipe.
              </p>
              <Button onClick={handleCreate} className="mt-4">
                <Plus className="h-4 w-4 mr-2" />
                Créer un rapport
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nom</TableHead>
                  <TableHead>Planification</TableHead>
                  <TableHead>Destinataires</TableHead>
                  <TableHead>Dernier envoi</TableHead>
                  <TableHead className="text-center">Actif</TableHead>
                  <TableHead className="w-[60px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {configs.map(c => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <div className="font-medium flex items-center gap-2">
                        {c.name}
                        {c.sections.ai_suggestions && (
                          <Sparkles className="h-3.5 w-3.5 text-primary" />
                        )}
                      </div>
                      {c.description && (
                        <div className="text-xs text-muted-foreground mt-0.5 max-w-md truncate">
                          {c.description}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-sm">
                        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                        {scheduleLabel(c.schedule)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {c.recipients.length} email{c.recipients.length > 1 ? "s" : ""}
                      </div>
                      <div className="text-xs text-muted-foreground max-w-[200px] truncate">
                        {c.recipients.slice(0, 2).join(", ")}
                        {c.recipients.length > 2 ? ` +${c.recipients.length - 2}` : ""}
                      </div>
                    </TableCell>
                    <TableCell>
                      {c.last_run_at ? (
                        <div className="space-y-0.5">
                          <RunStatusBadge status={c.last_run_status ?? "unknown"} />
                          <div className="text-xs text-muted-foreground">
                            {formatDateTime(c.last_run_at)}
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">Jamais</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={c.enabled}
                        onCheckedChange={v => handleToggleEnabled(c, v)}
                      />
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => handleRunNow(c)}
                            disabled={runningId === c.id}
                          >
                            {runningId === c.id ? (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <Send className="h-4 w-4 mr-2" />
                            )}
                            Envoyer maintenant
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleEdit(c)}>
                            <Pencil className="h-4 w-4 mr-2" />
                            Modifier
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => setConfirmDelete(c)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Supprimer
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Run history */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <History className="h-5 w-5 text-primary" />
            Historique des envois
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            50 derniers envois, tous rapports confondus.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          {runsQuery.isLoading ? (
            <div className="p-8 text-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground inline" />
            </div>
          ) : runs.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">
              Aucun envoi encore. Les rapports apparaîtront ici dès que le scheduler ou un envoi manuel aura eu lieu.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rapport</TableHead>
                  <TableHead>Déclenché</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Destinataires</TableHead>
                  <TableHead>Statut</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium max-w-[240px] truncate">
                      {r.config_name}
                    </TableCell>
                    <TableCell>
                      <span className={cn(
                        "text-xs px-2 py-0.5 rounded",
                        r.triggered_by === "scheduler"
                          ? "bg-sky-50 text-sky-700"
                          : "bg-violet-50 text-violet-700"
                      )}>
                        {r.triggered_by === "scheduler" ? "Auto" : "Manuel"}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDateTime(r.finished_at ?? r.started_at)}
                    </TableCell>
                    <TableCell className="text-sm">
                      {r.recipients.length}
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <RunStatusBadge status={r.status} />
                        {r.error && (
                          <div className="text-xs text-destructive max-w-[280px] truncate" title={r.error}>
                            {r.error}
                          </div>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Dialogs */}
      <ReportConfigDialog
        open={dialogOpen}
        onClose={handleDialogClose}
        existing={editing}
      />

      <AlertDialog open={confirmDelete !== null} onOpenChange={() => setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce rapport ?</AlertDialogTitle>
            <AlertDialogDescription>
              Le rapport "{confirmDelete?.name}" sera définitivement supprimé.
              L'historique des envois passés sera conservé.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
