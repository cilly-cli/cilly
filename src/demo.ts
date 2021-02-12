#!/usr/local/bin/ts-node

import { CliCommand } from './cli-command'

const cli = new CliCommand('test-cli')
  .withDescription('A test CLI that we can run from the command line.')
  .withOptions([
    { name: ['-v', '--verbose'], defaultValue: true },
    { name: ['-f', '--files'], args: [{ name: 'files', variadic: true }], defaultValue: [] }
  ])
  .withHandler(() => { null })
  .withSubCommands([
    new CliCommand('hello')
      .withDescription('Just say hello')
      .withArguments([{ name: 'nothing' }])
      .withOptions([{ name: ['-hi', '--hello'], description: 'This is in the subcommand' }])
      .withHandler(() => { null })
  ])

cli.process(process.argv).then(null).catch(null)
