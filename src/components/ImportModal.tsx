import { useState, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Upload, FileSpreadsheet, Check, AlertCircle } from "lucide-react";
import { parseSoldeFile, parseFacturesFile } from "@/lib/xlsx-parser";
import { importData } from "@/lib/storage";
import type { ImportSummary, SoldeClient, Facture } from "@/types/data";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onClose: (imported: boolean) => void;
}

export default function ImportModal({ open, onClose }: Props) {
  const [soldeFile, setSoldeFile] = useState<File | null>(null);
  const [facturesFile, setFacturesFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [preview, setPreview] = useState<{ solde: SoldeClient[]; factures: Facture[] } | null>(null);

  const handleDrop = useCallback((e: React.DragEvent, setter: (f: File) => void) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith(".xlsx") || file.name.endsWith(".xls"))) {
      setter(file);
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>, setter: (f: File) => void) => {
    const file = e.target.files?.[0];
    if (file) setter(file);
  };

  const handleImport = async () => {
    if (!soldeFile && !facturesFile) return;
    setLoading(true);
    setError(null);
    setPreview(null);

    try {
      let soldeData: SoldeClient[] = [];
      let facturesData: Facture[] = [];

      if (soldeFile) {
        try {
          const buf = await soldeFile.arrayBuffer();
          soldeData = parseSoldeFile(buf);
          console.log("[CashFlow] Solde parsed successfully:", soldeData.length, "clients");
        } catch (err: any) {
          throw new Error(`Erreur parsing Solde_Clients: ${err.message}`);
        }
      }

      if (facturesFile) {
        try {
          const buf = await facturesFile.arrayBuffer();
          facturesData = parseFacturesFile(buf);
          console.log("[CashFlow] Factures parsed successfully:", facturesData.length, "factures");
        } catch (err: any) {
          throw new Error(`Erreur parsing Factures_Client: ${err.message}`);
        }
      }

      if (soldeFile && soldeData.length === 0) {
        throw new Error("Fichier Solde_Clients vide ou colonnes non reconnues. Vérifiez que le fichier contient les colonnes 'Nom' et 'Montant dû'.");
      }
      if (facturesFile && facturesData.length === 0) {
        throw new Error("Fichier Factures_Client vide ou colonnes non reconnues. Vérifiez que le fichier contient la colonne 'nom client'.");
      }

      // Show preview before confirming
      setPreview({ solde: soldeData, factures: facturesData });

    } catch (err: any) {
      const msg = err.message || "Erreur inconnue lors de l'import";
      setError(msg);
      toast.error("Erreur d'import", { description: msg });
      console.error("[CashFlow] Import error:", err);
    } finally {
      setLoading(false);
    }
  };

  const confirmImport = () => {
    if (!preview) return;
    try {
      const result = importData(preview.solde, preview.factures);
      setSummary(result);
      setPreview(null);
      toast.success("Import réussi", {
        description: `${result.newClients + result.updatedClients} clients, ${result.newInvoices + result.updatedInvoices} factures`,
      });
    } catch (err: any) {
      const msg = err.message || "Erreur lors de la sauvegarde";
      setError(msg);
      toast.error("Erreur de sauvegarde", { description: msg });
    }
  };

  const handleClose = () => {
    const imported = summary !== null;
    setSoldeFile(null);
    setFacturesFile(null);
    setSummary(null);
    setError(null);
    setPreview(null);
    onClose(imported);
  };

  const FileDropZone = ({ file, setter, label, description }: { file: File | null; setter: (f: File) => void; label: string; description: string }) => (
    <div
      className={`relative border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer ${
        file ? "border-success bg-success/5" : "border-border hover:border-primary/50 hover:bg-accent/50"
      }`}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => handleDrop(e, setter)}
    >
      <input
        type="file"
        accept=".xlsx,.xls"
        className="absolute inset-0 opacity-0 cursor-pointer"
        onChange={(e) => handleFileSelect(e, setter)}
      />
      {file ? (
        <div className="flex items-center justify-center gap-2">
          <Check className="h-5 w-5 text-success" />
          <span className="text-sm font-medium text-foreground">{file.name}</span>
        </div>
      ) : (
        <>
          <FileSpreadsheet className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">{label}</p>
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        </>
      )}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={() => !loading && handleClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-foreground">Importer les données</DialogTitle>
          <DialogDescription>
            Glissez-déposez vos fichiers Excel ou cliquez pour les sélectionner.
          </DialogDescription>
        </DialogHeader>

        {summary ? (
          <div className="space-y-4 animate-fade-in">
            <div className="rounded-lg bg-success/10 p-4 text-sm space-y-1">
              <p className="font-semibold text-success">Import réussi !</p>
              <p className="text-foreground">{summary.newClients} nouveaux clients • {summary.updatedClients} clients mis à jour</p>
              <p className="text-foreground">{summary.newInvoices} nouvelles factures • {summary.updatedInvoices} factures mises à jour</p>
            </div>
            <Button onClick={handleClose} className="w-full">Fermer</Button>
          </div>
        ) : preview ? (
          <div className="space-y-4 animate-fade-in">
            <div className="rounded-lg bg-primary/10 p-4 text-sm space-y-2">
              <p className="font-semibold text-primary">Aperçu avant import</p>
              <p className="text-foreground">{preview.solde.length} clients trouvés</p>
              <p className="text-foreground">{preview.factures.length} factures trouvées</p>
              {preview.solde.length > 0 && (
                <div className="mt-2 text-xs text-muted-foreground border-t pt-2">
                  <p className="font-medium text-foreground mb-1">Échantillon clients:</p>
                  {preview.solde.slice(0, 3).map((c, i) => (
                    <p key={i}>{c.nom}: {c.montantDu.toLocaleString("fr-FR")} DT</p>
                  ))}
                </div>
              )}
              {preview.factures.length > 0 && (
                <div className="mt-2 text-xs text-muted-foreground border-t pt-2">
                  <p className="font-medium text-foreground mb-1">Échantillon factures:</p>
                  {preview.factures.slice(0, 3).map((f, i) => (
                    <p key={i}>{f.numFacture} — {f.nomClient} — {f.totalTTC.toLocaleString("fr-FR")} DT — {f.paiement}</p>
                  ))}
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setPreview(null)} className="flex-1">Annuler</Button>
              <Button onClick={confirmImport} className="flex-1">Confirmer l'import</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <FileDropZone
              file={soldeFile}
              setter={setSoldeFile}
              label="Solde_Clients.xlsx"
              description="Colonnes: Nom, Montant dû"
            />
            <FileDropZone
              file={facturesFile}
              setter={setFacturesFile}
              label="Factures_Client.xlsx"
              description="Colonnes: nom client, N° Facture, Paiement…"
            />

            {error && (
              <div className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span className="break-all">{error}</span>
              </div>
            )}

            <Button
              onClick={handleImport}
              disabled={(!soldeFile && !facturesFile) || loading}
              className="w-full"
            >
              <Upload className="h-4 w-4 mr-2" />
              {loading ? "Analyse en cours…" : "Analyser les fichiers"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
