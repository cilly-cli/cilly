import { OptionValue } from './cli-command'

export const STRINGS = {
  UNKNOWN_OPTION_NAME: (name: string): string => `Unkown option name: ${name}`,
  INVALID_N_OPTION_NAMES: (names: string[]): string => `Options must be provided exactly two names (short and long), but got ${JSON.stringify(names)}`,
  INVALID_SHORT_OPTION_NAME: (name: string): string => `Invalid short option name: ${name}`,
  INVALID_LONG_OPTION_NAME: (name: string): string => `Invalid long option name: ${name}`,
  INVALID_ARGUMENT_NAME: (name: string): string => `Invalid argument name: ${name}`,
  INVALID_ARGUMENT_TYPE: (type: string, name: string): string => `The type of an argument must be required|optional|variadic, but was ${type} (${name})`,
  EXPECTED_BUT_GOT: (a: string, b: string): string => `Expected ${a} but got ${b}`,
  EMPTY_REQUIRED_VARIADIC_VALUES: (name: string): string => '',
  NO_COMMAND_HANDLER: (command: string): string => `Cannot process arguments; no handler is defined for command "${command}".`,
  NO_ARGS_AND_SUBCOMMANDS: (command: string): string => `Command "${command}": a command can only register arguments or subcommands, not both.`,
  ARGUMENT_VALIDATION_ERROR: (arg: string, value: OptionValue, error: string | boolean): string => {
    let msg = `Invalid value ${value} for argument ${arg}`
    msg += typeof error === 'string' ? `: ${error}` : '.'
    return msg
  },
  OPTION_VALIDATION_ERROR: (opt: string, value: OptionValue, error: string | boolean): string => {
    let msg = `Invalid value ${value} for option ${opt}`
    msg += typeof error === 'string' ? `: ${error}` : '.'
    return msg
  }
}