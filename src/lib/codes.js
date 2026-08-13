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
