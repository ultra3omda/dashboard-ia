import { useEffect, useRef } from "react";

/**
 * Page "Analyse IA"
 *
 * Embarque le dashboard de suivi du recouvrement (identique au fichier
 * Balance.xlsx fourni). Le dashboard est servi en tant qu'asset statique
 * depuis /analyse-ia/index.html. Il est 100% autonome (Chart.js + SheetJS +
 * upload local) et reste identique à la maquette originale.
 */
export default function AnalyseIA() {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Force le rechargement si on revient sur la page pour que l'overlay
  // d'upload soit proposé à nouveau si nécessaire.
  useEffect(() => {
    const el = iframeRef.current;
    if (!el) return;
    // noop — l'iframe gère son propre cycle de vie.
  }, []);

  return (
    <div className="h-[calc(100vh-3.5rem)] w-full bg-background">
      <iframe
        ref={iframeRef}
        src="/analyse-ia/index.html"
        title="Analyse IA — Dashboard de suivi du recouvrement"
        className="w-full h-full border-0"
        // Autorise le script (Chart.js / SheetJS), les pop-ups,
        // l'accès aux fichiers locaux pour l'upload.
        sandbox="allow-scripts allow-same-origin allow-downloads allow-popups allow-forms"
      />
    </div>
  );
}
