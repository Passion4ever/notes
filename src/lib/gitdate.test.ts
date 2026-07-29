import { describe, it, expect } from 'vitest'
import { getLastModified } from './gitdate'

describe('getLastModified', () => {
  it('对已提交文件返回合理日期', () => {
    const d = getLastModified('package.json')
    expect(d).toBeInstanceOf(Date)
    expect(Number.isNaN(d.getTime())).toBe(false)
    expect(d.getFullYear()).toBeGreaterThan(2000)
  })

  it('对不存在的文件不抛异常，返回 Date', () => {
    const d = getLastModified('does-not-exist-xyz.md')
    expect(d).toBeInstanceOf(Date)
    expect(Number.isNaN(d.getTime())).toBe(false)
  })
})
