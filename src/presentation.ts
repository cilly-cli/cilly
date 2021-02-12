import { ArgumentDefinition, CommandDefinition, OptionDefinition } from './cli-command'
import { getNegatedFlag } from './tokens/token-parser'

const padToLength = (str: string, length: number): string => {
  const padding = length - str.length
  str += ' '.repeat(padding)
  return str
}

const formatArguments = (args: ArgumentDefinition[]): string => {
  const argStrings: string[] = []
  for (const arg of args) {
    let argString = arg.name
    if (arg.variadic) {
      argString = `...${argString}`
    }
    if (arg.required) {
      argString = `<${argString}>`
    } else {
      argString = `[${argString}]`
    }
    argStrings.push(argString)
  }

  return argStrings.length ? argStrings.join(' ') : ''
}

const formatOptions = (opts: OptionDefinition[]): string => {
  const padding = 4
  let maxOptionLength = 0
  const optStrings: string[] = []

  // Generate option definition string, max length for justification
  for (const opt of opts) {
    let optString = `  ${opt.name[0]}, ${opt.name[1]}`
    if (opt.args.length) {
      optString += ` ${formatArguments(opt.args)}`
    }
    if (optString.length > maxOptionLength) {
      maxOptionLength = optString.length
    }
    optStrings.push(optString)
  }

  for (let i = 0; i < opts.length; i++) {
    const opt = opts[i]
    let optString = optStrings[i]
    optString = padToLength(optString, maxOptionLength + padding)
    if (opt.negatable) {
      optString += ` (${getNegatedFlag(opt.name[1])})`
    }
    if (opt.description) {
      optString += ` ${opt.description}`
    }
    if (opt.defaultValue !== undefined) {
      optString += ` (default: ${JSON.stringify(opt.defaultValue)})`
    }
    if (opt.required) {
      optString += '(required)'
    }
    optStrings[i] = optString
  }

  return optStrings.join('\n')
}

const formatCommandUsage = (command: CommandDefinition): string => {
  return `${command.name} ${formatArguments(command.args)} [options]`
}

const formatSubCommands = (subCommands: CommandDefinition[]): string => {
  return subCommands.map(c => `  ${formatCommandUsage(c)}`).join('\n')
}

export const showHelp = (command: CommandDefinition): void => {
  console.log(`Usage: ${formatCommandUsage(command)}`)
  console.log()
  if (command.description) {
    console.log(command.description)
    console.log()
  }
  if (command.opts.length) {
    console.log('Options:')
    console.log(formatOptions(command.opts))
    console.log()
  }
  if (command.subCommands.length) {
    console.log('Commands:')
    console.log(formatSubCommands(command.subCommands))
    console.log()
  }
}