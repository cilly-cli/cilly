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
With the file `build.ts`: 
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
The following will cover the specifics of the package, but first a definition of the fundamental concepts is in order: **arguments** and **options**.
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

