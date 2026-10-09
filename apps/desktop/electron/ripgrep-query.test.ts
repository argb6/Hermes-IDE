import assert from 'node:assert/strict'

import { test } from 'vitest'

import { buildRgArgs, parseRgMatch, replaceInText } from './ripgrep-query'

const base = {
  caseSensitive: false,
  exclude: '',
  include: '',
  query: 'token',
  regex: false,
  wholeWord: false
}

test('buildRgArgs streams json and skips heavy directories', () => {
  const args = buildRgArgs({ ...base, caseSensitive: true, exclude: 'coverage, *.min.js', include: '*.ts', regex: true, wholeWord: true })

  assert.equal(args[0], '--json')
  assert.ok(args.includes('--word-regexp'))
  assert.equal(args.includes('--fixed-strings'), false)
  assert.equal(args.includes('--ignore-case'), false)
  assert.ok(args.includes('!.git/**'))
  assert.ok(args.includes('*.ts'))
  assert.ok(args.includes('!coverage'))
  assert.ok(args.includes('!*.min.js'))
  assert.deepEqual(args.slice(-2), ['--', 'token'])
})

test('parseRgMatch reads a ripgrep json match row', () => {
  const row = JSON.stringify({
    type: 'match',
    data: {
      path: { text: 'src/app.ts' },
      lines: { text: 'const token = 1\n' },
      line_number: 4,
      submatches: [{ match: { text: 'token' }, start: 6, end: 11 }]
    }
  })

  assert.deepEqual(parseRgMatch(row), {
    column: 7,
    length: 5,
    line: 4,
    path: 'src/app.ts',
    preview: 'const token = 1'
  })
  assert.equal(parseRgMatch('{"type":"summary"}'), null)
  assert.equal(parseRgMatch('not-json'), null)
})

test('replaceInText honors literal, regex, case, and whole word', () => {
  const literal = replaceInText('Token token\n', { ...base, caseSensitive: true }, 'id')

  assert.equal(literal.text, 'Token id\n')
  assert.equal(literal.count, 1)

  const word = replaceInText('token tokens', { ...base, wholeWord: true, caseSensitive: true }, 'id')

  assert.equal(word.text, 'id tokens')
  assert.equal(word.count, 1)

  const pattern = replaceInText('a1 a2', { ...base, query: 'a\\d', regex: true, caseSensitive: true }, 'x')

  assert.equal(pattern.text, 'x x')
  assert.equal(pattern.count, 2)
})
