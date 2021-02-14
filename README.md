# Cilly
![ci](https://github.com/cilly-cli/cilly/workflows/ci/badge.svg)
![coverage](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/Minibrams/1708995a4933a08f4838df0243926653/raw/cilly__main.json)
[![size](https://packagephobia.now.sh/badge?p=cilly)](https://packagephobia.now.sh/result?p=cilly)
[![version](http://img.shields.io/npm/v/cilly.svg?style=flat)](https://www.npmjs.org/package/cilly)

The last library you'll ever need for building intuitive, robust and flexible CLI tools with Node.js and TypeScript.

# Table of contents
- [Installation](#installation)
- [Basic usage](#basic-usage)
- [Documentation](#documentation)
   - [Arguments](#arguments)
   - [Options](#options)
   - [Commands](#commands)
      - [Subcommands](#subcommands)
      - [Option inheritance](#option-inheritance)
   - [Validators](#validators)
   - [Hooks](#hooks)
      - [onParse()](#onparse)
      - [onProcess()](#onprocess)
   - [Generating documentation](#generating-documentation)
   - [Custom help handlers](#custom-help-handlers)
   - [Custom exception handling](#custom-exception-handling)

# Installation
```
npm install cilly
```

# Basic usage
With a file called `build.ts`: 
```typescript
#!/usr/local/bin/ts-node

import { CliCommand } from 'cilly'

function buildApartment(args, opts, extra) { ... }
function buildHouse(args, opts, extra) { 
   return `Built a house with ${opts.numRooms} rooms for ${opts.residents.length} people at ${args.address}, ${args.state}!` 
}

// Main command, the CLI entrypoint
const cmd = new CliCommand('build')
   .withHandler(() => { cmd.help() })
   .withDescription('Builds houses or apartments')
   .withOptions({ 
      name: ['-r', '--num-rooms'], 
      defaultValue: 1, 
      description: 'The number of rooms',
      args: [{ name: 'n', required: true }]
   })
   .withSubCommands(
   
      // Subcommand for building houses
      new CliCommand('house', { inheritOpts: true })
         .withHandler(buildHouse)
         .withDescription('Builds a house')
         .withArguments(
            { name: 'address', required: true },
            { name: 'state', required: false }
         )
         .withOptions(
            { 
              name: ['-re', '--residents'], 
              required: true, 
              description: 'The people living in the house ',
              args: [{ name: 'residents', variadic: true }]
            }
         ),
         
      // Subcommand for building apartments
      new CliCommand('apartment', { inheritOpts: true })
         .withHandler(buildApartment)
         .withDescription('Builds an apartment')
         .withArguments({ name: 'address', required: true })
         .withOptions(
            { name: ['-f', '--floor'], required: true, description: 'The floor of the apartment' },
            { name: ['-re', '--residents'], required: true, args: [{ name: 'residents', variadic: true }]},
         )
   )

const result = await cmd.process(process.argv)
// Input: build house "Code St. 12" "CA" -r=4 --residents "Anders Brams"
// Result: "Built a house with 4 rooms for 1 people at Code St. 12, CA!"
```

Running `build.ts --help` gives: 
```
Usage: build [options]

Builds houses or apartments

Options:
  -h, --help           Display help for command
  -r, --n-rooms [n]    The number of rooms (default: 1)

Commands:
  house <address> [state] [options]
  apartment <address> [options]
```

Running `build.ts house --help`: 
```
Usage: house <address> [state] [options]

Builds a house

Options:
  -h, --help                           Display help for command
  -r, --n-rooms <n>                    The number of rooms (default: 1)
  -re, --residents [...residents]      The people living in the house (required)
```

Running `build.ts house "Code St. 12, CA" -r 4 --residents "Anders Brams" "Joe Schmoe" "Jane Dane"` invokes `buildHouse()` with the arguments: 
```typescript
args: {
   address: 'Code St. 12',
   state: 'CA'
},
opts: {
   numRooms: 4,
   residents: [
      "Anders Brams",
      "Joe Schmoe",
      "Jane Dane"
   ]
},
extra: []
```

# Documentation
Before delving into the specifics of the package, a definition of the fundamental concepts is in order: **arguments** and **options**.

Arguments are simply values passed directly to a command or an option. 

Options are named flags, e.g. `--option` that can also be assigned their own arguments.

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
new CliCommand('args-documentation-example')
   .withArguments(
      { name: 'my-house' },
      { name: 'email' },
      { name: 'docker-compose-file' }
   ).withHandler((args, opts, extra) => {
      console.log(args.myHouse)
      console.log(args.email)
      console.log(args.dockerComposeFile)
   })
```
### Variadic arguments
To let an argument be parsed as a list of values, mark it as *variadic*: 
```typescript
new CliCommand('download')
   .withArguments({ name: 'websites', variadic: true })
   
// Terminal: download https://github.com https://abrams.dk https://npmjs.com
// args.websites = ['https://github.com', 'https://...'] in the command handler
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
   )

// Terminal: download https://github.com -- cilly-cli/cilly.git robots.txt
// args.websites = ['https://github.com', ...]
// args.files = ['cilly-cli/cilly.git', 'robots.txt']
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
2. With normal assignment, e.g. `build house --rooms 4`

Here's an example of an option with three arguments - in the `help` text, this would be shown as
```
Options:
  -r, --residents <owner> [...adults] [...children]
```
```typescript
new CliCommand('build')
   .withHandler((args, opts, extra) => {
      console.log(opts)
   })
   .withOptions(
      { name: ['-r', '--residents'], args: [
         { name: 'owner', required: true }
         { name: 'adults', variadic: true, required: false, },
         { name: 'children', variadic: true, required: false }
      ]}
   )
```

The above handler would print the following: 
```typescript
{
   residents: {
      owner: ...,
      adults: [...],
      children: [...]
   }
}
```

If an option only has a single argument, that argument is then collapsed into the option value so it's simpler to access: 
```typescript
new CliCommand('build')
   .withOptions(
      { name: ['-o', '--owner'], args: [
         { name: 'owner', required: true }
      ]}
   )
```

Parsing the input `build --owner=anders` (or `build --owner anders`) would produce the following `opts` object: 
```typescript
{
   owner: 'anders'
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
      { name: ['-p', '--parents'], negatable: true, description: 'Name of (living) parents' }
   )
```

With this, users can pass `--no-parents` in the command line, which will set `opts.parents` to `false`. 
This is also shown in the `help` text:
```
Usage: batman [options]

Options:
  -p, --parents (--no-parents)     Name of (living) parents
```

## Commands
### Subcommands
### Option inheritance
## Validators
## Hooks
### onParse()
### onProcess()
## Generating documentation
## Custom help handlers
## Custom exception handling

