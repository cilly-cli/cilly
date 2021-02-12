
export const STRINGS = {
  UNKNOWN_OPTION_NAME: (name: string): string => `Unkown option name: ${name}`,
  INVALID_N_OPTION_NAMES: (names: string[]): string => `Options must be provided exactly two names (short and long), but got ${JSON.stringify(names)}`,
  INVALID_SHORT_OPTION_NAME: (name: string): string => `Invalid short option name: ${name}`,
  INVALID_LONG_OPTION_NAME: (name: string): string => `Invalid long option name: ${name}`,
  INVALID_COMMAND_NAME: (name: string): string => `Invalid command name: ${name}`,
  INVALID_ARGUMENT_NAME: (name: string): string => `Invalid argument name: ${name}`,
  EXPECTED_BUT_GOT: (a: string, b: string): string => `Expected ${a} but got ${b}`,
  NO_COMMAND_HANDLER: (command: string): string => `Cannot process arguments; no handler is defined for command "${command}".`,
  DUPLICATE_ARG_NAME: (name: string): string => `The argument "${name}" is already a registered argument name.`,
  DUPLICATE_OPT_NAME: (name: string): string => `The option "${name}" is already a registered option name.`,
  DUPLICATE_COMMAND_NAME: (subCommandName: string, parentCommandName: string): string => `The command name "${subCommandName}" is already a registered subcommand for. ${parentCommandName}`,
  NO_ARGS_AND_SUBCOMMANDS: (command: string): string => `Command "${command}": a command can only register arguments or subcommands, not both.`,
  VALIDATION_ERROR: (arg: string, value: any, error: string | boolean): string => {
    let msg = `Invalid value ${value} for ${arg}`
    msg += typeof error === 'string' ? `: ${error}` : '.'
    return msg
  }
}