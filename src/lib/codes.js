// Référence de transaction électronique, façon prestataire de paiement (Mobile Money / carte) :
// uniquement pour les paiements passés par le portail public (select-offer), jamais pour un
// versement physique saisi par la console (rien à référencer côté gateway dans ce cas).
export function genererTransactionId() {
  const horodatage = Date.now().toString(36).toUpperCase();
  const alea = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `TXN-${horodatage}-${alea}`;
}

export async function nextCode(prisma, model, prefix) {
  const rows = await prisma[model].findMany({
    where: { code: { startsWith: `${prefix}-` } },
    select: { code: true },
  });

  const max = rows.reduce((acc, row) => {
    const n = Number(row.code.slice(prefix.length + 1));
    return Number.isFinite(n) && n > acc ? n : acc;
  }, 0);

  return `${prefix}-${String(max + 1).padStart(4, "0")}`;
}
