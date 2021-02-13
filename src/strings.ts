import { CommandDefinition } from './cli-command'
import { CillyException } from './exceptions/cilly-exception'

export class UnknownOptionException extends CillyException {
  constructor(public option: string, public command: CommandDefinition) {
    super(`Unkown option name: ${option}`)
  }
}
export class UnknownSubcommandException extends CillyException {
  constructor(public subCommand: string, command: CommandDefinition) {
    super(`Command ${command.name} has no subcommand "${subCommand}"`)
  }
}

export class InvalidNumOptionNamesException extends CillyException {
  constructor(public names: string[]) {
    super(`Options must be provided exactly two names (short and long), but got ${JSON.stringify(names)}`)
  }
}

export class InvalidShortOptionNameException extends CillyException {
  constructor(public name: string) {
    super(`Invalid short option name: ${name}`)
  }
}

export class InvalidLongOptionNameException extends CillyException {
  constructor(public name: string) {
    super(`Invalid long option name: ${name}`)
  }
}

export class InvalidCommandNameException extends CillyException {
  constructor(public name: string) {
    super(`Invalid command name: ${name}`)
  }
}

export class InvalidArgumentNameException extends CillyException {
  constructor(public name: string) {
    super(`Invalid argument name: ${name}`)
  }
}

export class UnexpectedValueException extends CillyException {
  constructor(public expected: string, public got: string) {
    super(`Expected ${expected} but got ${got}`)
  }
}

export class NoCommandHandlerException extends CillyException {
  constructor(public command: CommandDefinition) {
    super(`Cannot process arguments; no handler is defined for command "${command.name}".`)
  }
}

export class DuplicateArgumentException extends CillyException {
  constructor(public arg: string, public command: CommandDefinition) {
    super(`The argument "${arg}" is already a registered argument name.`)
  }
}

export class DuplicateOptionException extends CillyException {
  constructor(public option: string, public command: CommandDefinition) {
    super(`The option "${option}" is already a registered option name.`)
  }
}

export class DuplicateCommandNameException extends CillyException {
  constructor(public subCommand: string, command: CommandDefinition) {
    super(`The command name "${subCommand}" is already a registered subcommand for ${command.name}`)
  }
}

export class NoArgsAndSubCommandsException extends CillyException {
  constructor(public command: CommandDefinition) {
    super(`Command "${command.name}": a command can only register arguments or subcommands, not both.`)
  }
}

export class ValidationError extends CillyException {
  constructor(public arg: string, public value: any, public error: string | boolean) {
    super(`Invalid value ${value} for ${arg}`)
    this.message += typeof error === 'string' ? `: ${error}` : '.'
  }
}
