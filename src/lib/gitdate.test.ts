import { describe, it, expect, afterEach } from 'vitest'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { getLastModified, getLastModifiedInfo } from './gitdate'

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

describe('getLastModifiedInfo', () => {
  it('day 直接取自 git %cI 原始输出的日历日，不经过 Date 往返（不受构建机时区影响）', () => {
    // 拿真实 git 输出来比对，不硬编码日期。
    const raw = execFileSync('git', ['log', '-1', '--format=%cI', '--', 'package.json'], {
      cwd: process.cwd(),
      encoding: 'utf8',
    }).trim()
    const info = getLastModifiedInfo('package.json')
    expect(info.day).toBe(raw.slice(0, 10))
  })

  describe('mtime fallback（工作区里存在但从未被 git 提交的文件）', () => {
    const tmpRelPath = 'src/lib/.gitdate-fallback-probe.tmp'
    const tmpAbsPath = path.resolve(process.cwd(), tmpRelPath)

    afterEach(() => {
      fs.rmSync(tmpAbsPath, { force: true })
    })

    it('git 无提交记录时，回退到文件 mtime（而不是直接跳到当前时间）', () => {
      fs.writeFileSync(tmpAbsPath, 'probe')
      const mtime = fs.statSync(tmpAbsPath).mtime
      const info = getLastModifiedInfo(tmpRelPath)
      // 允许秒级误差（mtime 精度、执行耗时）
      expect(Math.abs(info.date.getTime() - mtime.getTime())).toBeLessThan(2000)
      expect(info.day).toBe(
        `${mtime.getFullYear()}-${String(mtime.getMonth() + 1).padStart(2, '0')}-${String(mtime.getDate()).padStart(2, '0')}`,
      )
    })
  })
})
