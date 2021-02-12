import { CillyException } from './exceptions/cilly-exception'
import { STRINGS } from './strings'
import { TokenParser } from './tokens/token-parser'

export type ArgumentValue = any
export type OptionValue = ArgumentValue | { [name: string]: ArgumentValue }
export type ParsedArguments = { [name: string]: ArgumentValue }
export type ParsedOptions = { [name: string]: OptionValue }
export type Validator = (value: ArgumentValue, input: ParsedInput) => string | boolean
export type Hook = (value: ArgumentValue, validator: Validator, input: ParsedInput) => any

export type Argument = {
  name: string,
  required?: boolean,
  variadic?: boolean,
  description?: string,
  defaultValue?: ArgumentValue,
  hook?: Hook,
  validator?: Validator
}

export type Option = {
  name: [string, string],
  required?: boolean,
  negated?: boolean,
  args?: Argument[],
  defaultValue?: OptionValue,
  description?: string,
  hook?: Hook,
  validator?: Validator
}

export type ParsedInput = {
  args: ParsedArguments,
  opts: ParsedOptions,
  extra?: string[]
}

export type CliCommandOptions = {
  inheritOpts?: boolean,
  consumeUnknownOpts?: boolean
}

export class CliCommand {

  name: string
  description: string
  inheritOpts: boolean
  consumeUnknownOpts: boolean

  args: Argument[] = []  // Needs to be an array because we have to pick arguments in order
  opts: { [name: string]: Option } = {}
  subCommands: { [name: string]: CliCommand } = {}
  shortNameMap: { [shortName: string]: string } = {}

  parsed: {
    args: ParsedArguments
    opts: ParsedOptions
    extra: string[]
  } = { args: {}, opts: {}, extra: [] }
  extra: string[] = []

  constructor(name: string, opts: CliCommandOptions = { inheritOpts: true, consumeUnknownOpts: false }) {
    if (!TokenParser.isValidName(name)) {
      throw new CillyException(STRINGS.INVALID_COMMAND_NAME(name))
    }
    this.name = name
    this.inheritOpts = opts.inheritOpts ?? true
    this.consumeUnknownOpts = opts.consumeUnknownOpts ?? false
  }

  public withDescription(description: string): CliCommand {
    this.description = description
    return this
  }

  public withArguments(args: Argument[]): CliCommand {
    for (const arg of args) {
      this.checkArgument(arg)
      if (this.args.some(a => a.name == arg.name)) {
        throw new CillyException(STRINGS.DUPLICATE_ARG_NAME(arg.name))
      }
      this.args.push(arg)
    }

    return this
  }

  public withOptions(options: Option[]): CliCommand {
    for (const option of options) {
      this.checkOption(option)
      const name = this.getName(option)
      const short = this.getShortName(option)
      if (name in this.opts) {
        throw new CillyException(STRINGS.DUPLICATE_OPT_NAME(name))
      }
      if (short in this.shortNameMap) {
        throw new CillyException(STRINGS.DUPLICATE_OPT_NAME(short))
      }

      this.opts[name] = option
      this.shortNameMap[short] = name
    }

    return this
  }

  public withSubCommands(commands: CliCommand[]): CliCommand {
    for (const command of commands) {
      this.checkSubCommand(command)
      if (command.inheritOpts) {
        command.opts = { ...this.opts, ...command.opts }
      }
      this.subCommands[command.name] = command
    }

    return this
  }

  /**
   * Parses the process arguments and generates args, opts, and extra objects.
   * Does not invoke command handlers and does not invoke hooks or validators.
   * @param processArgs The process arguments (typically process.argv)
   * @param opts parse() automatically strips the first two arguments from its input.
   * To prevent this, set opts.stripExecScript to false.
   */
  public parse(processArgs: string[], opts: { stripExecScript: boolean } = { stripExecScript: true }): ParsedInput {
    // The "queue" of arguments, cloned so we don't modify the original
    const q = [...opts.stripExecScript ? processArgs.slice(2) : processArgs]

    // Parse the input
    while (q.length) {
      const next = q[0]

      if (next === this.name) {
        q.shift()
        continue
      }

      if (next in this.subCommands) {
        return this.subCommands[next].parse(q, { stripExecScript: false })
      }

      if (TokenParser.isOptionName(next)) {
        const parsed = this.consumeOption(q)
        if (!parsed) continue
        const [name, value] = parsed
        this.parsed.opts[name] = value
      } else if (!this.isEmpty(this.args)) {
        const parsed = this.consumeArgument(this.args.shift(), q)
        if (!parsed) continue
        const [name, value] = parsed
        this.parsed.args[name] = value
      } else {
        this.parsed.extra.push(next)
        q.shift()
      }
    }

    this.handleUnassignedOptions()
    this.handleUnassignedArguments()

    return this.parsed
  }

  private consumeOption(q: string[]): [string, OptionValue] | undefined {
    const next = q.shift()

    if (!next) {
      return undefined
    }

    const name = this.getName(next)
    if (!(name in this.opts)) {
      if (this.consumeUnknownOpts) {
        this.parsed.extra.push(next)
        return undefined
      } else {
        throw new CillyException(STRINGS.UNKNOWN_OPTION_NAME(next))
      }
    }

    if (name in this.parsed.opts) {
      throw new CillyException(STRINGS.DUPLICATE_OPT_NAME(name))
    }

    const opt = this.opts[name]

    let optValue: OptionValue

    if (!opt.args) {
      optValue = opt.defaultValue ?? true
    } else {
      optValue = {}
      for (const arg of opt.args) {
        const parsed = this.consumeArgument(arg, q)
        if (!parsed) {
          throw new CillyException(STRINGS.EXPECTED_BUT_GOT(`An argument for ${name}`, 'nothing'))
        }
        const [argName, argValue] = parsed
        optValue[argName] = argValue
      }
    }

    // Fold the option arugment into the option itself if there's only one argument, e.g:
    // myOption = { arg: 1 } becomes myOption = 1
    if (optValue instanceof Object && Object.keys(optValue).length == 1) {
      optValue = Object.values(optValue)[0]
    }

    return [name, optValue]
  }

  private consumeArgument(arg: Argument | undefined, q: string[]): [string, ArgumentValue] {
    if (!arg) {
      // Shouldn't ever happen, just to make TypeScript happy with the .shift() input
      throw new CillyException(STRINGS.EXPECTED_BUT_GOT('an argument', 'nothing'))
    }

    let argValue: ArgumentValue = undefined
    const next = q[0]

    if (next) {
      // We parse options first, so this must be an (potentially unknown) argument
      if (arg.variadic) {
        argValue = this.consumeVariadicArguments(q)
      } else {
        argValue = q.shift()
      }
    } else {
      if (arg.required) {
        throw new CillyException(STRINGS.EXPECTED_BUT_GOT(`a value for "${arg.name}"`, 'nothing'))
      } else {
        argValue = arg.defaultValue ?? undefined
      }
    }

    return [this.getName(arg), argValue]
  }

  private consumeVariadicArguments(q: string[]): string[] {
    const args: string[] = []

    while (q[0] && !TokenParser.isOptionName(q[0])) {
      args.push(q[0])
      q.shift()
    }

    return args
  }

  /**
   * To be called at the end of parsing, checks that all required options have been
   * assigned and assigns default values to all unassigned, optional options
   */
  private handleUnassignedOptions(): void {
    for (const [name, opt] of Object.entries(this.opts)) {
      if (!(name in this.parsed.opts)) {
        if (opt.required) {
          throw new CillyException(STRINGS.EXPECTED_BUT_GOT(`a value for "${name}"`, 'nothing'))
        } else {
          this.parsed.opts[name] = opt.defaultValue
        }
      }
    }
  }

  /**
   * To be called at the end of parsing, checks that all required arguments
   * have been assigned and assigns default values to all unassigned, optional args
   */
  private handleUnassignedArguments(): void {
    for (const a of this.args.filter(a => a.required)) {
      throw new CillyException(STRINGS.EXPECTED_BUT_GOT(`a value for "${a.name}"`, 'nothing'))
    }

    for (const a of this.args) {
      this.parsed.args[this.getName(a)] = a.defaultValue
    }
  }

  private checkOption(option: Option): void {
    if (option.name.length !== 2) {
      throw new CillyException(STRINGS.INVALID_N_OPTION_NAMES(option.name))
    }
    const [short, long] = option.name
    if (!TokenParser.isShortOptionName(short)) {
      throw new CillyException(STRINGS.INVALID_SHORT_OPTION_NAME(short))
    }
    if (!TokenParser.isLongOptionName(long)) {
      throw new CillyException(STRINGS.INVALID_LONG_OPTION_NAME(long))
    }

    for (const arg of option.args ?? []) {
      this.checkArgument(arg)
    }
  }

  private checkArgument(arg: Argument): void {
    if (!this.isEmpty(this.subCommands)) {
      throw new CillyException(STRINGS.NO_ARGS_AND_SUBCOMMANDS(this.name))
    }

    if (!TokenParser.isValidName(arg.name)) {
      throw new CillyException(STRINGS.INVALID_ARGUMENT_NAME(arg.name))
    }
  }

  private checkSubCommand(command: CliCommand): void {
    if (!this.isEmpty(this.args)) {
      throw new CillyException(STRINGS.NO_ARGS_AND_SUBCOMMANDS(command.name))
    }
  }

  /**
   * Returns the camelCased version of the short flag of an option.
   * @param opt An option with a short flag definition.
   */
  private getShortName(opt: Option): string {
    return TokenParser.toCamelCase(opt.name[0].replace('-', '').split('-'))
  }

  /**
   * Returns the camelCased name of an option, arguemnt, or flag definition (string).
   * If the passed string is a short-flag definition (e.g. "-v" for the "--verbose" flag)
   * the long name (in this case "verbose") will be returned.
   * @param arg The option, argument, or flag definition to get the name for.
   */
  private getName(arg: Option | Argument | string): string {
    if (typeof arg === 'string') {
      // It's a flag definition - parse long definitions directly, and
      // look up the name for short-flag definitions in the shortNameMap
      if (TokenParser.isLongOptionName(arg)) {
        return TokenParser.toCamelCase(arg.replace('--', '').split('-'))
      } else {
        const shortName = TokenParser.toCamelCase(arg.replace('-', '').split('-'))
        return this.shortNameMap[shortName]
      }
    } else if (arg.name instanceof Array) {
      // It's an option (option.name is [short-flag, long-flag])
      return TokenParser.toCamelCase(arg.name[1].replace('--', '').split('-'))
    } else {
      // It's an argument
      return TokenParser.toCamelCase(arg.name.split('-'))
    }
  }

  /**
   * Utility method for testing empty objects or arrays
   * @param obj Object or array to test
   */
  private isEmpty(obj: any): boolean {
    if (obj instanceof Array) {
      return obj.length === 0
    } else {
      return Object.keys(obj).length === 0
    }
  }
}