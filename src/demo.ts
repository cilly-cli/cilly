#!/usr/local/bin/ts-node

import { CliCommand } from './cli-command'

const cmd = new CliCommand('test')
  .withArguments(
    { name: 'name', required: true }
  )
  .withOptions(
    { name: ['-v', '--version'], defaultValue: '0.1.2' },
    {
      name: ['-d', '--dir'], args: [
        { name: 'dir', required: true }
      ]
    }
  )
  .withHandler((args, opts, extra) => {
    console.log(`Got name: ${args.name}`)
    console.log(`Version is ${opts.version}`)
    console.log(`Dir is ${opts.dir}`)
  })

cmd.process(process.argv).then().catch(null)
