# Cilly
![ci](https://github.com/cilly-cli/cilly/workflows/ci/badge.svg)
![coverage](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/Minibrams/1708995a4933a08f4838df0243926653/raw/cilly__main.json)
[![size](https://packagephobia.now.sh/badge?p=cilly)](https://packagephobia.now.sh/result?p=cilly)
[![version](http://img.shields.io/npm/v/cilly.svg?style=flat)](https://www.npmjs.org/package/cilly)

The last library you'll ever need for building intuitive, robust and flexible CLI tools with Node.js and TypeScript.

# Table of contents
- [Installation](#installation)
- [Motivation](#motivation)
- [Basic usage](#basic-usage)
- [Documentation](#documentation)
   - [Commands](#commands)
      - [parse()](#parse)
      - [process()](#process)
      - [Subcommands](#subcommands)
         - [Option inheritance](#option-inheritance)
   - [Arguments](#arguments)
      - [Variadic arguments](#variadic-arguments)
   - [Options](#options)
      - [Option arguments](#option-arguments)
      - [Negating flags](#negating-flags)
   - [Validators](#validators)
   - [Hooks](#hooks)
      - [onParse()](#onparse)
      - [onProcess()](#onprocess)
   - [Generating documentation](#generating-documentation)
   - [Custom help handlers](#custom-help-handlers)
   - [Custom version handlers](#custom-version-handlers)
   - [Exception handling](#exception-handling)
- [Contributing](#contributing)

# Installation
```
npm install cilly
```

# Motivation and features
After using several great CLI libraries such as [commander.js](https://github.com/tj/commander.js) in production systems, `cilly` aims to amend the shortcomings of popular CLI libraries in a simple, straightforward design using few, simple concepts.

The primary features that separate `cilly` from other libraries are:
1. Options and arguments are first-class citizens with their own data and logic
2. Options can be shared and inherited throughout the command/subcommand tree
3. `onParse()`, `onProcess()` and `validator()` hooks for intercepting individual options and arguments
4. No magic - all default behaviour is implemented using the public Cilly API
5. Support for automatically generated doc pages
6. Custom usage documentation
7. Fully tested ![coverage](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/Minibrams/1708995a4933a08f4838df0243926653/raw/cilly__main.json)
8. Fully typed


# Basic usage

With the file `todd.ts`:

```bash
$ todd.ts --help
```
```
Usage: todd [options]

Get your program to your users easily

Options:
  -h, --help        Display help for command
  -v, --verbose     Print verbosely
  -d, --dry-run     Run as a dry run (nothing will be changed)
  -v, --version     Display the version

Commands:
  packer [options]
  deploy [options]
```

```bash
$ todd.ts packer --help
```
```
Usage: packer [options]

Package an executable into an installer

Options:
  -h, --help                     Display help for command
  -o, --out-dir <path>           Output directory for the installer (default: "./")
  -r, --repo <url>               Target GitHub repo for deployment
  -t, --token <token>            Access token for GitHub
  -v, --verbose                  Print verbosely
  -d, --dry-run                  Run as a dry run (nothing will be changed)
  -v, --version                  Display the version

Commands:
  macos [options]
  linux [options]
  windows [options]
```

The above output is generated by this code: 
> `./todd.ts`
```typescript
#!/usr/local/bin/ts-node

import { CliCommand } from 'cilly'
import { config } from '../config'
import { validators } from './validators'
import { prompts } from './prompts'

// Other CliCommand objects
import { packer } from './packer/packer'
import { deploy } from './deploy/deploy'


export const todd = new CliCommand('todd')
  .withDescription('Get your program to your users easily')
  .withOptions(
    { name: ['-v', '--verbose'], description: 'Print verbosely', onParse: () => { Global.verbose = true } },
    { name: ['-d', '--dry-run'], description: `Run a dry run (nothing will be changed)`, onParse: { Global.dryRun = true } },
  )
  .withVersion(config.package.version)
  .withSubCommands(packer, deploy)
  .withHandler(() => {
    todd.help()
  })

await todd.process(process.argv)
```

> `./packer/packer.ts`

```typescript
import { CliCommand } from 'cilly'
import { prompts } from './prompts'
import { validators } from './validators'
import { http } from './http'

// Other CliCommand objects
import { linux } from './linux/linux'
import { macos } from './macos/macos'
import { windows } from './windows/windows'


export const packer = new CliCommand('packer', { inheritOpts: true })
  .withDescription('Package an executable into an installer')
  .withOptions(
    {
      name: ['-o', '--out-dir'], description: 'Output directory for the installer', defaultValue: './', args: [
        { name: 'path', required: true, validator: (value) => validators.pathExists(value) }
      ]
    },
    {
      name: ['-r', '--repo'], description: 'Target GitHub repo for deployment', args: [
        { name: 'url', required: true, validator: (url) => validators.isValidUrl(url) }
      ]
    },
    {
       name: ['-t', '--token'], description: 'Access token for GitHub', args: [{ name: 'token', required: true }],
       validator: (token) => validators.isValidToken(token),
       onProcess: (token, parsed, assign) => {
          // Check if the user provided a GitHub repo but not a token for accessing it
          if (token === undefined && parsed.opts.repo !== undefined) {
             token = await prompts.input('Please enter your GitHub access token: ')

             // Runs the validator and assigns the value
             assign(token)  
          }
       }
    }
  )
  .withSubCommands(macos, linux, windows)  // Specialized subcommands
  .withHandler(async (args, opts, extra) => {
    const binary = buildBinary()
    await http.post(`https://api.github.com/deploy/${opts.repo}?token=${opts.token}`, binary)
    // ... do whatever you want
  })

```

# Documentation
Before delving into the specifics of the package, a definition of the fundamental concepts is in order: **arguments** and **options**.

Arguments are simply values passed directly to a command or an option. 

Options are named flags, e.g. `--option` that can also be assigned their own arguments.

## Commands

Commands are represented by `CliCommand` class instances.
The command constructor has the following signature: 
```
CliCommand(name: string, opts?: { inheritOpts?: boolean, consumeUnknownArgs?: boolean consumeUnknownOpts?: boolean })
```

The `CliCommand` API looks as follows: 
```typescript
new CliCommand('command')
   .withVersion()         // Set the version
   .withDescription()     // Set the description
   .withHandler()         // Set the function to run when command is invoked
   .withArguments()       // Register arguments
   .withOptions()         // Register options
   .withSubCommands()     // Register subcommands
   .withHelpHandler()     // Custom handling of the --help flag
   .parse()               // Generate { args, opts, extra } from process.argv, run onParse() hooks
   .process()             // Run parse(), hooks, and call command handler
   .help()                // Call the helpHandler
   .dump()                // Dump the command description to an object (useful for documentation)
```

### parse()
The `parse()` method takes the command line arguments (`process.argv`) and parses it to produce the `{args, opts, extra}` objects passed to handlers.

The `parse()` method calls `onParse()` hooks for all arguments and options immediately as they are parsed.
It does not call `onProcess()` hooks, validators or command handlers, and thus does not require a command handler to be defined.
```typescript
const cmd = new CliCommand('build')
   .withArguments({ name: 'address' })
   .withOptions({ name: ['-g', '--garage'], negatable: true })

const { 
   args: { address?: string }, 
   opts: { garage?: boolean }, 
   extra: string[]
} = cmd.parse(process.argv)

```

#### Extra
All arguments that cannot be parsed are put in the `extra` argument to command handlers by default.
To throw an exception when an unexpected argument is received, set `new CliCommand(name, { consumeUnknownArgs: false })`.
If desired, a command can choose to to treat unknown options similarly by setting the `consumeUnknownOpts` flag: 
```typescript
const cmd = new CliCommand('build', { consumeUnknownOpts: true })

const { args, opts, extra } = cmd.parse(process.argv)
console.log(`Received the following unknown options: ${extra}`)
```
```
 $ build --an --option --that --isnt --defined

   Received the following unknown options: ['--an', '--option', '--that', '--isnt', '--defined']
```

### process()
The `process()` method (asynchronous) calls `parse()`, runs `onProcess()` argument and options hooks, validators, and invokes the appropriate command handler with the output of `parse()`. The result of `await process()` is whatever the command handler returns. 
```typescript
const cmd = new CliCommand('build')
   .withArguments({ name: 'address' })
   .withOptions({ name: ['-g', '--garage'], negatable: true })
   
   // The args, opts, extra comes from .parse()
   .withHandler((args, opts, extra) => {
      return new House(args.address, opts.garage)
   })

const house = await cmd.process(process.argv)
```

### Subcommands
Commands can have an arbitrary number of subcommands, allowing developers to decouple their command handling logic.
These are registered with the `withSubCommands()` method: 
```typescript
new CliCommand('build')
   .withSubCommands(
      new CliCommand('house')...,
      new CliCommand('apartment')...,
   )
```

A command **cannot** have both arguments and subcommands. This is because subcommands are invoked be essentially passing command names as arguments, and there would be no good way to tell the two apart. 

Subcommands are displayed in the help text: 
```
Usage: build [options]

Options: 
  ...
  
Commands: 
  house <address> [state] [options]
  apartment <address> [options]
```

#### Option inheritance
Contrary to `commander.js`, subcommands can share options and arguments in the parent command(s).
By setting the `inheritOpts` flag to true when constructing the command, the command inherits all options from the parent command:
```typescript
new CliCommand('build')
   .withOptions({ name: ['-vb', '--verbose'] })
   .withSubCommands(
      new CliCommand('house', { inheritOpts: true })
         .withOptions({ 
            name: ['-r', '--rooms'], required: true, 
            onProcess: (rooms, _, assign) => assign(Number.parseInt(rooms))
         })
   )
```

The `opts` object in the `house` command handler will contain both `verbose` and `rooms`: 
```typescript
opts: {
   verbose?: boolean,
   rooms: number
}
```

If desired, subcommands can choose to make exceptions to the options inherited.
For example, if the subcommand `install` does not want to inherit the `--dry-run` and `--silent` options from its parent, these can be excepted through `inheritOpts`: 
```typescript
new CliCommand('install', { inheritOpts: { except: ['--dry-run', '--silent'] }})
```
The `except` array will filter all options with matching long-names when inheriting, and must consist of valid long option names.

## Arguments
Arguments are provided to a command with the `withArguments()` chain method. 
The `withArguments()` method takes a list of `Argument` type options: 
```typescript
type Argument = {
  name: string,                    // The name of the argument
  required?: boolean,              // If true, throws an error if it's not provided
  variadic?: boolean,              // If true, parses a list of of argument values
  description?: string,            // Description of the argument (not shown in help, but provided in .dump())
  defaultValue?: ArgumentValue,    // The value of the argument if it's not provided
  onParse?: OnParseHook,           // Hook to run immediately when the argument is parsed from the command line
  onProcess?: OnProcessHook,       // Hook to run when all arguments and options have been parsed from the command line
  validator?: Validator            // Validation function used to validate the parsed value of the argument
}
```

Argument names must be dash-separated, alpabetic strings e.g. `my-house`, `email`, `docker-compose-file`, etc.
After parsing, arguments are accessible through their camelCased names in the `args` argument to the command handler, e.g.: 
```typescript
type MyArgsModel = {
   myHouse: string,
   email: string,
   dockerComposeFile: string
}

new CliCommand('args-documentation-example')
   .withArguments(
      { name: 'my-house' },
      { name: 'email' },
      { name: 'docker-compose-file' }
   ).withHandler((args: MyArgsModel, opts, extra) => {
      ...
   })
```
### Variadic arguments
To let an argument be parsed as a list of values, mark it as *variadic*: 
```typescript
new CliCommand('download')
   .withArguments({ name: 'websites', variadic: true })
   .withHandler((args) => `Downloading websites: ${args.websites}`)
```
```bash
 $ download https://github.com https://abrams.dk https://npmjs.com

   Downloading websites: [https://github.com, https://abrams.dk, https://npmjs.com]
```

Variadic arguments parse values from the command line until either
1. The variadic terminator `--` is parsed
2. An option name is parsed
3. The input stops

So it's perfectly possible to have two variadic arguments, they just need to be terminated: 
```typescript
new CliCommand('download')
   .withArguments(
      { name: 'websites', variadic: true },
      { name: 'files', variadic: true }
   ).withHandler((args) => {
      console.log(`Downloading these files: ${args.files}`)
      console.log(`... from these websites: ${args.websites}`)
   })
```
```bash 
 $ download https://github.com -- cilly-cli/cilly.git robots.txt

   Downloading these files: [cilly-cli/cilly.git, robots.txt]
   ... from these websites: [https://github.com]
```

## Options
Options are provided to a command with the `withOptions()` chain method. 
The `withOptions()` method takes a list of `Option` type arguments: 
```typescript
type Option = {
  name: [string, string],       // The short and long flag for the option
  required?: boolean,           // If true, throws an error if the option is not provided
  negatable?: boolean,          // Automatically registers a negating --no-* flag
  args?: Argument[],            // Parses arguments as the option value instead of a boolean flag
  defaultValue?: OptionValue,   // The default value of the option if it is not provided
  description?: string,         // Description of the option (shown in help)  
  onParse?: OnParseHook,        // Hook to run immediately when the option is parsed from the command line
  onProcess?: OnProcessHook,    // Hook to run when all arguments and options have been parsed from the command line
  validator?: Validator         // Validation function used to validate the parsed value of the option
}
```

The option's name is provided as an array of two strings; the short and long flag name. 
1. Short option names == argument names starting with `-`
2. Long option names == argument names starting with `--`

```typescript
new CliCommand('build')
   .withOptions(
      { name: ['-r', '--rooms'] },
      { name: ['-s', '--street-name'] }
   )
```

### Option arguments
Options can take arguments just like a command can. 
In the command line, options can be assigned in two ways:
1. With `=` assignment, e.g. `build house --rooms=4`
2. With spaced assignment, e.g. `build house --rooms 4`

Here's an example of an option with three arguments - in the `help` text, this would be shown as
```
Options:
  -r, --residents <owner> []...adults] [...children]
```
```typescript
new CliCommand('build')
   .withOptions(
      { name: ['-r', '--residents'], args: [
         { name: 'owner', required: true }
         { name: 'adults', variadic: true, required: false },
         { name: 'children', variadic: true, required: false }
      ]}
   ).withHandler((args, opts, extra) => {
      console.log(opts)
   })
```
```bash
 $ build --residents "John Doe" "John Doe" "Jane Doe" -- "Jill Doe" "Jack Doe"
   
   {
      residents: {
         owner: "John Doe",
         adults: ["John Doe", "Jane Doe"],
         children: ["Jill Doe", "Jack Doe"]
      }
   }
```

#### Collapsed option arguments
If an option only has a single argument, that argument is then collapsed into the option value so it's simpler to access: 
```typescript
new CliCommand('build')
   .withOptions(
      { name: ['-o', '--owner'], args: [
         { name: 'owner', required: true }
      ]}
   ).withHandler((args, opts) => {
      console.log(opts)
   })
```

```bash
 $ build --owner=anders

 {
    owner: "anders"
 }
```


### Negating flags
Sometimes, it's useful to allow users to explicitly negate an option flag.
For example, in the [hooks section](#hooks) we cover how hooks can be used to prompt users for option values if they are not provided. 

It's good UX to allow the user to explicitly negate the flag when they don't want it so they can avoid being prompted.

To register a negating flag, simply set `negatable: true`: 
```typescript
new CliCommand('batman')
   .withOptions(
      { 
         name: ['-p', '--parents'], negatable: true, description: 'Whether batman has parents or not',
         
         // Provide a hook to ask the user if they don't explicitly pass a --parents or --no-parents flag
         onProcess: async (hasParents, _, assign) => {
            if (hasParents === undefined) {
               hasParents = await prompts.askUserIfTheyHaveParents()
               assign(hasParents)
            }
         }
      }
   )
```

With this, users can pass `--no-parents` in the command line, which will set `opts.parents` to `false`. 
This is also shown in the `help` text:
```
Usage: batman [options]

Options:
  -p, --parents (--no-parents)     Name of (living) parents
```


## Validators
Options and arguments can be assigned validators that are called on `.process()`. 
A validator has the following signature: 
```typescript
type Validator = (value: any, parsed: { args, opts, extra }) => string | boolean | Promise<string | boolean>
```

1. The `value` argument is the value assigned to the option or argument. 
2. The `parsed` argument is the result of `.parsed()`; the result of parsing the command line arguments.

If a validator returns `true`, the value is interpreted as valid. Otherwise, if the validator returns `false`, a `ValidationError` is thrown with a default error message.
- If the validator returns a string, that string is used as the error message.

```typescript
new CliCommand('build')
   .withArguments({ name: 'address', validator: (value, parsed) => {
      if (!validators.isValidAddress(value)) {
         return `The address ${value} is not a valid address.`
      }
      
      return true
   }})
```

## Hooks
It can be useful to intercept an option or argument before it's passed to the command handler.
To do this, we can use `onParse()` and `onProcess()` hooks on both options and arguments. 

### onParse()
When registered on an option or argument, an `onParse()` hook is called immediately when that argument or option is parsed from the command line. 
This is useful for implementing interrupting flags such as `--help`, `--version`, and so on. 

An `OnParseHook` has the following signature: 
```typescript
type OnParseHook = (value: any, parsed: { args, opts, extra }) => void
```

1. The `value` argument is the value assigned to the option or argument.
2. The `parsed` argument is what the `.parse()` method has parsed so far. Note that this object may not be complete when the hook is invoked.

```typescript
new CliCommand('build')
   .withOptions({ name: ['-v', '--version'], onParse: (value, parsed) => {
      console.log(version)
      process.exit()
   }})
```

### onProcess()
Contrary to `onParse()` hooks, `onProcess()` hooks are run after `parse()` has finished. 

Hooks also allow you to change the value of an option or argument at processing time, before the command handler is invoked.
This can be very useful for designing "user-proof" CLIs that prompt the users for the information they need in a nice looking and robust manner. 
An `OnProcessHook` has the following signature: 
```typescript
type OnProcessHook = (value: any, parsed: { args, opts, extra }, assign: (value: any) => Promise<void>) => void | Promise<void>
```
1. The `value` argument is the value assigned to the option or argument
2. The `parsed` argument is the result of `parse()`
3. The `assign` argument is a function that, when called with a new value:
   1. Runs the value through the option/argument validator (if one exists)
   2. Assigns the value to the option/argument
   
```typescript
new CliCommand('build')
   .withArguments(
   { 
      name: 'address', 
      validator: (address) => {
         if (!validators.isValidAddress(value)) {
            return `The address ${value} is not a valid address.`
         }
         
         return true
      },

      // Provide a hook to ask for the address if it is not provided explicitly
      onProcess: async (value, parsed, assign) => {
      if (value === undefined) {
         const address = await prompts.input('Please enter your address: ')
         await assign(address)  // Validate and assign
      }
   }})
```

#### Call order of onProcess() hooks
The `onProcess()` hooks are called strictly in the order they are assigned to a command, regardless of whether they are assigned on arguments or options.
This is useful for handling inter-dependencies between `onProcess()` calls. For example: 

```typescript
await new CliCommand('call-order')
   .withOptions({ name: ['-f', '--first'], onProcess: (value) => { console.log(`--first with value ${value}`) } })
   .withArguments({ name: 'second', onProcess: (value) => { console.log(`second with value: ${value}`) } })
   .withOptions({ name: ['-t', '--third'], onProcess: (value) => { console.log(`--third with value ${value}`) } })
   .withHandler(() => { })
```

```bash
 $ call-order "This should be second" --first

   --first with value true
   second with value This should be second
   --third with value undefined
```

## Generating documentation
The `CliCommand.dump()` method dumps the entire command (and its subcommands) to an easily readable object of type `CommandDefinition`. This is useful for generating documentation.

A `CommandDefinition` has the following signature: 
```typescript
export type CommandDefinition = {
  name: string,
  version: string,
  description?: string,
  opts: OptionDefinition[],
  args: ArgumentDefinition[],
  subCommands: CommandDefinition[]
}

type OptionDefinition = {
  name: [string, string],
  args: ArgumentDefinition[],
  description?: string,
  required?: boolean,
  negatable?: boolean,
  defaultValue?: any
}

type ArgumentDefinition = {
  name: string,
  description?: string,
  required?: boolean,
  defaultValue?: any,
  variadic?: boolean
}
```

When printing the `help` text, this is done completely from the `CommandDefinition` objects. 
While out of scope for this specific package, one could dream of a package that could take a `CommandDefinition` object and generate a nice looking documentation page :eyes:

Here's an example of a command dump:

```typescript
const cmd = new CliCommand('build')
   .withDescription('Build a home')
   .withArguments({ name: 'address', required: true })
   .withOptions(
      { name: ['-r', '--residents'], required: false, args: [ {name: 'residents', variadic: true} ] },
      { name: ['-d', '--doors'], defaultValue: 1 }
   ).withHandler(() => {
      console.log(cmd.dump())
   })
   
```

```bash
 $ build

   {
   "name": "build",
   "description": "Build a home",
   "opts": [
      {
         "name": [
         "-h",
         "--help"
         ],
         "description": "Display help for command",
         "args": []
      },
      {
         "name": [
         "-r",
         "--residents"
         ],
         "required": false,
         "args": [
         {
            "name": "residents",
            "variadic": true
         }
         ]
      },
      {
         "name": [
         "-d",
         "--doors"
         ],
         "args": [],
         "defaultValue": 1
      }
   ],
   "args": [
      {
         "name": "address",
         "required": true
      }
   ],
   "subCommands": []
   }
```
## Custom help handlers
You can use the `withHelpHandler()` method to override the default `help` text. 
```typescript
new CliCommand('build')
   .withHelpHandler((command: CommandDefinition) => {
      console.log(`This is the documentation for ${command.name} (${command.definition})`)
      ...
      process.exit()
   })
```

## Custom version handlers
You can set the version of a command with `.withVersion('1.2.3')`. This will set the version and add a `--version` option that prints the version. 
If you want to override how the version is displayed, you can do so by passing a handler: 
```typescript
new CliCommand('build')
   .withVersion('1.2.3', (command: CommandDefinition) => {
      console.log(`The version of this command is ${command.version}`)
      process.exit()
   })
```

## Exception handling
All exceptions thrown by `cilly` extend the `CillyException` class. If you want to catch each exception and handle them individually, here's the full list of exceptions thrown by `cilly`: 
```typescript
class CillyException extends Error
class UnknownOptionException extends CillyException 
class UnknownSubcommandException extends CillyException 
class InvalidNumOptionNamesException extends CillyException 
class InvalidShortOptionNameException extends CillyException 
class InvalidLongOptionNameException extends CillyException
class InvalidCommandNameException extends CillyException
class InvalidArgumentNameException extends CillyException
class ExpectedButGotException extends CillyException
class NoCommandHandlerException extends CillyException
class DuplicateArgumentException extends CillyException
class DuplicateOptionException extends CillyException
class DuplicateCommandNameException extends CillyException
class NoArgsAndSubCommandsException extends CillyException
class ValidationError extends CillyException
```

# Contributing
Contributions are greatly appreciated and lovingly welcomed! 
In your pull request, make sure to link the issue you're addressing. If no issue exists, make one first so we have a chance to discuss it first. 

Always write tests for the functionality you add or change. See the `cli-command.test.ts` and `token-parser.test.ts` files for examples. 
As always, use the linter provided in the project (`.eslintrc.json`) and stick to the coding style of the project. 

## Setup
1. Install everything with `npm i`
2. Run tests with `npm test`

## Debugging
When debugging, take not that both `parse()` and `process()` strip the two first arguments off of `process.argv` when invoked.
When you want to see how an input would be parsed, set the `raw` option in `parse()` and `process()`: 
```typescript
const { args, opts, extra } = new CliCommand('build').parse(['build', '--unknown-option'], { raw: true })
```
When `raw` is `true`, the input array is stripped for the two first arguments. 
The `.vscode/launch.json` file contains a configuration for debugging the test files `Mocha Tests`, allowing you to put breakpoints and step through your tests.
