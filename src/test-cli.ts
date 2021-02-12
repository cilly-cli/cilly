#!/usr/local/bin/ts-node

import { CliCommand } from './cli-command'

const cli = new CliCommand('test-cli')
  .withDescription('A test CLI that we can run from the command line.')
  .withOptions([
    { name: ['-v', '--verbose'], defaultValue: true },
    { name: ['-f', '--files'], args: [{ name: 'files', variadic: true }], defaultValue: [] }
  ])
  .withArguments([
    { name: 'dir', required: true }
  ])

