// Native share-sheet plugins report a dismissed sheet as a rejected promise.
// Treat common cancellation wording as a normal user action.
export function isShareCancellation(error) {
  const message = typeof error === 'string' ? error : error?.message ?? ''
  return /\b(cancel(?:led|ed|lation|ation)?|dismiss(?:ed|al)?)\b/i.test(message)
}
