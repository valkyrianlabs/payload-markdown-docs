import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

const here = path.dirname(fileURLToPath(import.meta.url))

describe('projects API contract', () => {
  test('the server and consumer copies are byte-identical', () => {
    const server = fs.readFileSync(path.join(here, 'contract.ts'), 'utf8')
    const consumer = fs.readFileSync(path.resolve(here, '../../packages/consumer/src/contract.ts'), 'utf8')

    expect(server).toBe(consumer)
  })
})
