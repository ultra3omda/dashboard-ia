import { useState, useCallback } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Upload, FileSpreadsheet, Check, AlertCircle, Loader2 } from "lucide-react";
import { useImportSolde, useImportFactures } from "@/hooks/useData";
import { refreshAfterImport } from "@/lib/storage";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onClose: (imported: boolean) => void;
}

interface ImportResult {
  soldeResult: { created: number; updated: number; total: number } | null;
  facturesResult: { created: number; updated: number; total: number } | null;
}

export default function ImportModal({ open, onClose }: Props) {
  const [soldeFile, setSoldeFile] = useState<File | null>(null);
  const [facturesFile, setFacturesFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportResult | null>(null);

  const importSolde = useImportSolde();
  const importFactures = useImportFactures();

  const loading = importSolde.isPending || importFactures.isPending;

  const handleDrop = useCallback(
    (e: React.DragEvent, setter: (f: File) => void) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file && (file.name.endsWith(".xlsx") || file.name.endsWith(".xls"))) {
        setter(file);
      }
    },
    []
  );

  const handleFileSelect = (
    e: React.ChangeEvent<HTMLInputElement>,
    setter: (f: File) => void
  ) => {
    const file = e.target.files?.[0];
    if (file) setter(file);
  };

  const handleImport = async () => {
    if (!soldeFile && !facturesFile) return;
    setError(null);
    setSummary(null);

    let soldeResult: ImportResult["soldeResult"] = null;
    let facturesResult: ImportResult["facturesResult"] = null;

    try {
      if (soldeFile) {
        soldeResult = await importSolde.mutateAsync(soldeFile);
      }
      if (facturesFile) {
        facturesResult = await importFactures.mutateAsync(facturesFile);
      }
      // Refresh in-memory cache so legacy pages see the new data
      await refreshAfterImport();

      setSummary({ soldeResult, facturesResult });
      toast.success("Import terminé", {
        description: [
          soldeResult &&
            `${soldeResult.created} clients ajoutés, ${soldeResult.updated} mis à jour`,
          facturesResult &&
            `${facturesResult.created} factures ajoutées, ${facturesResult.updated} mises à jour`,
        ]
          .filter(Boolean)
          .join(" · "),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur d'import";
      setError(msg);
      toast.error("Erreur d'import", { description: msg });
    }
  };

  const handleClose = () => {
    const imported = summary !== null;
    setSoldeFile(null);
    setFacturesFile(null);
    setSummary(null);
    setError(null);
    onClose(imported);
  };

  const FileDropZone = ({
    file, setter, label, description,
  }: {
    file: File | null;
    setter: (f: File) => void;
    label: string;
    description: string;
  }) => (
    <div
      className={`relative border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer ${
        file
          ? "border-emerald-500 bg-emerald-50"
          : "border-border hover:border-primary/50 hover:bg-accent/50"
      }`}
      onDragOver={e => e.preventDefault()}
      onDrop={e => handleDrop(e, setter)}
    >
      <input
        type="file"
        accept=".xlsx,.xls"
        className="absolute inset-0 opacity-0 cursor-pointer"
        onChange={e => handleFileSelect(e, setter)}
      />
      {file ? (
        <div className="flex items-center justify-center gap-2">
          <Check className="h-5 w-5 text-emerald-600" />
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
          <DialogTitle>Importer les données</DialogTitle>
          <DialogDescription>
            Les fichiers sont envoyés au serveur, qui extrait, déduplique et
            stocke automatiquement. Les imports multiples fusionnent sur le
            numéro de facture.
          </DialogDescription>
        </DialogHeader>

        {summary ? (
          <div className="space-y-4">
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-4 text-sm space-y-2">
              <p className="font-semibold text-emerald-900">Import réussi !</p>
              {summary.soldeResult && (
                <p className="text-emerald-800">
                  Clients : {summary.soldeResult.created} nouveaux •{" "}
                  {summary.soldeResult.updated} mis à jour
                </p>
              )}
              {summary.facturesResult && (
                <p className="text-emerald-800">
                  Factures : {summary.facturesResult.created} nouvelles •{" "}
                  {summary.facturesResult.updated} mises à jour
                </p>
              )}
            </div>
            <Button onClick={handleClose} className="w-full">
              Fermer
            </Button>
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
              label="Factures.xlsx (onglet Export)"
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
              {loading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Upload className="h-4 w-4 mr-2" />
              )}
              {loading ? "Upload en cours…" : "Importer les fichiers"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
