import { splitMarkdownLines } from './text.js'

/**
 * Title inference for docs pages without a frontmatter `title`.
 *
 * The rules are a deliberately small, documented subset of CommonMark (see
 * `contracts/README.md`, "Title inference"). The native CLI implements the
 * same rules in `cli/src/docs.cpp`; `contracts/vectors/titles.json` pins both.
 */

const isAsciiWhitespaceCode = (code: number | undefined): boolean =>
  code === undefined ||
  code === 0x20 ||
  code === 0x09 ||
  code === 0x0a ||
  code === 0x0b ||
  code === 0x0c ||
  code === 0x0d

const isAsciiPunctuationCode = (code: number | undefined): boolean =>
  code !== undefined &&
  ((code >= 0x21 && code <= 0x2f) ||
    (code >= 0x3a && code <= 0x40) ||
    (code >= 0x5b && code <= 0x60) ||
    (code >= 0x7b && code <= 0x7e))

type InlineToken =
  | {
      canClose: boolean
      canOpen: boolean
      character: string
      length: number
      removed: boolean
      type: 'delimiter'
    }
  | {
      type: 'text'
      value: string
    }

const runLength = (value: string, start: number, character: string): number => {
  let end = start

  while (end < value.length && value[end] === character) {
    end += 1
  }

  return end - start
}

/** Finds the `]` matching the `[` at `open`, honouring nesting and escapes. */
const findClosingBracket = (value: string, open: number): number => {
  let depth = 0

  for (let index = open; index < value.length; index += 1) {
    const character = value[index]

    if (character === '\\') {
      index += 1
      continue
    }

    if (character === '[') {
      depth += 1
    } else if (character === ']') {
      depth -= 1

      if (depth === 0) {
        return index
      }
    }
  }

  return -1
}

/** Finds the `)` matching the `(` at `open`, honouring nesting and escapes. */
const findClosingParenthesis = (value: string, open: number): number => {
  let depth = 0

  for (let index = open; index < value.length; index += 1) {
    const character = value[index]

    if (character === '\\') {
      index += 1
      continue
    }

    if (character === '(') {
      depth += 1
    } else if (character === ')') {
      depth -= 1

      if (depth === 0) {
        return index
      }
    }
  }

  return -1
}

const isAsciiLetterCode = (code: number): boolean =>
  (code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a)

const isAsciiAlphanumericCode = (code: number): boolean =>
  isAsciiLetterCode(code) || (code >= 0x30 && code <= 0x39)

const emailLocalPunctuation = ".!#$%&'*+/=?^_`{|}~-"

/**
 * Matches a CommonMark autolink (`<scheme:...>` or `<local@domain>`) at
 * `start` (which must be `<`). Returns the link text and the end index
 * (exclusive), or undefined.
 */
const matchAutolink = (value: string, start: number): { end: number; text: string } | undefined => {
  const close = value.indexOf('>', start + 1)

  if (close === -1) {
    return undefined
  }

  const inner = value.slice(start + 1, close)

  for (const character of inner) {
    const code = character.charCodeAt(0)

    if (character === '<' || code <= 0x20) {
      return undefined
    }
  }

  const colon = inner.indexOf(':')

  if (colon >= 2 && colon <= 32 && isAsciiLetterCode(inner.charCodeAt(0))) {
    let scheme = true

    for (let index = 1; index < colon; index += 1) {
      const code = inner.charCodeAt(index)

      if (!isAsciiAlphanumericCode(code) && code !== 0x2b && code !== 0x2e && code !== 0x2d) {
        scheme = false
        break
      }
    }

    if (scheme) {
      return { end: close + 1, text: inner }
    }
  }

  const at = inner.indexOf('@')

  if (at <= 0 || at === inner.length - 1) {
    return undefined
  }

  for (let index = 0; index < at; index += 1) {
    const code = inner.charCodeAt(index)

    if (!isAsciiAlphanumericCode(code) && !emailLocalPunctuation.includes(inner[index])) {
      return undefined
    }
  }

  for (const label of inner.slice(at + 1).split('.')) {
    if (
      label === '' ||
      label.length > 63 ||
      label.startsWith('-') ||
      label.endsWith('-') ||
      [...label].some((character) => !isAsciiAlphanumericCode(character.charCodeAt(0)) && character !== '-')
    ) {
      return undefined
    }
  }

  return { end: close + 1, text: inner }
}

const tokenizeInline = (value: string): InlineToken[] => {
  const tokens: InlineToken[] = []
  let text = ''
  const flushText = () => {
    if (text) {
      tokens.push({ type: 'text', value: text })
      text = ''
    }
  }

  let index = 0

  while (index < value.length) {
    const character = value.charAt(index)

    if (character === '\\' && isAsciiPunctuationCode(value.charCodeAt(index + 1))) {
      flushText()
      tokens.push({ type: 'text', value: value.charAt(index + 1) })
      index += 2
      continue
    }

    if (character === '`') {
      const length = runLength(value, index, '`')
      let search = index + length
      let closing = -1

      while (search < value.length) {
        if (value[search] === '`') {
          const closingLength = runLength(value, search, '`')

          if (closingLength === length) {
            closing = search
            break
          }

          search += closingLength
        } else {
          search += 1
        }
      }

      if (closing === -1) {
        text += '`'.repeat(length)
        index += length
        continue
      }

      let code = value.slice(index + length, closing)

      if (code.length >= 2 && code.startsWith(' ') && code.endsWith(' ') && code.trim() !== '') {
        code = code.slice(1, -1)
      }

      flushText()
      tokens.push({ type: 'text', value: code })
      index = closing + length
      continue
    }

    const isImage = character === '!' && value[index + 1] === '['

    if (character === '[' || isImage) {
      const open = isImage ? index + 1 : index
      const close = findClosingBracket(value, open)

      if (close !== -1) {
        const label = value.slice(open + 1, close)
        const next = value[close + 1]
        let end = -1

        if (next === '(') {
          end = findClosingParenthesis(value, close + 1)
        } else if (next === '[') {
          end = findClosingBracket(value, close + 1)
        }

        if (end !== -1) {
          flushText()
          tokens.push({ type: 'text', value: stripInlineMarkdown(label) })
          index = end + 1
          continue
        }
      }

      text += character
      index += 1
      continue
    }

    if (character === '<') {
      const autolink = matchAutolink(value, index)

      if (autolink) {
        flushText()
        tokens.push({ type: 'text', value: autolink.text })
        index = autolink.end
        continue
      }
    }

    if (character === '*' || character === '_' || character === '~') {
      const length = runLength(value, index, character)
      const before = index > 0 ? value.charCodeAt(index - 1) : undefined
      const after = index + length < value.length ? value.charCodeAt(index + length) : undefined
      const leftFlanking =
        !isAsciiWhitespaceCode(after) &&
        (!isAsciiPunctuationCode(after) ||
          isAsciiWhitespaceCode(before) ||
          isAsciiPunctuationCode(before))
      const rightFlanking =
        !isAsciiWhitespaceCode(before) &&
        (!isAsciiPunctuationCode(before) ||
          isAsciiWhitespaceCode(after) ||
          isAsciiPunctuationCode(after))
      const canOpen =
        character === '_'
          ? leftFlanking && (!rightFlanking || isAsciiPunctuationCode(before))
          : leftFlanking
      const canClose =
        character === '_'
          ? rightFlanking && (!leftFlanking || isAsciiPunctuationCode(after))
          : rightFlanking

      flushText()
      tokens.push({
        type: 'delimiter',
        canClose,
        canOpen,
        character,
        length,
        removed: false,
      })
      index += length
      continue
    }

    text += character
    index += 1
  }

  flushText()

  return tokens
}

/**
 * Converts inline Markdown to plain text: code spans keep their content,
 * links and images keep their label/alt text, autolinks keep their target,
 * backslash escapes are resolved and matched emphasis/strikethrough
 * delimiter runs (`*`, `_`, `~` with equal run length) are removed.
 * Raw HTML and entities are left untouched.
 */
export const stripInlineMarkdown = (value: string): string => {
  const tokens = tokenizeInline(value)

  for (let index = 0; index < tokens.length; index += 1) {
    const opener = tokens[index]

    if (
      !opener ||
      opener.type !== 'delimiter' ||
      opener.removed ||
      !opener.canOpen ||
      (opener.character === '~' && opener.length > 2) ||
      opener.length > 3
    ) {
      continue
    }

    for (let candidate = index + 1; candidate < tokens.length; candidate += 1) {
      const closer = tokens[candidate]

      if (
        closer?.type === 'delimiter' &&
        !closer.removed &&
        closer.canClose &&
        closer.character === opener.character &&
        closer.length === opener.length
      ) {
        opener.removed = true
        closer.removed = true
        break
      }
    }
  }

  return tokens
    .map((token) => {
      if (token.type === 'text') {
        return token.value
      }

      return token.removed ? '' : token.character.repeat(token.length)
    })
    .join('')
}

const indentWidth = (line: string): number => {
  let width = 0

  for (const character of line) {
    if (character === ' ') {
      width += 1
    } else if (character === '\t') {
      width += 4 - (width % 4)
    } else {
      break
    }
  }

  return width
}

const isBlankLine = (line: string): boolean => {
  for (const character of line) {
    if (character !== ' ' && character !== '\t') {
      return false
    }
  }

  return true
}

/** Number of leading spaces when there are at most three, otherwise -1. */
const smallIndent = (line: string): number => {
  let index = 0

  while (index < line.length && line[index] === ' ') {
    index += 1
  }

  return index <= 3 ? index : -1
}

const isOnlySpacesAndTabsFrom = (line: string, start: number): boolean => isBlankLine(line.slice(start))

const matchFenceOpen = (line: string): { character: string; length: number } | undefined => {
  const start = smallIndent(line)
  const character = line.charAt(start)

  if (start === -1 || (character !== '`' && character !== '~')) {
    return undefined
  }

  const length = runLength(line, start, character)

  if (length < 3 || (character === '`' && line.slice(start + length).includes('`'))) {
    return undefined
  }

  return { character, length }
}

const isFenceClose = (line: string, fence: { character: string; length: number }): boolean => {
  const start = smallIndent(line)

  if (start === -1 || line.charAt(start) !== fence.character) {
    return false
  }

  const length = runLength(line, start, fence.character)

  return length >= fence.length && isOnlySpacesAndTabsFrom(line, start + length)
}

const trimSpacesAndTabs = (value: string): string => {
  let start = 0
  let end = value.length

  while (start < end && (value[start] === ' ' || value[start] === '\t')) {
    start += 1
  }

  while (end > start && (value[end - 1] === ' ' || value[end - 1] === '\t')) {
    end -= 1
  }

  return value.slice(start, end)
}

/** Parses an ATX heading line. Returns the level and raw text (closing sequence removed). */
const matchAtxHeading = (line: string): { level: number; text: string } | undefined => {
  const start = smallIndent(line)

  if (start === -1 || line.charAt(start) !== '#') {
    return undefined
  }

  const level = runLength(line, start, '#')
  const after = line.charAt(start + level)

  if (level > 6 || (after !== '' && after !== ' ' && after !== '\t')) {
    return undefined
  }

  let text = trimSpacesAndTabs(line.slice(start + level))
  let closing = text.length

  while (closing > 0 && text[closing - 1] === '#') {
    closing -= 1
  }

  if (closing === 0) {
    text = ''
  } else if (closing < text.length && (text[closing - 1] === ' ' || text[closing - 1] === '\t')) {
    text = trimSpacesAndTabs(text.slice(0, closing))
  }

  return { level, text }
}

/** A line made of one marker character repeated (at least `minimum` times), with optional spaces/tabs. */
const isMarkerLine = (line: string, markers: string, minimum: number, allowInnerSpaces: boolean): boolean => {
  const start = smallIndent(line)
  const marker = line.charAt(start)

  if (start === -1 || marker === '' || !markers.includes(marker)) {
    return false
  }

  let count = 0
  let index = start

  while (index < line.length && line[index] === marker) {
    count += 1
    index += 1

    if (allowInnerSpaces) {
      while (index < line.length && (line[index] === ' ' || line[index] === '\t')) {
        index += 1
      }
    }
  }

  return count >= minimum && isOnlySpacesAndTabsFrom(line, index)
}

const isSetextH1Underline = (line: string): boolean => isMarkerLine(line, '=', 1, false)

const isThematicBreakOrSetextH2Underline = (line: string): boolean =>
  isMarkerLine(line, '-', 1, false) || isMarkerLine(line, '-*_', 3, true)

const isBlockquoteLine = (line: string): boolean => {
  const start = smallIndent(line)

  return start !== -1 && line.charAt(start) === '>'
}

const isListItemLine = (line: string): boolean => {
  const start = smallIndent(line)

  if (start === -1) {
    return false
  }

  let index = start
  const first = line.charAt(index)

  if (first === '-' || first === '+' || first === '*') {
    index += 1
  } else {
    while (index < line.length && index - start < 9 && line.charCodeAt(index) >= 0x30 && line.charCodeAt(index) <= 0x39) {
      index += 1
    }

    if (index === start || (line.charAt(index) !== '.' && line.charAt(index) !== ')')) {
      return false
    }

    index += 1
  }

  const after = line.charAt(index)

  return after === '' || after === ' ' || after === '\t'
}

const finishTitle = (raw: string): string | undefined => {
  const title = stripInlineMarkdown(raw).trim()

  return title === '' ? undefined : title
}

/**
 * Infers a page title from the first top-level level-1 heading (ATX `# Title`
 * or setext `Title\n===`). Headings inside fenced code, indented code,
 * blockquotes and list items are ignored.
 */
export const inferTitleFromMarkdown = (content: string): string | undefined => {
  let fence: { character: string; length: number } | undefined
  let paragraph: string[] = []

  for (const line of splitMarkdownLines(content)) {
    if (fence) {
      if (isFenceClose(line, fence)) {
        fence = undefined
      }

      continue
    }

    const fenceOpen = matchFenceOpen(line)

    if (fenceOpen) {
      fence = fenceOpen
      paragraph = []
      continue
    }

    if (isBlankLine(line)) {
      paragraph = []
      continue
    }

    if (indentWidth(line) >= 4) {
      if (paragraph.length > 0) {
        paragraph.push(line.trim())
      }

      continue
    }

    const atx = matchAtxHeading(line)

    if (atx) {
      paragraph = []

      if (atx.level === 1) {
        const title = finishTitle(atx.text)

        if (title) {
          return title
        }
      }

      continue
    }

    if (paragraph.length > 0 && isSetextH1Underline(line)) {
      const title = finishTitle(paragraph.join(' '))

      if (title) {
        return title
      }

      paragraph = []
      continue
    }

    if (isThematicBreakOrSetextH2Underline(line) || isBlockquoteLine(line) || isListItemLine(line)) {
      paragraph = []
      continue
    }

    paragraph.push(line.trim())
  }

  return undefined
}
