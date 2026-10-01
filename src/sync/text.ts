/**
 * Text primitives shared by the docs sync contract.
 *
 * These helpers define the exact line, whitespace and control-character
 * semantics that the server (this module) and the native `pmdocs` CLI
 * (`cli/src/docs.cpp`) must agree on. The shared vectors in
 * `contracts/vectors/` pin them on both sides.
 */

const BYTE_ORDER_MARK = '﻿'

/** Removes a single leading UTF-8 byte order mark (U+FEFF). */
export const stripByteOrderMark = (value: string): string =>
  value.startsWith(BYTE_ORDER_MARK) ? value.slice(BYTE_ORDER_MARK.length) : value

/**
 * Splits Markdown source into lines. CRLF, lone CR and LF are all line
 * endings (CommonMark), so a lone `\r` never leaks into titles or values.
 */
export const splitMarkdownLines = (value: string): string[] => value.split(/\r\n|\r|\n/)

/** ASCII control characters plus DEL and the C1 control block. */
export const isControlCharacterCode = (code: number): boolean =>
  code <= 0x1f || (code >= 0x7f && code <= 0x9f)

/**
 * Non-control whitespace from the ECMAScript WhiteSpace/LineTerminator sets
 * (the characters `String.prototype.trim` removes, minus ASCII controls).
 */
export const isNonControlWhitespaceCode = (code: number): boolean =>
  code === 0x20 ||
  code === 0xa0 ||
  code === 0x1680 ||
  (code >= 0x2000 && code <= 0x200a) ||
  code === 0x2028 ||
  code === 0x2029 ||
  code === 0x202f ||
  code === 0x205f ||
  code === 0x3000 ||
  code === 0xfeff

export const containsControlCharacter = (value: string): boolean => {
  for (let index = 0; index < value.length; index += 1) {
    if (isControlCharacterCode(value.charCodeAt(index))) {
      return true
    }
  }

  return false
}

export const containsNonControlWhitespace = (value: string): boolean => {
  for (let index = 0; index < value.length; index += 1) {
    if (isNonControlWhitespaceCode(value.charCodeAt(index))) {
      return true
    }
  }

  return false
}
