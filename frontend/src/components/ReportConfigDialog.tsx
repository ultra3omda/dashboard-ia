import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Loader2, X, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useReportPresets, useCreateReport, useUpdateReport } from "@/hooks/useReports";
import type { ReportConfig, ReportConfigCreatePayload, ReportSections, ReportSchedule } from "@/lib/reportsApi";
import { ApiError } from "@/lib/api";

interface Props {
  open: boolean;
  onClose: () => void;
  existing: ReportConfig | null; // null = create, otherwise edit
}

const DEFAULT_SECTIONS: ReportSections = {
  kpis: true,
  aging: true,
  top_clients: true,
  activities: true,
  clients_at_risk: true,
  ai_suggestions: false,
};

const DEFAULT_SCHEDULE: ReportSchedule = {
  frequency: "weekly",
  day_of_week: 0, // Monday
  day_of_month: null,
  hour: 8,
  minute: 0,
};

const DAYS_OF_WEEK = [
  { value: 0, label: "Lundi" },
  { value: 1, label: "Mardi" },
  { value: 2, label: "Mercredi" },
  { value: 3, label: "Jeudi" },
  { value: 4, label: "Vendredi" },
  { value: 5, label: "Samedi" },
  { value: 6, label: "Dimanche" },
];

const SECTION_LABELS: Array<[keyof ReportSections, string, string]> = [
  ["kpis", "KPIs principaux", "CA, taux, reste à recouvrer, délai"],
  ["aging", "Classement des retards", "Normal/Vigilance/Critique/Danger"],
  ["top_clients", "Top clients", "10 premiers par CA réalisé"],
  ["activities", "Performance par activité", "Breakdown activité"],
  ["clients_at_risk", "Clients à risque", "Critique + Danger"],
  ["ai_suggestions", "Suggestions IA", "Analyse Claude + actions suggérées"],
];

export default function ReportConfigDialog({ open, onClose, existing }: Props) {
  const presetsQuery = useReportPresets();
  const createReport = useCreateReport();
  const updateReport = useUpdateReport();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [recipients, setRecipients] = useState<string[]>([]);
  const [recipientInput, setRecipientInput] = useState("");
  const [schedule, setSchedule] = useState<ReportSchedule>(DEFAULT_SCHEDULE);
  const [sections, setSections] = useState<ReportSections>(DEFAULT_SECTIONS);
  const [template, setTemplate] = useState<string>("default");
  const [enabled, setEnabled] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Initialize / reset when dialog opens
  useEffect(() => {
    if (!open) return;
    if (existing) {
      setName(existing.name);
      setDescription(existing.description || "");
      setRecipients(existing.recipients);
      setSchedule(existing.schedule);
      setSections(existing.sections);
      setTemplate(existing.template || "default");
      setEnabled(existing.enabled);
    } else {
      setName("");
      setDescription("");
      setRecipients([]);
      setSchedule(DEFAULT_SCHEDULE);
      setSections(DEFAULT_SECTIONS);
      setTemplate("default");
      setEnabled(true);
    }
    setRecipientInput("");
  }, [open, existing]);

  const applyPreset = (presetKey: string) => {
    setTemplate(presetKey);
    const preset = presetsQuery.data?.[presetKey];
    if (!preset) return;
    if (!existing && !name.trim()) setName(preset.name);
    if (!existing && !description.trim()) setDescription(preset.description);
    setSections(preset.sections);
  };

  const addRecipient = () => {
    const v = recipientInput.trim().toLowerCase();
    if (!v) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
      toast.error("Email invalide");
      return;
    }
    if (recipients.includes(v)) {
      setRecipientInput("");
      return;
    }
    setRecipients([...recipients, v]);
    setRecipientInput("");
  };

  const removeRecipient = (email: string) => {
    setRecipients(recipients.filter(r => r !== email));
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Nom requis");
      return;
    }
    if (recipients.length === 0) {
      toast.error("Au moins un destinataire requis");
      return;
    }
    // Sanitize schedule depending on frequency
    const cleanSchedule: ReportSchedule = {
      frequency: schedule.frequency,
      day_of_week: schedule.frequency === "weekly" ? schedule.day_of_week ?? 0 : null,
      day_of_month: schedule.frequency === "monthly" ? schedule.day_of_month ?? 1 : null,
      hour: schedule.hour,
      minute: schedule.minute,
    };
    const payload: ReportConfigCreatePayload = {
      name: name.trim(),
      description: description.trim(),
      recipients,
      schedule: cleanSchedule,
      sections,
      template,
      enabled,
    };
    setSubmitting(true);
    try {
      if (existing) {
        await updateReport.mutateAsync({ id: existing.id, payload });
        toast.success("Rapport mis à jour");
      } else {
        await createReport.mutateAsync(payload);
        toast.success("Rapport créé");
      }
      onClose();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Erreur d'enregistrement";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => !submitting && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {existing ? "Modifier le rapport" : "Nouveau rapport"}
          </DialogTitle>
          <DialogDescription>
            Configurez un rapport hebdomadaire ou mensuel envoyé automatiquement par email.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Preset picker (only on create) */}
          {!existing && presetsQuery.data && (
            <div>
              <Label className="text-xs text-muted-foreground mb-2 block">Démarrer depuis un modèle</Label>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(presetsQuery.data).map(([key, preset]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => applyPreset(key)}
                    className={`text-left p-3 rounded-lg border transition-colors ${
                      template === key
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/50"
                    }`}
                  >
                    <div className="text-sm font-semibold">{preset.name}</div>
                    <div className="text-xs text-muted-foreground mt-1">{preset.description}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Basics */}
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Nom</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="Rapport CEO hebdomadaire" />
            </div>
            <div className="space-y-1">
              <Label>Description <span className="text-xs text-muted-foreground">(optionnel)</span></Label>
              <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} />
            </div>
          </div>

          {/* Recipients */}
          <div className="space-y-2">
            <Label>Destinataires</Label>
            <div className="flex gap-2">
              <Input
                value={recipientInput}
                onChange={e => setRecipientInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter") { e.preventDefault(); addRecipient(); }
                }}
                placeholder="ceo@entreprise.com"
                type="email"
              />
              <Button type="button" variant="outline" onClick={addRecipient}>Ajouter</Button>
            </div>
            {recipients.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {recipients.map(r => (
                  <Badge key={r} variant="secondary" className="gap-1">
                    {r}
                    <button
                      type="button"
                      onClick={() => removeRecipient(r)}
                      className="hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Schedule */}
          <div className="space-y-2">
            <Label>Planification (UTC)</Label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <Select
                value={schedule.frequency}
                onValueChange={v => setSchedule(s => ({ ...s, frequency: v as ReportSchedule["frequency"] }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Quotidien</SelectItem>
                  <SelectItem value="weekly">Hebdomadaire</SelectItem>
                  <SelectItem value="monthly">Mensuel</SelectItem>
                </SelectContent>
              </Select>

              {schedule.frequency === "weekly" && (
                <Select
                  value={String(schedule.day_of_week ?? 0)}
                  onValueChange={v => setSchedule(s => ({ ...s, day_of_week: parseInt(v) }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DAYS_OF_WEEK.map(d => (
                      <SelectItem key={d.value} value={String(d.value)}>{d.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {schedule.frequency === "monthly" && (
                <Input
                  type="number"
                  min={1}
                  max={28}
                  value={schedule.day_of_month ?? 1}
                  onChange={e => setSchedule(s => ({ ...s, day_of_month: parseInt(e.target.value) || 1 }))}
                  placeholder="Jour (1-28)"
                />
              )}

              <Input
                type="number"
                min={0}
                max={23}
                value={schedule.hour}
                onChange={e => setSchedule(s => ({ ...s, hour: Math.min(23, Math.max(0, parseInt(e.target.value) || 0)) }))}
                placeholder="Heure"
              />
              <Input
                type="number"
                min={0}
                max={59}
                value={schedule.minute}
                onChange={e => setSchedule(s => ({ ...s, minute: Math.min(59, Math.max(0, parseInt(e.target.value) || 0)) }))}
                placeholder="Minute"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Heure en UTC. Tunisie = UTC+1 (hiver) / +1 (été, pas de DST). Pour 8h Tunis → entrer 7 en UTC.
            </p>
          </div>

          {/* Sections */}
          <div className="space-y-2">
            <Label>Sections incluses dans l'email</Label>
            <div className="space-y-2">
              {SECTION_LABELS.map(([key, label, hint]) => (
                <div key={key} className="flex items-start gap-3 p-2 rounded border">
                  <Checkbox
                    id={`sec-${key}`}
                    checked={sections[key]}
                    onCheckedChange={v => setSections(s => ({ ...s, [key]: !!v }))}
                    className="mt-0.5"
                  />
                  <label htmlFor={`sec-${key}`} className="flex-1 cursor-pointer">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{label}</span>
                      {key === "ai_suggestions" && (
                        <Sparkles className="h-3.5 w-3.5 text-primary" />
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">{hint}</div>
                  </label>
                </div>
              ))}
            </div>
          </div>

          {/* Enabled toggle */}
          <div className="flex items-center justify-between p-3 rounded border bg-muted/30">
            <div>
              <div className="text-sm font-medium">Activer ce rapport</div>
              <div className="text-xs text-muted-foreground">
                Les envois automatiques ne se feront que si le rapport est activé.
              </div>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>Annuler</Button>
          <Button onClick={handleSave} disabled={submitting}>
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {existing ? "Enregistrer" : "Créer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
