import { showHelp } from './presentation'
import { DuplicateArgumentException, DuplicateCommandNameException, DuplicateOptionException, InvalidArgumentNameException, InvalidCommandNameException, InvalidLongOptionNameException, InvalidNumOptionNamesException, InvalidShortOptionNameException, NoArgsAndSubCommandsException, NoCommandHandlerException, ExpectedButGotException, UnknownOptionException, UnknownSubcommandException, ValidationError, UnexpectedArgumentException } from './exceptions'
import { getNegatedFlag, TokenParser } from './tokens/token-parser'

export type ArgumentValue = any
export type OptionValue = ArgumentValue | { [name: string]: ArgumentValue }
export type ParsedArguments = { [name: string]: ArgumentValue }
export type ParsedOptions = { [name: string]: OptionValue }
export type Validator = (value: ArgumentValue, input: ParsedInput) => Promise<string | boolean> | string | boolean
export type OnParseHook = (value: ArgumentValue, input: ParsedInput) => void
export type OnProcessHook = (value: ArgumentValue, input: ParsedInput, assign: (value: any) => Promise<void>) => Promise<void> | void
export type CommandHandler = (args: ParsedArguments, opts: ParsedOptions, extra?: string[]) => Promise<any> | any

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
  inheritOpts?: boolean | { except: string[] }
  except?: string[]
  consumeUnknownArgs?: boolean
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
  version?: string,
  description?: string,
  opts: OptionDefinition[],
  args: ArgumentDefinition[],
  subCommands: CommandDefinition[],
  extra?: any  // Arbitrary data to append to a dumped command (e.g. documentation)
}
export class CliCommand {

  name: string
  version: string
  description: string

  private handler?: CommandHandler
  private handlerContext?: any
  private helpHandler: (command: CommandDefinition) => void
  private inheritOpts?: boolean | { except: string[] }
  private consumeUnknownArgs?: boolean
  private consumeUnknownOpts?: boolean
  private args: Argument[] = []  // Needs to be an array because we have to pick arguments in order
  private opts: { [name: string]: Option } = {}
  private subCommands: { [name: string]: CliCommand } = {}
  private shortNameMap: { [shortName: string]: string } = {}
  private argsMap: { [name: string]: Argument } = {}  // So we can match parsed args to their definitions
  private negatableOptsMap: { [name: string]: Option } = {}  // Maps --no-* flags to negatable options

  private extra: any = undefined  // Arbitrary data (e.g. documentation) to append to a dumped command

  // Maintain option/argument assignment order to call onProcess() hooks in the order they were defined
  private onProcessQueue: (Option | Argument)[] = []

  private parsed: {
    args: ParsedArguments
    opts: ParsedOptions
    extra: string[]
  } = { args: {}, opts: {}, extra: [] }

  constructor(name: string, opts: CliCommandOptions = {
    inheritOpts: false,
    consumeUnknownArgs: true,
    consumeUnknownOpts: false,
  }) {
    if (!TokenParser.isValidName(name)) {
      throw new InvalidCommandNameException(name)
    }

    this.checkInheritOpts(opts.inheritOpts)

    this.name = name
    this.inheritOpts = opts.inheritOpts
    this.consumeUnknownArgs = opts.consumeUnknownArgs
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

      const argName = this.getName(arg)

      this.args.push(arg)
      this.argsMap[argName] = arg
      this.onProcessQueue.push(arg)
    }

    return this
  }

  public withOptions(...options: Option[]): CliCommand {
    for (const option of options) {

      this.checkOption(option)
      const name = this.getName(option)
      const short = this.getShortName(option)

      if (option.negatable) {
        const negatedFlag = getNegatedFlag(option.name[1])
        this.negatableOptsMap[negatedFlag] = option
      }

      this.opts[name] = option
      this.shortNameMap[short] = name
      this.onProcessQueue.push(option)

      for (const [, subCommand] of Object.entries(this.subCommands)) {
        if (subCommand.inheritOpts) {
          subCommand.inheritOptions(...Object.values(this.opts))
        }
      }
    }

    return this
  }

  public inheritOptions(...options: Option[]): void {
    const optionsToInherit: Option[] = []

    for (const option of options) {
      if (this.shouldInheritOption(option)) {
        optionsToInherit.push(option)
      }
    }

    this.withOptions(...optionsToInherit)
  }

  private shouldInheritOption(option: Option): boolean {
    const [, long] = option.name

    if (long === '--help') return false  // Do not inherit help flags as these are set in the constructor
    if (typeof this.inheritOpts !== 'object') return true  // Don't filter inherited options further if no except-list is defined

    return !this.inheritOpts.except.includes(long)
  }

  public withSubCommands(...commands: CliCommand[]): CliCommand {
    for (const command of commands) {
      this.checkSubCommand(command)
      if (command.inheritOpts) {
        command.inheritOptions(...Object.values(this.opts))
      }
      this.subCommands[command.name] = command
    }

    return this
  }

  /**
   * Registers the handler that will be called when command.process() finishes.
   * The arguments provided to the handler will be the result of command.parse().
   * By default, the calling context of the handler is the CliCommand object.
   * If needed, a calling context can be provided which will be bound to the handler
   * before invoking it.
   * @param handler The handler to invoke when .process() finishes
   * @param context (Optional) the calling context to bind to the handler before invoking
  */
  public withHandler(handler: CommandHandler, context?: any): CliCommand {
    this.handler = handler

    if (context) {
      this.handlerContext = context
    }

    return this
  }

  public help(): void {
    this.helpHandler(this.dump())
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

  public withExtra(extra: any): CliCommand {
    this.extra = extra
    return this
  }

  public dump(dumped: CliCommand[] = []): CommandDefinition {
    return {
      name: this.name,
      version: this.version,
      description: this.description,
      opts: Object.values(this.opts).map(o => this.dumpOption(o)),
      args: Object.values(this.argsMap).map(a => this.dumpArgument(a)),
      extra: this.extra,
      subCommands: dumped.includes(this)
        ? []  // Prevent endless recursion
        : Object.values(this.subCommands).map(c => c.dump(dumped.concat(this)))
    }
  }

  /**
   * Parses the process arguments and generates args, opts, and extra objects.
   * Invokes onParse() hooks on all arguments and options. Does not invoke
   * onProcess() hooks, validators, or command handlers.
   * @param processArgs The process arguments (typically process.argv)
   * @param opts parse() automatically strips the first two arguments from its input.
   * To prevent this, set opts.stripExecScript to false.
   */
  public parse(processArgs: string[], opts: { raw?: boolean } = {}): ParsedInput {
    // The "queue" of arguments, cloned so we don't modify the original
    const q = this.splitOptionAssignments([...opts.raw ? processArgs : processArgs.slice(2)])

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
        const [name, value] = parsed
        this.parsed.args[name] = value
      } else if (!this.isEmpty(this.subCommands)) {
        throw new UnknownSubcommandException(next, this.dump())
      } else {
        if (this.consumeUnknownArgs) {
          this.parsed.extra.push(next)
        } else {
          throw new UnexpectedArgumentException(next, this.dump())
        }
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
    await command.runOnProcessHooks(command.onProcessQueue, parsed)

    // Run validators
    await command.runValidators(parsed, 'args', command.argsMap)
    await command.runValidators(parsed, 'opts', command.opts)

    // Run handler
    if (command.handler !== undefined) {
      if (command.handlerContext !== undefined) {
        return command.handler.bind(command.handlerContext)(parsed.args, parsed.opts, parsed.extra)
      }
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

  private async runOnProcessHooks(definitions: (Option | Argument)[], parsed: ParsedInput): Promise<void> {
    for (const definition of definitions) {

      const name = this.getName(definition)
      const type = typeof definition.name === 'string' ? 'args' : 'opts'  // If the name is a string, it's an arg (opt names are [short string, long string] arrays)
      const value = parsed[type][name]

      const assign = async (value: any): Promise<void> => {
        await this.validate(value, parsed, definition)
        parsed[type][name] = value
      }

      if (definition.onProcess) {
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
      // It's a boolean option flag, set it high
      optValue = true
    } else {
      // It's an option with arguments, parse each one
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
        argValue = this.consumeSingleArgument(q)
      }
    }

    if (argValue === undefined) {
      if (arg.variadic) {
        argValue = []
      } else if (arg.required) {
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

  private consumeSingleArgument(q: string[]): string | undefined {
    if (q[0] && TokenParser.isOptionName(q[0])) {
      return undefined
    }

    return q.shift()
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
      this.checkArgument(arg, { isOptionArg: true })
    }
  }

  private checkArgument(arg: Argument, opts?: { isOptionArg: boolean }): void {
    if (!opts?.isOptionArg && !this.isEmpty(this.subCommands)) {
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

  /**
   * Splits all --option=value strings into ['--option', 'value'] so they
   * can be parsed consistently
   * @param processArgs process.argv
   */
  private splitOptionAssignments(processArgs: string[]): string[] {
    const splitArgs: string[] = []
    for (const arg of processArgs) {
      if (TokenParser.isOptionAssignment(arg)) {
        const [option, value] = arg.split('=')
        splitArgs.push(option)
        splitArgs.push(value)
      } else {
        splitArgs.push(arg)
      }
    }

    return splitArgs
  }

  private checkInheritOpts(inheritOpts?: boolean | { except: string[] }): void {
    if (typeof inheritOpts !== 'object') return

    for (const exceptedOptionName of inheritOpts.except) {
      if (!TokenParser.isLongOptionName(exceptedOptionName)) {
        throw new InvalidLongOptionNameException(exceptedOptionName)
      }
    }
  }
}