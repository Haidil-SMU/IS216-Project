export function getItemAmount(item) {
  if (
    item.unitPrice == null ||
    item.unitPrice === '' ||
    item.quantity == null ||
    item.quantity === '' ||
    !Number.isFinite(Number(item.unitPrice)) ||
    !Number.isFinite(Number(item.quantity)) ||
    Number(item.unitPrice) < 0 ||
    Number(item.quantity) <= 0
  ) return null

  const amount = Math.round(
    Number(item.quantity) * Number(item.unitPrice) * 100
  ) / 100

  return Number.isFinite(amount) ? amount : null
}

export function getDraftTotal(request) {
  if (!request.aiDraft) return 0

  return Math.round(
    request.aiDraft.items.reduce(
      (total, item) => total + (getItemAmount(item) ?? 0),
      0
    ) * 100
  ) / 100
}

export function hasMissingPrices(request) {
  return !request.aiDraft ||
    request.aiDraft.items.some(item => getItemAmount(item) === null)
}