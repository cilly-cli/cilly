import { CliCommand } from './cli-command'

const helloCommand = new CliCommand('hello', { inheritOpts: true })
  .withOptions([
    { name: ['-e', '--emily'], desc: 'Say hello to Emily' }
  ])
  .withHandler(({ args, opts }) => {
    console.log(JSON.stringify(Object.keys(opts)))
    console.log('Hello' + opts.emily ? ' from Emily!' : '!')
  })

const command = new CliCommand('emily')
  .withDescription('This is a command')
  .withArguments([
    { name: 'first', required: true },
    { name: 'second', variadic: true }
  ])
  .withOptions([
    { name: ['-v', '--verbose'], desc: 'Verbose' },
    { name: ['-d', '--dry-run'], desc: 'Dry run' },
    { name: ['-r', '--required'], args: [{ name: 'required-arg', required: true }], desc: 'Required' },
    { name: ['-o', '--optional'], args: [{ name: 'optional-arg', required: false }], desc: 'Optional' },
    { name: ['-mr', '--many-required'], args: [{ name: 'many-required-args', required: true, variadic: true }], desc: 'Required variadic' },
    { name: ['-mo', '--many-optional'], args: [{ name: 'optional-required-args', required: false, variadic: true }], desc: 'Optional variadic' },
    { name: ['-t', '--two-arguments'], args: [{ name: 'first', required: true }, { name: 'second', required: false }], desc: 'Two arguments' }
  ])
  // .withSubCommands([
  //   helloCommand
  // ])
  .withHandler(({ args, opts }) => {
    console.log(JSON.stringify(Object.keys(opts)))
    console.log(args, opts)
  })

void command.process(process.argv)
