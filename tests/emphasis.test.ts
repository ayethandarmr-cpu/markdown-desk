import { describe, it, expect } from 'vitest'
import { fixLooseEmphasis } from '../src/util'

describe('fixLooseEmphasis', () => {
  it('moves trailing spaces outside bold markers', () => {
    expect(fixLooseEmphasis('- **Backup and replication: **Virtual environments')).toBe('- **Backup and replication:** Virtual environments')
    expect(fixLooseEmphasis('**Fast expansion: ** You can')).toBe('**Fast expansion:** You can')
    expect(fixLooseEmphasis('a ** spaced ** word')).toBe('a **spaced** word')
    expect(fixLooseEmphasis('__Note: __text')).toBe('__Note:__ text')
  })
  it('leaves valid Markdown and code alone', () => {
    const ok = '**Scalability** - **Dynamic resource allocation**: Easily'
    expect(fixLooseEmphasis(ok)).toBe(ok)
    expect(fixLooseEmphasis('use `**a **b` here')).toBe('use `**a **b` here')
    expect(fixLooseEmphasis('```\n**x **y\n```')).toBe('```\n**x **y\n```')
    expect(fixLooseEmphasis('***')).toBe('***')
    expect(fixLooseEmphasis('**Correct Answer:** **B** (x)')).toBe('**Correct Answer:** **B** (x)')
  })
})
