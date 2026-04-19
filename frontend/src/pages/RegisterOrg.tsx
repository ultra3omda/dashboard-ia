import { useState, FormEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, Building2 } from "lucide-react";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

export default function RegisterOrg() {
  const navigate = useNavigate();
  const { registerOrg } = useAuth();

  const [orgName, setOrgName] = useState("");
  const [orgSlug, setOrgSlug] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-derive slug from org name as user types
  function onOrgNameChange(v: string) {
    setOrgName(v);
    const auto = v
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    setOrgSlug(auto);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await registerOrg({
        org_name: orgName,
        org_slug: orgSlug,
        email,
        password,
        full_name: fullName,
      });
      navigate("/", { replace: true });
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Inscription impossible";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-sky-50 via-background to-violet-50 p-4 py-8">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="space-y-4 text-center">
          <div className="mx-auto h-12 w-12 rounded-xl bg-gradient-to-br from-sky-500 to-violet-500 flex items-center justify-center">
            <Building2 className="h-6 w-6 text-white" />
          </div>
          <div>
            <CardTitle className="text-2xl">Créer une organisation</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Vous serez le premier administrateur de cette organisation
            </p>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="orgName">Nom de l'organisation</Label>
              <Input
                id="orgName"
                required
                value={orgName}
                onChange={e => onOrgNameChange(e.target.value)}
                placeholder="MEDIANET"
                disabled={submitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="orgSlug">
                Identifiant URL{" "}
                <span className="text-xs text-muted-foreground font-normal">(minuscules, chiffres, tirets)</span>
              </Label>
              <Input
                id="orgSlug"
                required
                pattern="^[a-z0-9][a-z0-9\-_]*$"
                value={orgSlug}
                onChange={e => setOrgSlug(e.target.value.toLowerCase())}
                placeholder="medianet"
                disabled={submitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fullName">Votre nom</Label>
              <Input
                id="fullName"
                required
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                placeholder="Imed Eddine Essafi"
                disabled={submitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="vous@entreprise.com"
                disabled={submitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">
                Mot de passe{" "}
                <span className="text-xs text-muted-foreground font-normal">(min. 8 caractères)</span>
              </Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={e => setPassword(e.target.value)}
                disabled={submitting}
              />
            </div>
            {error && (
              <div className="text-sm text-destructive bg-destructive/5 border border-destructive/20 rounded px-3 py-2">
                {error}
              </div>
            )}
            <Button type="submit" className="w-full" disabled={submitting}>
              <span className="inline-flex w-full items-center justify-center gap-2">
                <Loader2
                  aria-hidden
                  className={cn(
                    "h-4 w-4 shrink-0",
                    submitting ? "animate-spin" : "invisible",
                  )}
                />
                <span>Créer l&apos;organisation</span>
              </span>
            </Button>
          </form>
          <div className="mt-6 pt-6 border-t text-center text-sm text-muted-foreground">
            Déjà un compte ?{" "}
            <Link to="/login" className="text-primary font-medium hover:underline">
              Se connecter
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
