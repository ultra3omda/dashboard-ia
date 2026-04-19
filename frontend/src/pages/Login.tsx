import { useState, FormEvent } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, Sparkles } from "lucide-react";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const redirectTo = (location.state as { from?: string } | null)?.from ?? "/";

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      navigate(redirectTo, { replace: true });
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Identifiants invalides";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-sky-50 via-background to-violet-50 p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="space-y-4 text-center">
          <div className="mx-auto h-12 w-12 rounded-xl bg-gradient-to-br from-sky-500 to-violet-500 flex items-center justify-center">
            <Sparkles className="h-6 w-6 text-white" />
          </div>
          <div>
            <CardTitle className="text-2xl">CashFlow Pilot</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Connectez-vous à votre tableau de bord de recouvrement
            </p>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
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
              <Label htmlFor="password">Mot de passe</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
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
                <span>Se connecter</span>
              </span>
            </Button>
          </form>
          <div className="mt-6 pt-6 border-t text-center text-sm text-muted-foreground">
            Pas de compte ?{" "}
            <Link to="/register-org" className="text-primary font-medium hover:underline">
              Créer une organisation
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
