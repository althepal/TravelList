import { describe, expect, it } from 'vitest'
import { isShareCancellation } from './share'

describe('share cancellation', () => {
  it('recognizes common dismissal and cancellation messages', () => {
    expect(isShareCancellation(new Error('Share canceled'))).toBe(true)
    expect(isShareCancellation(new Error('Sharing was cancelled by the user'))).toBe(true)
    expect(isShareCancellation('Share dismissed')).toBe(true)
    expect(isShareCancellation(new Error('The file operation was aborted'))).toBe(false)
    expect(isShareCancellation(new Error('File provider unavailable'))).toBe(false)
  })
})
