import { CillyException } from '../exceptions'

const VARIADIC_SYNTAX = /(\.{3})/
const WHITESPACE = /(\s)*/
const OPTION_NAME_SYNTAX = /(\w((\w\-\w)|\w|)*)/
const DASHES = (n: number): string => `\\-{${n}}`
const SHORT_OPTION_NAME_SYNTAX = new RegExp(`(${DASHES(1)}${OPTION_NAME_SYNTAX.source})`)
const LONG_OPTION_NAME_SYNTAX = new RegExp(`(${DASHES(2)}${OPTION_NAME_SYNTAX.source})`)
const REQUIRED_VALUE_SYNTAX = new RegExp(`(${WHITESPACE.source}<${VARIADIC_SYNTAX.source}?${OPTION_NAME_SYNTAX.source}>)`)
const OPTIONAL_VALUE_SYNTAX = new RegExp(`(${WHITESPACE.source}\\[${VARIADIC_SYNTAX.source}?${OPTION_NAME_SYNTAX.source}\\])`)
const OPTION_SIGNATURE_SYNTAX = new RegExp(
  `^${SHORT_OPTION_NAME_SYNTAX.source},${WHITESPACE.source}${LONG_OPTION_NAME_SYNTAX.source}` +
  `(${REQUIRED_VALUE_SYNTAX.source}|${OPTIONAL_VALUE_SYNTAX.source})*$`)

const matchStart = (regex: RegExp): RegExp => new RegExp(`^${regex.source}`)
const matchEnd = (regex: RegExp): RegExp => new RegExp(`${regex.source}$`)
const matchEntireString = (regex: RegExp): RegExp => matchEnd(matchStart(regex))

const isValidName = (name: string): boolean => matchEntireString(OPTION_NAME_SYNTAX).test(name)
const isShortOptionName = (name: string): boolean => matchEntireString(SHORT_OPTION_NAME_SYNTAX).test(name)
const isLongOptionName = (name: string): boolean => matchEntireString(LONG_OPTION_NAME_SYNTAX).test(name)
const isOptionName = (name: string): boolean => isShortOptionName(name) || isLongOptionName(name)
const isVariadic = (option: string): boolean => VARIADIC_SYNTAX.test(option)
const isRequired = (option: string): boolean => matchEntireString(REQUIRED_VALUE_SYNTAX).test(option)
const isOptional = (option: string): boolean => matchEntireString(OPTIONAL_VALUE_SYNTAX).test(option)
const isValidCliOptionSignature = (signature: string): boolean => matchEntireString(OPTION_SIGNATURE_SYNTAX).test(signature)
const isVariadicTerminator = (token: string): boolean => token === '--'
const isOptionAssignment = (token: string): boolean => {
  return token.includes('=') && isOptionName(token.split('=')[0])
}
/**
 * Capitalizes the first letter in a string
 * @param name The string to capitalize
 */
const capitalize = (name: string): string =>
  name.slice(0, 1).toUpperCase() + name.slice(1)

/**
 * Returns the camelCased version of a list of strings
 * [some, option] --> someOption
 * @param name The words to convert to camelCase
 */
const toCamelCase = (words: string[]): string =>
  words.slice(0, 1) + words.slice(1).map(w => capitalize(w)).join('')

const getLongOptionName = (signature: string): string => {
  const match = signature.match(LONG_OPTION_NAME_SYNTAX)
  if (match === null) {
    throw new CillyException(`Could not extract a long option name from ${signature}`)
  }

  return match[0].replace('--', '')
}

export const getNegatedFlag = (longFlag: string): string => {
  return `--no-${longFlag.replace('--', '')}`
}

export const TokenParser = {
  isValidName,
  isShortOptionName,
  isLongOptionName,
  isOptionName,
  getLongOptionName,
  isVariadic,
  isRequired,
  isOptional,
  isValidCliOptionSignature,
  capitalize,
  toCamelCase,
  isVariadicTerminator,
  isOptionAssignment
}