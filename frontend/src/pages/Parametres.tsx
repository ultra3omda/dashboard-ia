import { useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  hasData, clearAllData, getSoldeClients, getActiveFactures, getActions,
  getSettings, saveSettings, getImportMeta, saveImportMeta,
  defaultSettings,
} from "@/lib/storage";
import type { AppSettings, TeamMember } from "@/lib/storage";
import { parseSoldeFile, parseFacturesFile } from "@/lib/xlsx-parser";
import { mergeSoldeClients, mergeFactures } from "@/lib/storage";
import ImportModal from "@/components/ImportModal";
import {
  Upload, Trash2, Database, Download, Settings2, Users, Palette,
  FileSpreadsheet, Check, AlertCircle, Plus, X, Shield, Bell, ImageIcon,
  CloudUpload, Loader2,
} from "lucide-react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { hasLocalData, countLocalData, migrateLocalToCloud } from "@/lib/localMigration";

export default function Parametres({ onDataChange }: { onDataChange: () => void }) {
  const [settings, setSettings] = useState<AppSettings>(getSettings());
  const [importOpen, setImportOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetText, setResetText] = useState("");
  const [importMeta] = useState(getImportMeta());

  // Team member form
  const [newMember, setNewMember] = useState({ name: "", role: "", email: "" });

  const logoInputRef = useRef<HTMLInputElement>(null);

  // --- Cloud migration (one-shot, for users upgrading from the localStorage version) ---
  const [localCounts] = useState(() => (hasLocalData() ? countLocalData() : null));
  const [migrating, setMigrating] = useState(false);
  const [migrationDone, setMigrationDone] = useState(false);

  const runMigration = async () => {
    setMigrating(true);
    try {
      const res = await migrateLocalToCloud();
      if (res.errors.length > 0) {
        toast.error("Migration partielle", { description: res.errors.join(" · ") });
      } else {
        const bits: string[] = [];
        if (res.soldeImported) bits.push(`${res.soldeImported.total} clients`);
        if (res.facturesImported) bits.push(`${res.facturesImported.total} factures`);
        toast.success("Migration réussie", {
          description: bits.length > 0 ? bits.join(" · ") : "Aucune donnée à migrer",
        });
        setMigrationDone(true);
        onDataChange();
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erreur inconnue";
      toast.error("Migration échouée", { description: msg });
    } finally {
      setMigrating(false);
    }
  };

  const persist = (updated: AppSettings) => {
    setSettings(updated);
    saveSettings(updated);
  };

  // --- Section 1: Import/Export ---
  const exportAllData = () => {
    const wb = XLSX.utils.book_new();
    const solde = getSoldeClients();
    const factures = getActiveFactures();
    const actions = getActions();

    if (solde.length > 0) {
      const ws = XLSX.utils.json_to_sheet(solde);
      XLSX.utils.book_append_sheet(wb, ws, "Solde_Clients");
    }
    if (factures.length > 0) {
      const ws = XLSX.utils.json_to_sheet(factures);
      XLSX.utils.book_append_sheet(wb, ws, "Factures");
    }
    if (actions.length > 0) {
      const ws = XLSX.utils.json_to_sheet(actions);
      XLSX.utils.book_append_sheet(wb, ws, "Actions");
    }
    XLSX.writeFile(wb, `cashflow_pilot_export_${new Date().toISOString().split("T")[0]}.xlsx`);
    toast.success("Export réussi");
  };

  const handleReset = () => {
    if (resetText !== "RESET") return;
    clearAllData();
    setResetOpen(false);
    setResetText("");
    onDataChange();
    toast.success("Toutes les données ont été supprimées");
  };

  // --- Section 2: Scoring weights ---
  const updateWeight = (key: keyof AppSettings["scoringWeights"], value: number) => {
    const weights = { ...settings.scoringWeights, [key]: value };
    persist({ ...settings, scoringWeights: weights });
  };

  const totalWeight = Object.values(settings.scoringWeights).reduce((s, v) => s + v, 0);

  const updateThreshold = (key: keyof AppSettings["scoreThresholds"], value: string) => {
    const v = parseInt(value) || 0;
    persist({ ...settings, scoreThresholds: { ...settings.scoreThresholds, [key]: v } });
  };

  // --- Section 3: Alert thresholds ---
  const updateAlert = (key: keyof AppSettings["alertThresholds"], value: string) => {
    const v = parseFloat(value) || 0;
    persist({ ...settings, alertThresholds: { ...settings.alertThresholds, [key]: v } });
  };

  // --- Section 3bis: Aging buckets ---
  const updateAgingBucket = (key: keyof AppSettings["agingBuckets"], value: string) => {
    const v = parseInt(value) || 0;
    persist({ ...settings, agingBuckets: { ...settings.agingBuckets, [key]: v } });
  };

  // --- Section 4: Team ---
  const addMember = () => {
    if (!newMember.name.trim()) return;
    const member: TeamMember = { id: crypto.randomUUID(), ...newMember };
    persist({ ...settings, team: [...settings.team, member] });
    setNewMember({ name: "", role: "", email: "" });
  };

  const removeMember = (id: string) => {
    persist({ ...settings, team: settings.team.filter(m => m.id !== id) });
  };

  // --- Section 5: Appearance ---
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      persist({ ...settings, logoBase64: reader.result as string });
    };
    reader.readAsDataURL(file);
  };

  const weightLabels: Record<keyof AppSettings["scoringWeights"], string> = {
    delaiMoyen: "Délai moyen de paiement",
    tauxPaye: "Taux de factures payées",
    ancienneteImpayes: "Ancienneté des impayés",
    encoursRelatif: "Encours relatif au CA",
    nbRelances: "Nb relances nécessaires",
  };

  const alertLabels: { key: keyof AppSettings["alertThresholds"]; label: string; suffix: string }[] = [
    { key: "echeanceJours", label: "Délai avant alerte échéance", suffix: "jours" },
    { key: "relanceEmail", label: "Suggestion relance email", suffix: "jours" },
    { key: "relanceAppel", label: "Suggestion appel", suffix: "jours" },
    { key: "relanceRdv", label: "Suggestion RDV", suffix: "jours" },
    { key: "relanceAvocat", label: "Suggestion avocat", suffix: "jours" },
    { key: "encoursMinEscalade", label: "Encours min. escalade", suffix: "DT" },
  ];

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <h2 className="text-2xl font-bold text-foreground">Paramètres</h2>

      {/* MIGRATION BLOCK — shown only if legacy localStorage data is present */}
      {localCounts && !migrationDone && (
        <Card className="shadow-sm border-sky-300 bg-sky-50/50">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2 text-sky-900">
              <CloudUpload className="h-4 w-4" />
              Migrer vos données locales vers le cloud
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-sky-900/80">
              Nous avons détecté des données stockées localement dans votre navigateur
              (version précédente de l'application). Migrez-les en un clic vers le
              serveur pour qu'elles soient partagées avec votre équipe, sauvegardées et
              disponibles depuis n'importe quel navigateur.
            </p>
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="bg-white">
                  {localCounts.clients} clients
                </Badge>
                <Badge variant="outline" className="bg-white">
                  {localCounts.factures} factures
                </Badge>
              </div>
              <Button
                onClick={runMigration}
                disabled={migrating}
                size="sm"
                className="ml-auto"
              >
                {migrating ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <CloudUpload className="h-4 w-4 mr-2" />
                )}
                {migrating ? "Migration en cours…" : "Migrer maintenant"}
              </Button>
            </div>
            <p className="text-xs text-sky-900/70">
              Les données locales seront supprimées après migration réussie.
            </p>
          </CardContent>
        </Card>
      )}

      {/* SECTION 1 — Import / Export */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Database className="h-4 w-4" />Import / Export des données
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Importer des fichiers Excel</p>
              <p className="text-xs text-muted-foreground">
                Solde_Clients.xlsx et Factures_Client.xlsx
                {importMeta.lastSoldeImport && (
                  <span className="ml-2">· Dernier import solde: {new Date(importMeta.lastSoldeImport).toLocaleString("fr-FR")}</span>
                )}
                {importMeta.lastFacturesImport && (
                  <span className="ml-2">· Dernier import factures: {new Date(importMeta.lastFacturesImport).toLocaleString("fr-FR")}</span>
                )}
              </p>
            </div>
            <Button onClick={() => setImportOpen(true)} size="sm">
              <Upload className="h-4 w-4 mr-2" />Importer
            </Button>
          </div>

          <div className="flex items-center justify-between pt-3 border-t">
            <div>
              <p className="text-sm font-medium text-foreground">Exporter toutes les données</p>
              <p className="text-xs text-muted-foreground">Un fichier XLSX avec une feuille par entité</p>
            </div>
            <Button variant="outline" size="sm" onClick={exportAllData}>
              <Download className="h-4 w-4 mr-2" />Export XLSX
            </Button>
          </div>

          {hasData() && (
            <div className="flex items-center justify-between pt-3 border-t">
              <div>
                <p className="text-sm font-medium text-destructive">Réinitialiser toutes les données</p>
                <p className="text-xs text-muted-foreground">Supprimer toutes les données importées et saisies</p>
              </div>
              <Button variant="destructive" size="sm" onClick={() => setResetOpen(true)}>
                <Trash2 className="h-4 w-4 mr-2" />Réinitialiser
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* SECTION 2 — Scoring IA */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-4 w-4" />Méthode d'évaluation qualité client (IA)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">Pondérations des critères</span>
              <Badge variant={totalWeight === 100 ? "default" : "destructive"} className={totalWeight === 100 ? "bg-success/10 text-success border-success/20" : ""}>
                Total: {totalWeight}%{totalWeight !== 100 && " ≠ 100%"}
              </Badge>
            </div>
            {(Object.entries(weightLabels) as [keyof AppSettings["scoringWeights"], string][]).map(([key, label]) => (
              <div key={key} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-sm text-muted-foreground">{label}</Label>
                  <span className="text-sm font-medium text-foreground w-12 text-right">{settings.scoringWeights[key]}%</span>
                </div>
                <Slider
                  value={[settings.scoringWeights[key]]}
                  min={0} max={100} step={5}
                  onValueChange={([v]) => updateWeight(key, v)}
                  className="w-full"
                />
              </div>
            ))}
          </div>

          <div className="pt-4 border-t space-y-3">
            <span className="text-sm font-medium text-foreground">Seuils de score</span>
            <div className="grid grid-cols-3 gap-3">
              {([
                { key: "bon" as const, label: "Bon Payeur ≥", color: "text-success" },
                { key: "moyen" as const, label: "Payeur Moyen ≥", color: "text-warning" },
                { key: "risque" as const, label: "Risqué ≥", color: "text-destructive" },
              ]).map(t => (
                <div key={t.key} className="space-y-1">
                  <Label className={`text-xs ${t.color}`}>{t.label}</Label>
                  <div className="flex items-center gap-1">
                    <Input
                      type="number" min={0} max={100}
                      className="h-8 text-sm"
                      value={settings.scoreThresholds[t.key]}
                      onChange={e => updateThreshold(t.key, e.target.value)}
                    />
                    <span className="text-xs text-muted-foreground">%</span>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Critique: score &lt; {settings.scoreThresholds.risque}%
            </p>
            <div className="flex gap-2">
              <Badge className="bg-success/10 text-success border-success/20">Bon</Badge>
              <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200">Moyen</Badge>
              <Badge className="bg-warning/10 text-warning border-warning/20">Risqué</Badge>
              <Badge className="bg-destructive/10 text-destructive border-destructive/20">Critique</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* SECTION 3 — Alert Thresholds */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Bell className="h-4 w-4" />Seuils d'alerte
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {alertLabels.map(({ key, label, suffix }) => (
              <div key={key} className="space-y-1">
                <Label className="text-xs text-muted-foreground">{label}</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    className="h-8 text-sm"
                    value={settings.alertThresholds[key]}
                    onChange={e => updateAlert(key, e.target.value)}
                  />
                  <span className="text-xs text-muted-foreground shrink-0">{suffix}</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* SECTION 3bis — Aging buckets (used by Analyse IA) */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            Seuils de criticité des retards
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Classement utilisé dans la page Analyse IA : Normal → Vigilance → Critique → Danger.
            Les valeurs sont des bornes supérieures, en jours de retard.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Normal (jusqu'à)</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  className="h-8 text-sm"
                  value={settings.agingBuckets.normal}
                  onChange={e => updateAgingBucket("normal", e.target.value)}
                />
                <span className="text-xs text-muted-foreground shrink-0">j</span>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Vigilance (jusqu'à)</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  className="h-8 text-sm"
                  value={settings.agingBuckets.vigilance}
                  onChange={e => updateAgingBucket("vigilance", e.target.value)}
                />
                <span className="text-xs text-muted-foreground shrink-0">j</span>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Critique (jusqu'à)</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  className="h-8 text-sm"
                  value={settings.agingBuckets.critique}
                  onChange={e => updateAgingBucket("critique", e.target.value)}
                />
                <span className="text-xs text-muted-foreground shrink-0">j</span>
              </div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            <span className="font-semibold text-red-600">Danger</span> = tout retard &gt; {settings.agingBuckets.critique} j
          </p>
        </CardContent>
      </Card>

      {/* SECTION 4 — Team */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" />Équipe / Assignation
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input placeholder="Nom" className="h-8 text-sm" value={newMember.name} onChange={e => setNewMember(m => ({ ...m, name: e.target.value }))} />
            <Input placeholder="Rôle" className="h-8 text-sm" value={newMember.role} onChange={e => setNewMember(m => ({ ...m, role: e.target.value }))} />
            <Input placeholder="Email" className="h-8 text-sm" value={newMember.email} onChange={e => setNewMember(m => ({ ...m, email: e.target.value }))} />
            <Button size="sm" onClick={addMember} disabled={!newMember.name.trim()}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          {settings.team.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nom</TableHead>
                  <TableHead>Rôle</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {settings.team.map(m => (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium text-foreground">{m.name}</TableCell>
                    <TableCell className="text-muted-foreground">{m.role}</TableCell>
                    <TableCell className="text-muted-foreground">{m.email}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeMember(m.id)}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">Aucun membre ajouté. Les membres apparaîtront dans le champ "Assigné à" des actions.</p>
          )}
        </CardContent>
      </Card>

      {/* SECTION 5 — Appearance */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Palette className="h-4 w-4" />Apparence
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-sm">Nom de l'entreprise</Label>
              <Input
                value={settings.companyName}
                onChange={e => persist({ ...settings, companyName: e.target.value })}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Format devise</Label>
              <Select value={settings.currencyFormat} onValueChange={v => persist({ ...settings, currencyFormat: v as "DT" | "TND" })}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="DT">DT (Dinar Tunisien)</SelectItem>
                  <SelectItem value="TND">TND</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">Logo</Label>
            <div className="flex items-center gap-4">
              {settings.logoBase64 ? (
                <div className="flex items-center gap-3">
                  <img src={settings.logoBase64} alt="Logo" className="h-10 w-auto rounded border" />
                  <Button variant="ghost" size="sm" onClick={() => persist({ ...settings, logoBase64: null })}>
                    <X className="h-3.5 w-3.5 mr-1" />Supprimer
                  </Button>
                </div>
              ) : (
                <Button variant="outline" size="sm" onClick={() => logoInputRef.current?.click()}>
                  <ImageIcon className="h-4 w-4 mr-2" />Charger un logo
                </Button>
              )}
              <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Import Modal */}
      <ImportModal
        open={importOpen}
        onClose={(imported) => {
          setImportOpen(false);
          if (imported) {
            saveImportMeta({
              lastSoldeImport: new Date().toISOString(),
              lastFacturesImport: new Date().toISOString(),
            });
            onDataChange();
          }
        }}
      />

      {/* Reset Confirmation */}
      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive">Réinitialiser toutes les données</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Cette action supprimera définitivement toutes les données importées, les actions et les paramètres.
              Tapez <span className="font-mono font-bold text-destructive">RESET</span> pour confirmer.
            </p>
            <Input
              value={resetText}
              onChange={e => setResetText(e.target.value)}
              placeholder="Tapez RESET"
              className="font-mono"
            />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => { setResetOpen(false); setResetText(""); }}>Annuler</Button>
              <Button variant="destructive" disabled={resetText !== "RESET"} onClick={handleReset}>
                <Trash2 className="h-4 w-4 mr-2" />Confirmer
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
