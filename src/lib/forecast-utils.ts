import type { Facture, SoldeClient } from "@/types/data";

/**
 * Cap invoice recouvrement amounts by the real client balance from Solde_Clients.
 * If a client's total M. Recouvrement exceeds their Solde balance,
 * distribute proportionally across their invoices.
 */
export function capInvoicesByClientBalance(
  invoices: Facture[],
  soldeClients: SoldeClient[]
): Facture[] {
  // Build balance map
  const soldeMap = new Map<string, number>();
  soldeClients.forEach(c => {
    soldeMap.set(c.nom.toLowerCase().trim(), c.montantDu);
  });

  // Group invoices by client
  const byClient = new Map<string, Facture[]>();
  invoices.forEach(f => {
    const key = f.nomClient.toLowerCase().trim();
    if (!byClient.has(key)) byClient.set(key, []);
    byClient.get(key)!.push(f);
  });

  const result: Facture[] = [];
  byClient.forEach((clientInvoices, clientKey) => {
    const realBalance = soldeMap.get(clientKey) ?? 0;
    if (realBalance <= 0) return; // Skip clients with zero/negative balance

    const totalMRec = clientInvoices.reduce((s, f) => s + (f.montantRecouvrement || 0), 0);

    if (totalMRec <= realBalance) {
      result.push(...clientInvoices);
    } else {
      const ratio = realBalance / totalMRec;
      clientInvoices.forEach(inv => {
        result.push({
          ...inv,
          montantRecouvrement: (inv.montantRecouvrement || 0) * ratio,
        });
      });
    }
  });

  return result;
}
