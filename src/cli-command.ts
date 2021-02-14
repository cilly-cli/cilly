import { showHelp } from './presentation'
import { DuplicateArgumentException, DuplicateCommandNameException, DuplicateOptionException, InvalidArgumentNameException, InvalidCommandNameException, InvalidLongOptionNameException, InvalidNumOptionNamesException, InvalidShortOptionNameException, NoArgsAndSubCommandsException, NoCommandHandlerException, ExpectedButGotException, UnknownOptionException, UnknownSubcommandException, ValidationError } from './exceptions'
import { getNegatedFlag, TokenParser } from './tokens/token-parser'

export type ArgumentValue = any
export type OptionValue = ArgumentValue | { [name: string]: ArgumentValue }
export type ParsedArguments = { [name: string]: ArgumentValue }
export type ParsedOptions = { [name: string]: OptionValue }
export type Validator = (value: ArgumentValue, input: ParsedInput) => Promise<string | boolean> | string | boolean
export type OnParseHook = (value: ArgumentValue, input: ParsedInput) => void
export type OnProcessHook = (value: ArgumentValue, input: ParsedInput, assign: (value: any) => Promise<void>) => Promise<void> | void
export type CommandHandler = (args: ParsedArguments, opts: ParsedOptions, extra?: string[]) => Promise<void> | void

export type Argument = {
  name: string,
  required?: boolean,
  variadic?: boolean,
  description?: string,
  defaultValue?: ArgumentValue,
  onParse?: OnParseHook,
  onProcess?: OnProcessHook,
  validator?: Validator
}

export type Option = {
  name: [string, string],
  required?: boolean,
  negatable?: boolean,
  args?: Argument[],
  defaultValue?: OptionValue,
  description?: string,
  onParse?: OnParseHook,
  onProcess?: OnProcessHook,
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

export type OptionDefinition = {
  name: [string, string],
  args: ArgumentDefinition[],
  description?: string,
  required?: boolean,
  negatable?: boolean,
  defaultValue?: any
}

export type ArgumentDefinition = {
  name: string,
  description?: string,
  required?: boolean,
  defaultValue?: any,
  variadic?: boolean
}

export type CommandDefinition = {
  name: string,
  description?: string,
  opts: OptionDefinition[],
  args: ArgumentDefinition[],
  subCommands: CommandDefinition[]
}
export class CliCommand {

  name: string
  version: string
  description: string

  private handler?: CommandHandler
  private helpHandler: (command: CommandDefinition) => void
  private inheritOpts?: boolean
  private consumeUnknownOpts?: boolean
  private args: Argument[] = []  // Needs to be an array because we have to pick arguments in order
  private opts: { [name: string]: Option } = {}
  private subCommands: { [name: string]: CliCommand } = {}
  private shortNameMap: { [shortName: string]: string } = {}
  private argsMap: { [name: string]: Argument } = {}  // So we can match parsed args to their definitions
  private negatableOptsMap: { [name: string]: Option } = {}  // Maps --no-* flags to negatable options

  private parsed: {
    args: ParsedArguments
    opts: ParsedOptions
    extra: string[]
  } = { args: {}, opts: {}, extra: [] }

  constructor(name: string, opts: CliCommandOptions = {
    inheritOpts: false,
    consumeUnknownOpts: false
  }) {
    if (!TokenParser.isValidName(name)) {
      throw new InvalidCommandNameException(name)
    }

    this.name = name
    this.inheritOpts = opts.inheritOpts
    this.consumeUnknownOpts = opts.consumeUnknownOpts

    /* istanbul ignore next */
    this.helpHandler = (command: CommandDefinition): void => {
      showHelp(command)
      process.exit(0)
    }

    this.withOptions({
      name: ['-h', '--help'],
      description: 'Display help for command',
      onParse: () => {
        this.helpHandler(this.dump())
      }
    })
  }

  public withDescription(description: string): CliCommand {
    this.description = description
    return this
  }

  public withArguments(...args: Argument[]): CliCommand {
    for (const arg of args) {
      this.checkArgument(arg)
      if (this.args.some(a => a.name == arg.name)) {
        throw new DuplicateArgumentException(arg.name, this.dump())
      }
      this.args.push(arg)
      this.argsMap[this.getName(arg)] = arg
    }

    return this
  }

  public withOptions(...options: Option[]): CliCommand {
    for (const option of options) {
      this.checkOption(option)
      const name = this.getName(option)
      const short = this.getShortName(option)
      if (name in this.opts) {
        throw new DuplicateOptionException(name, this.dump())
      }
      if (short in this.shortNameMap) {
        throw new DuplicateOptionException(short, this.dump())
      }
      if (option.negatable) {
        const negatedFlag = getNegatedFlag(option.name[1])
        this.negatableOptsMap[negatedFlag] = option
      }

      this.opts[name] = option
      this.shortNameMap[short] = name
    }

    return this
  }

  public withSubCommands(...commands: CliCommand[]): CliCommand {
    for (const command of commands) {
      this.checkSubCommand(command)
      if (command.inheritOpts) {
        command.opts = { ...this.opts, ...command.opts }
      }
      this.subCommands[command.name] = command
    }

    return this
  }

  public withHandler(handler: CommandHandler): CliCommand {
    this.handler = handler
    return this
  }

  public withHelpHandler(handler: (command: CommandDefinition) => void): CliCommand {
    this.helpHandler = handler
    return this
  }

  public withVersion(version: string, handler?: (command: CommandDefinition) => void): CliCommand {
    this.version = version
    this.withOptions(
      {
        name: ['-v', '--version'], description: 'Display the version', onParse: () => {
          /* istanbul ignore else */
          if (handler) {
            handler(this.dump())
          } else {
            console.log(this.version)
            process.exit()
          }
        }
      }
    )

    return this
  }

  public dump(dumped: CliCommand[] = []): CommandDefinition {
    return {
      name: this.name,
      description: this.description,
      opts: Object.values(this.opts).map(o => this.dumpOption(o)),
      args: Object.values(this.argsMap).map(a => this.dumpArgument(a)),
      subCommands: dumped.includes(this)
        ? []  // Prevent endless recursion
        : Object.values(this.subCommands).map(c => c.dump(dumped.concat(this)))
    }
  }

  /**
   * Parses the process arguments and generates args, opts, and extra objects.
   * Does not invoke command handlers and does not invoke hooks or validators.
   * @param processArgs The process arguments (typically process.argv)
   * @param opts parse() automatically strips the first two arguments from its input.
   * To prevent this, set opts.stripExecScript to false.
   */
  public parse(processArgs: string[], opts: { raw?: boolean } = {}): ParsedInput {
    // The "queue" of arguments, cloned so we don't modify the original
    const q = [...opts.raw ? processArgs : processArgs.slice(2)]

    // Parse the input
    while (q.length) {
      const next = q[0]

      if (next === this.name) {
        q.shift()
        continue
      }

      if (next in this.subCommands) {
        return this.subCommands[next].parse(q, { raw: true })
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
      } else if (!this.isEmpty(this.subCommands)) {
        throw new UnknownSubcommandException(next, this.dump())
      } else {
        this.parsed.extra.push(next)
        q.shift()
      }
    }

    this.handleUnassignedOptions()
    this.handleUnassignedArguments()

    return this.parsed
  }

  public async process(
    processArgs: string[],
    opts: { raw?: boolean } = {}): Promise<any> {
    this.checkForMissingCommandHandlers()

    const parsed = this.parse(processArgs, opts)
    const command = this.getCommand(opts.raw ? processArgs : processArgs.slice(2))

    // Run hooks
    await this.runOnProcessHooks(parsed, 'args', this.argsMap)
    await this.runOnProcessHooks(parsed, 'opts', this.opts)

    // Run validators
    await this.runValidators(parsed, 'args', this.argsMap)
    await this.runValidators(parsed, 'opts', this.opts)

    // Run handler
    if (command.handler !== undefined) {
      return command.handler(parsed.args, parsed.opts, parsed.extra)
    }
  }

  private dumpOption(o: Option): OptionDefinition {
    return {
      name: o.name,
      description: o.description,
      required: o.required,
      negatable: o.negatable,
      args: o.args ? o.args.map(a => this.dumpArgument(a)) : [],
      defaultValue: o.defaultValue
    }
  }

  private dumpArgument(a: Argument): ArgumentDefinition {
    return {
      name: a.name,
      description: a.description,
      required: a.required,
      defaultValue: a.defaultValue,
      variadic: a.variadic
    }
  }

  private checkForMissingCommandHandlers(): void {
    if (!this.handler) {
      throw new NoCommandHandlerException(this.dump())
    }

    for (const subCommand of Object.values(this.subCommands)) {
      subCommand.checkForMissingCommandHandlers()
    }
  }

  private async runOnProcessHooks(parsed: ParsedInput, type: 'args' | 'opts', definitions: { [name: string]: Option | Argument }): Promise<void> {
    for (const [name, definition] of Object.entries(definitions)) {
      if (definition.onProcess) {
        const value = parsed[type][name]

        // Let the hook call a function to assign a new value
        // ensuring that the value is validated
        const assign = async (value: any): Promise<void> => {
          await this.validate(value, parsed, definition)
          parsed[type][name] = value
        }

        await definition.onProcess(value, parsed, assign)
      }
    }
  }

  private async runValidators(parsed: ParsedInput, type: 'args' | 'opts', definitions: { [name: string]: Option | Argument }): Promise<void> {
    for (const [name, definition] of Object.entries(definitions)) {
      if (definition.validator) {
        const value = parsed[type][name]
        await this.validate(value, parsed, definition)
      }
    }
  }

  private async validate(value: any, parsed: ParsedInput, optOrArg: Option | Argument): Promise<void> {
    if (!optOrArg.validator) {
      return
    }
    const validationResult = await optOrArg.validator(value, parsed)
    if (validationResult !== true) {
      throw new ValidationError(this.getName(optOrArg), value, validationResult)
    }
  }

  private getCommand(processArgs: string[]): CliCommand {
    if (processArgs[0] == this.name) {
      processArgs = processArgs.slice(1)
    }

    if (processArgs[0] in this.subCommands) {
      return this.subCommands[processArgs[0]].getCommand(processArgs.slice(1))
    } else {
      return this
    }
  }

  private consumeOption(q: string[]): [string, OptionValue] | undefined {
    const next = q.shift()

    /* istanbul ignore if */
    if (!next) {
      // Never happens, but needs to be here for TypeScript
      return undefined
    }

    const name = this.getName(next)

    if (!(name in this.opts)) {
      if (next in this.negatableOptsMap) {
        const opt = this.negatableOptsMap[next]
        return [this.getName(opt), false]
      }
      else if (this.consumeUnknownOpts) {
        this.parsed.extra.push(next)
        return undefined
      } else {
        throw new UnknownOptionException(next, this.dump())
      }
    }

    if (name in this.parsed.opts) {
      throw new DuplicateOptionException(name, this.dump())
    }

    const opt = this.opts[name]
    let optValue: OptionValue

    if (!opt.args) {
      optValue = opt.defaultValue ?? true
    } else {
      optValue = {}
      for (const arg of opt.args) {
        const parsed = this.consumeArgument(arg, q)
        const [argName, argValue] = parsed
        optValue[argName] = argValue
      }
    }

    // Collapse the option arugment into the option itself if there's only one argument, e.g:
    // myOption = { arg: 1 } becomes myOption = 1
    if (optValue instanceof Object && Object.keys(optValue).length == 1) {
      optValue = Object.values(optValue)[0]
    }

    if (opt.onParse) {
      opt.onParse(optValue, this.parsed)
    }

    return [name, optValue]
  }

  private consumeArgument(arg: Argument | undefined, q: string[]): [string, ArgumentValue] {
    /* istanbul ignore if */
    if (!arg) {
      // Shouldn't happen, here for the linter
      throw new ExpectedButGotException('an argument', 'nothing')
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
        throw new ExpectedButGotException(`a value for "${arg.name}"`, 'nothing')
      } else {
        argValue = arg.defaultValue ?? undefined
      }
    }

    const name = this.getName(arg)

    if (arg.onParse) {
      arg.onParse(argValue, this.parsed)
    }

    return [name, argValue]
  }

  private consumeVariadicArguments(q: string[]): string[] {
    const args: string[] = []

    while (q[0] && !TokenParser.isOptionName(q[0])) {
      if (TokenParser.isVariadicTerminator(q[0])) {
        q.shift()
        break
      }

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
          throw new ExpectedButGotException(`a value for "${name}"`, 'nothing')
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
      throw new ExpectedButGotException(`a value for "${a.name}"`, 'nothing')
    }

    for (const a of this.args) {
      this.parsed.args[this.getName(a)] = a.defaultValue
    }
  }

  private checkOption(option: Option): void {
    if (option.name.length !== 2) {
      throw new InvalidNumOptionNamesException(option.name)
    }
    const [short, long] = option.name
    if (!TokenParser.isShortOptionName(short)) {
      throw new InvalidShortOptionNameException(short)
    }
    if (!TokenParser.isLongOptionName(long)) {
      throw new InvalidLongOptionNameException(long)
    }

    for (const arg of option.args ?? []) {
      this.checkArgument(arg)
    }
  }

  private checkArgument(arg: Argument): void {
    if (!this.isEmpty(this.subCommands)) {
      throw new NoArgsAndSubCommandsException(this.dump())
    }

    if (!TokenParser.isValidName(arg.name)) {
      throw new InvalidArgumentNameException(arg.name)
    }
  }

  private checkSubCommand(command: CliCommand): void {
    if (!this.isEmpty(this.args)) {
      throw new NoArgsAndSubCommandsException(this.dump())
    }

    if (command.name in this.subCommands) {
      throw new DuplicateCommandNameException(command.name, this.dump())
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
      // It's an argument (just a string)
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