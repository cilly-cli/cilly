import { Parser } from './parser/parser'
import { STRINGS } from './strings'

// TODO: Change "any" to a (nested) dictionary of OptionValues
export type OptionValue = boolean | string | string[] | any | undefined
export type ValidationResult = boolean | string

export type OptionValidator = (value: OptionValue, command?: {
  args: { [key: string]: OptionValue },
  opts: { [key: string]: OptionValue },
  extra: any[]
}) => ValidationResult | Promise<ValidationResult>

export type OptionHook = <T = string>(value: OptionValue, command?: {
  validator?: OptionValidator,
  args: { [key: string]: OptionValue },
  opts: { [key: string]: OptionValue },
  extra: any[]
}) => T | Promise<T>

export interface CliCommandArgument {
  name: string
  required?: boolean
  variadic?: boolean
  value?: OptionValue,
  defaultValue?: OptionValue
}

export interface CliCommandOption {
  name: [string, string]
  args?: CliCommandArgument[]
  desc: string
  defaultValue?: OptionValue
  value?: OptionValue
  validator?: OptionValidator
  hook?: OptionHook
}

export class CliCommand {
  public name: string
  public description: string
  public inheritOpts?: boolean
  public handler?: (process: { args?: any, opts?: any, extra?: any[] }) => (void | Promise<void>)
  public options: CliCommandOption[] = []
  public arguments: CliCommandArgument[] = []
  public extra: any[] = []
  public subCommands: { [name: string]: CliCommand } = {}

  constructor(name: string, opts: { inheritOpts?: boolean } = { inheritOpts: true }) {
    this.name = name
    this.inheritOpts = opts.inheritOpts
  }

  public withDescription(description: string): CliCommand {
    this.description = description
    return this
  }

  public withArguments(args: CliCommandArgument[]): CliCommand {
    if (Object.keys(this.subCommands).length && args.length) {
      throw new Error(STRINGS.NO_ARGS_AND_SUBCOMMANDS(this.name))
    }

    for (const arg of args) {
      this.checkArgument(arg)
    }

    this.arguments = args
    return this
  }

  public withOptions(options: CliCommandOption[]): CliCommand {
    for (const option of options) {
      this.checkOption(option)
    }

    this.options = options
    return this
  }

  public withHandler(handler: (process: { args?: any, opts?: any, extra?: any[] }) => (void | Promise<void>)): CliCommand {
    this.handler = handler
    return this
  }

  public withSubCommands(commands: CliCommand[]): CliCommand {
    if (this.arguments.length && commands.length) {
      throw new Error(STRINGS.NO_ARGS_AND_SUBCOMMANDS(this.name))
    }
    for (const command of commands) {
      if (command.inheritOpts) {
        command.options = [...command.options, ...this.options]
      }
      this.subCommands[command.name] = command
    }

    return this
  }

  public getSubCommand(name: string): CliCommand | undefined {
    return this.subCommands[name]
  }

  public parse(q: string[]): { args: any, opts: any, extra: any[] } {
    const args: CliCommandArgument[] = []
    const opts: CliCommandOption[] = []
    const extra: (string | undefined)[] = []

    while (q.length) {
      const next = q[0]

      if (Parser.isOptionName(next)) {
        const option = this.consumeOption(q)
        if (!option) continue
        opts.push(option)

      } else if (this.arguments.length) {
        const arg = this.consumeArgument(this.arguments.shift(), q)
        if (!arg) continue
        args.push(arg)
      } else {
        extra.push(q.shift())
      }
    }

    for (const a of this.arguments.filter(a => a.required)) {
      throw new Error(STRINGS.EXPECTED_BUT_GOT(`a value for "${a.name}"`, 'nothing'))
    }

    return {
      args: this.formatArguments(args),
      opts: this.formatOptions(opts),
      extra
    }
  }

  private formatOptions(opts: CliCommandOption[]): { [key: string]: OptionValue } {
    const optValues: { [key: string]: OptionValue } = {}

    for (const opt of opts) {
      if (opt.args === undefined) {
        optValues[this.getKey(opt)] = opt.value
      } else {
        optValues[this.getKey(opt)] = this.formatArguments(opt.args)
      }
    }

    return optValues
  }

  /**
   * If there is only one argument, returns the value of the argument.
   * Otherwise, returns an object { argument-name: value }
   * @param args Process arguments or arguments assigned to an option
   */
  private formatArguments(args: CliCommandArgument[]): { [key: string]: OptionValue } | OptionValue {
    const argValues: { [key: string]: OptionValue } = {}

    if (args.length === 1) {
      return args[0].value
    }

    for (const arg of args) {
      argValues[this.getKey(arg)] = arg.value
    }

    return argValues
  }

  public async process(processArgs: string[]): Promise<void> {
    const q = this.splitOptionAssignments(processArgs.slice(2))
    const command = this.parseCommandHandler(q)

    if (!command.handler) {
      throw new Error(STRINGS.NO_COMMAND_HANDLER(this.name))
    }

    return command.handler(command.parse(q))
  }

  /**
   * Get the appropriate command handler for handling this input.
   * For example, "mycli build project --name=myProject" would return
   * the command handler for "project".
   * @param processArgs The arguments (sans the first 2) passed to the program.
   */
  private parseCommandHandler(processArgs: string[]): CliCommand {
    let commandHandler: CliCommand | undefined = undefined
    let commandName: string | undefined = undefined

    if (!(processArgs[0] in this.subCommands)) {
      return this
    }

    do {
      commandName = processArgs.shift()
      if (!commandName) break

      commandHandler = (commandHandler ?? this).getSubCommand(commandName) ?? this
    } while (commandName in commandHandler.subCommands)

    return commandHandler ?? this
  }

  private getKey(o: CliCommandOption | CliCommandArgument): string {
    const tokens = (typeof o.name === 'string' ? o.name : o.name[1])
      .replace('--', '')
      .split('-')

    if (typeof o.name === 'string') {
      return Parser.toCamelCase(tokens)
    } else {
      return Parser.toCamelCase(tokens)
    }
  }

  private consumeOption(q: string[]): CliCommandOption | undefined {
    const next = q.shift()

    if (!next) {
      return undefined
    }

    const opt = this.options.find(o => o.name.some(n => n === next))
    if (opt == undefined) {
      throw new Error(STRINGS.UNKNOWN_OPTION_NAME(next))
    }

    this.options = this.options.filter(o => o !== opt)

    if (!opt.args) {
      opt.value = opt.defaultValue ?? true
    } else {
      for (const arg of opt.args) {
        opt.value = { ...opt.value, ...this.consumeArgument(arg, q) }
      }
    }

    return opt
  }

  private consumeArgument(arg: CliCommandArgument | undefined, q: string[]): CliCommandArgument | undefined {
    if (!arg) {
      return undefined
    }

    if (q[0] && Parser.isOptionName(q[0])) {
      if (!arg.required) {
        arg.value = true
      } else if (arg.variadic) {
        arg.value = []
      } else {
        throw new Error(STRINGS.EXPECTED_BUT_GOT(`a value for "${arg.name}"`, `an option (${q[0]})`))
      }
    } else {
      if (arg.required) {
        if (!q[0]) {
          throw new Error(STRINGS.EXPECTED_BUT_GOT(`a value for "${arg.name}"`, 'nothing'))
        }
        if (arg.variadic) {
          arg.value = this.consumeVariadicArguments(q)
        } else {
          arg.value = q.shift()
        }
      } else {
        if (!q[0]) {
          arg.value = arg.defaultValue
        } else if (arg.variadic) {
          arg.value = this.consumeVariadicArguments(q)
        } else {
          arg.value = q.shift()
        }
      }
    }

    return arg
  }

  private consumeVariadicArguments(q: string[]): string[] {
    const args: string[] = []

    while (q[0] && !Parser.isOptionName(q[0])) {
      args.push(q[0])
      q.shift()
    }

    return args
  }

  private splitOptionAssignments(processArgs: string[]): string[] {
    const splitArgs: string[] = []
    for (const arg of processArgs) {
      if (this.isOptionAssignment(arg)) {
        const [option, value] = arg.split('=')
        splitArgs.push(option)
        splitArgs.push(value)
      } else {
        splitArgs.push(arg)
      }
    }

    return splitArgs
  }

  private isOptionAssignment(str: string): boolean {
    if (!/=/.test(str)) return false
    const [option,] = str.split('=')
    if (!Parser.isOptionName(option)) return false
    return true
  }

  private checkOption(option: CliCommandOption): void {
    if (option.name.length !== 2) {
      throw new Error(STRINGS.INVALID_N_OPTION_NAMES(option.name))
    }
    const [short, long] = option.name
    if (!Parser.isShortOptionName(short)) {
      throw new Error(STRINGS.INVALID_SHORT_OPTION_NAME(short))
    }
    if (!Parser.isLongOptionName(long)) {
      throw new Error(STRINGS.INVALID_LONG_OPTION_NAME(long))
    }

    for (const arg of option.args ?? []) {
      this.checkArgument(arg)
    }
  }

  private checkArgument(arg: CliCommandArgument): void {
    if (!Parser.isValidName(arg.name)) {
      throw new Error(STRINGS.INVALID_ARGUMENT_NAME(arg.name))
    }
  }
}
