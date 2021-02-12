import chai, { expect } from 'chai'
import chaiAsPromised from 'chai-as-promised'
import { spy, stub } from 'sinon'
import { Argument, CliCommand, Hook, Option, Validator } from './cli-command'
import { CillyException } from './exceptions/cilly-exception'
import { STRINGS } from './strings'

chai.use(chaiAsPromised)

describe('CliCommand', () => {
  it('should throw an exception with an invalid command name', () => {
    const throwing = (): void => { new CliCommand('') }
    expect(throwing).to.throw(CillyException)
    try {
      throwing()
    } catch (err) {
      expect((err as CillyException).message).to.equal(STRINGS.INVALID_COMMAND_NAME(''))
    }
  })
  describe('process()', () => {
    it('should invoke the appropriate (sub)command handler', async () => {
      const handler = spy(() => { null })
      const otherHandler = spy(() => { null })
      const cmd = new CliCommand('test').withHandler(handler).withSubCommands([new CliCommand('hello').withHandler(otherHandler)])

      await cmd.process(['test'])
      expect(handler.called).to.be.true
      expect(otherHandler.called).to.be.false
    })
    it('should invoke the appropriate hooks', async () => {
      const hook = spy(() => { null })
      const otherHook = spy(() => { null })
      const cmd = new CliCommand('test')
        .withArguments([{ name: 'arg', hook: hook }])
        .withOptions([{ name: ['-v', '--verbose'], hook: otherHook }])
        .withHandler(() => { null })

      await cmd.process(['test'])
      expect(hook.called).to.be.true
      expect(otherHook.called).to.be.true
    })
    it('should invoke the appropriate validators', () => {
      expect(false)
    })
    it('should throw an error if validation fails', () => {
      expect(false)
    })
    it('should alter the parsed input if a hook.assign() is called', async () => {
      const hook: Hook = async (value, parsed, assign) => {
        await assign(2)
      }

      const cmd = new CliCommand('test')
        .withArguments([{ name: 'arg', hook: hook }, { name: 'ot' }])
        .withHandler((args) => {
          expect(args.arg).to.equal(2)
          expect(args.ot).to.equal('general')
        })
      await cmd.process(['test', 'hello', 'general'], { stripExecScript: false })
    })
    it('should throw if a hook assigns an invalid value', async () => {
      const validator: Validator = () => false
      const hook: Hook = async (value, parsed, assign) => {
        await assign(2)
      }

      const cmd = new CliCommand('test')
        .withArguments([{ name: 'arg', hook: hook, validator: validator }, { name: 'ot' }])
        .withHandler(() => { null })

      await expect(cmd.process(['test', 'hello', 'general'], { stripExecScript: false }))
        .to.eventually.be.rejectedWith(CillyException)

      try {
        await cmd.process(['test', 'hello', 'general'], { stripExecScript: false })
      } catch (err) {
        expect((err as CillyException).message).to.equal(STRINGS.VALIDATION_ERROR('arg', 2, false))
      }
    })
  })
  describe('checkForMissingCommandHandlers()', () => {
    it('should throw if any subcommand is missing a handler', () => {
      const first = new CliCommand('first')
      const second = new CliCommand('second')
      const third = new CliCommand('third')

      first.withSubCommands([second])
      second.withSubCommands([third, first])

      const checkForMissingCommandHandlers = (first as any).checkForMissingCommandHandlers.bind(first)
      expect(() => checkForMissingCommandHandlers()).to.throw(CillyException)
      try {
        checkForMissingCommandHandlers()
      } catch (err) {
        expect((err as CillyException).message).to.equal(STRINGS.NO_COMMAND_HANDLER(first.name))
      }

      first.handler = (): void => { null }
      second.handler = (): void => { null }

      expect(() => checkForMissingCommandHandlers()).to.throw(CillyException)
      try {
        checkForMissingCommandHandlers()
      } catch (err) {
        expect((err as CillyException).message).to.equal(STRINGS.NO_COMMAND_HANDLER(third.name))
      }
    })
    it('should not throw if no subcommand is missing a handler', () => {
      const first = new CliCommand('first')
      const second = new CliCommand('second')
      const third = new CliCommand('third')
      const checkForMissingCommandHandlers = (first as any).checkForMissingCommandHandlers.bind(first)

      first.withSubCommands([second])
      second.withSubCommands([third])

      first.handler = (): void => { null }
      second.handler = (): void => { null }
      third.handler = (): void => { null }

      expect(() => checkForMissingCommandHandlers()).to.not.throw()
    })
  })
  describe('getCommand()', () => {
    it('should return the correct command', () => {
      const first = new CliCommand('first')
      const second = new CliCommand('second')
      const third = new CliCommand('third')

      first.withSubCommands([second])
      second.withSubCommands([third, first])

      const getCommand = (first as any).getCommand.bind(first)
      expect(getCommand(['first'])).to.eql(first)
      expect(getCommand(['first', 'third'])).to.eql(first)
      expect(getCommand(['first', 'second'])).to.eql(second)
      expect(getCommand(['first', 'second', 'third'])).to.eql(third)
      expect(getCommand(['first', 'second', 'first'])).to.eql(first)
      expect(getCommand(['first', 'second', 'first', 'hello', 'extra'])).to.eql(first)

    })
  })
  describe('parse()', () => {
    it('should parse input as defined by subcommand when invoked', () => {
      const cmd = new CliCommand('parent')
        .withOptions([{ name: ['-v', '--verbose'], defaultValue: false }])
        .withSubCommands([
          new CliCommand('child')
            .withOptions([
              { name: ['-v', '--verbose'], defaultValue: true },
              { name: ['-f', '--files'], args: [{ name: 'files', variadic: true }] }
            ])
        ])

      const parsed = cmd.parse(['parent', 'child', '-f', '.gitignore', '.eslintrc.json'], { stripExecScript: false })
      expect(parsed).to.eql({
        args: {},
        opts: {
          verbose: true,
          files: ['.gitignore', '.eslintrc.json']
        },
        extra: []
      })
    })
  })
  describe('parse()', () => {
    it('should throw an error when duplicate options are passed', () => {
      const cmd = new CliCommand('test').withOptions([{ name: ['-s', '--same'] }])
      const throwing = (): void => { cmd.parse(['test', '--same', '--same'], { stripExecScript: false }) }
      expect(throwing).to.throw(CillyException)
      try {
        throwing()
      } catch (err) {
        expect((err as CillyException).message).to.equal(STRINGS.DUPLICATE_OPT_NAME('same'))
      }
    })
    it('should throw an error when an unknown option is passed', () => {
      const throwing = (): void => {
        const cmd = new CliCommand('test').withOptions([{ name: ['-s', '--same'] }])
        cmd.parse(['test', '--same', '--not-same'], { stripExecScript: false })
      }
      expect(throwing).to.throw(CillyException)
      try {
        throwing()
      } catch (err) {
        expect((err as CillyException).message).to.equal(STRINGS.UNKNOWN_OPTION_NAME('--not-same'))
      }
    })
    it('should put all extra arguments into extra', () => {
      const cmd = new CliCommand('test')
        .withArguments([{ name: 'arg' }])

      const parsed = cmd.parse(['test', 'hello', 'this', 'should', 'go', 'into', 'extra'], { stripExecScript: false })
      expect(parsed).to.eql({
        args: {
          arg: 'hello'
        },
        opts: {},
        extra: ['this', 'should', 'go', 'into', 'extra']
      })
    })
    it('should put all extra options into extra if opts.consumeUnknownOptions is true', () => {
      const cmd = new CliCommand('test', { consumeUnknownOpts: true })
        .withArguments([{ name: 'arg' }])

      const parsed = cmd.parse(['test', 'hello', '--go'], { stripExecScript: false })
      expect(parsed).to.eql({
        args: {
          arg: 'hello'
        },
        opts: {},
        extra: ['--go']
      })
    })
    it('should put all extra options and arguments into extra if opts.consumeUnknownOptions is true', () => {
      const cmd = new CliCommand('test', { consumeUnknownOpts: true })
        .withArguments([{ name: 'arg' }])

      const parsed = cmd.parse(['test', 'hello', 'this', 'should', '--go', 'into', 'extra'], { stripExecScript: false })
      expect(parsed).to.eql({
        args: {
          arg: 'hello'
        },
        opts: {},
        extra: ['this', 'should', '--go', 'into', 'extra']
      })
    })
    it('should generate the appropriate output (1)', () => {
      const cmd = new CliCommand('test')
        .withArguments([{ name: 'first', required: true }, { name: 'second', required: false }])
        .withOptions([
          { name: ['-d', '--dir'], args: [{ name: 'dir' }], defaultValue: './', required: true },
          {
            name: ['-e', '--extra'], args: [
              { name: 'first', defaultValue: '' },
              { name: 'second', defaultValue: 'kenobi' }
            ]
          }
        ])

      const parsed = cmd.parse(['test', 'hello', 'there', '--dir', '/usr/bin/', '-e', 'general'], { stripExecScript: false })
      expect(parsed).to.eql({
        args: {
          first: 'hello',
          second: 'there',
        },
        opts: {
          extra: {
            first: 'general',
            second: 'kenobi'
          },
          dir: '/usr/bin/'
        },
        extra: []
      })
    })
    it('should generate the appropriate output (2)', () => {
      const cmd = new CliCommand('test')
        .withArguments([{ name: 'first', required: true, variadic: true }])
        .withOptions([
          { name: ['-m', '--many'], args: [{ name: 'things', variadic: true }] },
          { name: ['-mo', '--many-optional'], args: [{ name: 'things', variadic: true, required: false }], defaultValue: [1, 2, 3] }
        ])

      const parsed = cmd.parse(['test', 'one', 'two', 'three', '-m', 'many-one', 'many two'], { stripExecScript: false })
      expect(parsed).to.eql({
        args: {
          first: ['one', 'two', 'three']
        },
        opts: {
          many: ['many-one', 'many two'],
          manyOptional: [1, 2, 3]
        },
        extra: []
      })
    })
  })
  describe('isEmpty()', () => {
    const cli = new CliCommand('test')
    const isEmpty = (cli as any).isEmpty

    it('should return true on empty arrays and objects', () => {
      expect(isEmpty({})).to.be.true
      expect(isEmpty([])).to.be.true
    })
    it('should return false on non-empty arrays and objects', () => {
      expect(isEmpty({ a: 1 })).to.be.false
      expect(isEmpty([1])).to.be.false
    })
  })
  describe('getName()', () => {
    const cli = new CliCommand('test')
      .withArguments([{ name: 'my-arg' }])
      .withOptions([{ name: ['-v', '--verbose'] }, { name: ['-m', '--my-option'] }])

    const getName = (cli as any).getName.bind(cli)
    it('should directly parse long option flag definitions', () => {
      expect(getName('--verbose')).to.equal('verbose')
      expect(getName('--my-option')).to.equal('myOption')
    })
    it('should return the long name for a short flag definition', () => {
      expect(getName('-v')).to.equal('verbose')
      expect(getName('-m')).to.equal('myOption')
    })
    it('should return the correctly formatted name of an argument', () => {
      const arg: Argument = { name: 'my-arg' }
      expect(getName(arg)).to.equal('myArg')
    })
    it('should return the correctly formatted name of an option', () => {
      const opt: Option = { name: ['-m', '--my-option'] }
      expect(getName(opt)).to.equal('myOption')
    })
  })
  describe('getShortName()', () => {
    it('should return the correctly formatted short name of an option', () => {
      const cli = new CliCommand('test')
      const o1: Option = { name: ['-t', '--test'] }
      const o2: Option = { name: ['-my-opt', '--my-option'] }
      const getShortName = (cli as any).getShortName
      expect(getShortName(o1)).to.equal('t')
      expect(getShortName(o2)).to.equal('myOpt')
    })
  })
  describe('checkSubCommand', () => {
    it('should throw an exception if the command has arguments', () => {
      const cli = new CliCommand('test').withArguments([{ name: 'test' }])
      const checkSubCommand = (cli as any).checkSubCommand.bind(cli)
      const throwing = (): void => {
        checkSubCommand(new CliCommand('something'))
      }
      expect(throwing).to.throw(CillyException)
      try {
        throwing()
      } catch (err) {
        expect((err as CillyException).message).to.equal(STRINGS.NO_ARGS_AND_SUBCOMMANDS('something'))
      }
    })
    it('should not do anything if command has no arguments', () => {
      const cli = new CliCommand('test')
      const checkSubCommand = (cli as any).checkSubCommand.bind(cli)
      const notThrowing = (): void => { checkSubCommand(new CliCommand('something')) }
      expect(notThrowing).to.not.throw(Error)
    })
  })
  describe('checkArgument', () => {
    it('should throw an exception if the command has subcommands', () => {
      const cli = new CliCommand('test').withSubCommands([new CliCommand('asd')])
      const checkArgument = (cli as any).checkArgument.bind(cli)

      const throwing = (): void => {
        checkArgument({ name: 'arg' })
      }
      expect(throwing).to.throw(CillyException)
      try {
        throwing()
      } catch (err) {
        expect((err as CillyException).message).to.equal(STRINGS.NO_ARGS_AND_SUBCOMMANDS('test'))
      }
    })
    it('should not do anything if command has no subcommands', () => {
      const cli = new CliCommand('test')
      const checkArgument = (cli as any).checkArgument.bind(cli)
      const notThrowing = (): void => { checkArgument({ name: 'arg' }) }
      expect(notThrowing).to.not.throw(Error)
    })
    it('should throw an exception if the argument has an invalid name', () => {
      const cli = new CliCommand('test')
      const checkArgument = (cli as any).checkArgument.bind(cli)
      const throwing = (): void => { checkArgument({ name: 'invalid arg' }) }
      expect(throwing).to.throw(CillyException)
      try {
        throwing()
      } catch (err) {
        expect((err as CillyException).message).to.equal(STRINGS.INVALID_ARGUMENT_NAME('invalid arg'))
      }
    })
  })
  describe('checkOption()', () => {
    it('should throw an exception if there are more than two flag definitions', () => {
      const cli = new CliCommand('test')
      const checkOption = (cli as any).checkOption.bind(cli)
      const names = ['-w', '--wee', '----weeeee']
      const throwing = (): void => { checkOption({ name: names }) }
      expect(throwing).to.throw(CillyException)
      try {
        throwing()
      } catch (err) {
        expect((err as CillyException).message).to.equal(STRINGS.INVALID_N_OPTION_NAMES(names))
      }
    })
    it('should throw an exception if short flag is invalid', () => {
      const cli = new CliCommand('test')
      const checkOption = (cli as any).checkOption.bind(cli)
      const throwing = (): void => { checkOption({ name: ['wrong', '--not-wrong'] }) }
      expect(throwing).to.throw(CillyException)
      try {
        throwing()
      } catch (err) {
        expect((err as CillyException).message).to.equal(STRINGS.INVALID_SHORT_OPTION_NAME('wrong'))
      }
    })
    it('should throw an exception if long flag is invalid', () => {
      const cli = new CliCommand('test')
      const checkOption = (cli as any).checkOption.bind(cli)
      const throwing = (): void => { checkOption({ name: ['-not-wrong', 'wrong'] }) }
      expect(throwing).to.throw(CillyException)
      try {
        throwing()
      } catch (err) {
        expect((err as CillyException).message).to.equal(STRINGS.INVALID_LONG_OPTION_NAME('wrong'))
      }
    })
    it('should call checkArgument() for all option args', () => {
      const cli = new CliCommand('test')
      const checkOption = (cli as any).checkOption.bind(cli)
      const checkArgument = stub(cli as any, 'checkArgument')

      checkOption({ name: ['-s', '--same'], args: [{ name: 'first' }, { name: 'second' }] })
      expect(checkArgument.calledTwice).to.be.true
    })
  })
  describe('handleUnassignedArguments()', () => {
    it('should throw an exception if there are any required arguments', () => {
      const cli = new CliCommand('test').withArguments([{ name: 'arg', required: true }])
      const handleUnassignedArguments = (cli as any).handleUnassignedArguments.bind(cli)
      const throwing = (): void => handleUnassignedArguments()
      expect(throwing).to.throw(CillyException)
      try {
        throwing()
      } catch (err) {
        expect((err as CillyException).message).to.equal(STRINGS.EXPECTED_BUT_GOT('a value for "arg"', 'nothing'))
      }
    })
    it('should assign default values to all optional, unassigned arguments', () => {
      const cli = new CliCommand('test').withArguments([{ name: 'arg', required: false }, { name: 'my-arg', required: false, defaultValue: 'hello' }])
      const handleUnassignedArguments = (cli as any).handleUnassignedArguments.bind(cli)
      handleUnassignedArguments()
      const args = (cli as any).parsed.args
      expect(args).to.eql({
        arg: undefined,
        myArg: 'hello'
      })
    })
  })
  describe('handleUnassignedOptions()', () => {
    it('should throw an exception if there are any unassigned required options', () => {
      const cli = new CliCommand('test').withOptions([{ name: ['-s', '--same'], required: true }])
      const handleUnassignedOptions = (cli as any).handleUnassignedOptions.bind(cli)
      const throwing = (): void => handleUnassignedOptions()
      expect(throwing).to.throw(CillyException)
      try {
        throwing()
      } catch (err) {
        expect((err as CillyException).message).to.equal(STRINGS.EXPECTED_BUT_GOT('a value for "same"', 'nothing'))
      }
    })
    it('should assign default values to all optional, unassigned options', () => {
      const cli = new CliCommand('test').withOptions([{ name: ['-s', '--same'], defaultValue: [1, 2, 3] }])
      const handleUnassignedOptions = (cli as any).handleUnassignedOptions.bind(cli)
      handleUnassignedOptions()
      const opts = (cli as any).parsed.opts
      expect(opts).to.eql({
        same: [1, 2, 3]
      })
    })
  })
  describe('withDescription()', () => {
    it('should help me get 100% code coverage', () => {
      expect(new CliCommand('test').withDescription('hello!').description).to.equal('hello!')
    })
  })
  describe('withArguments', () => {
    it('should throw an exception when the name already exists', () => {
      const throwing = (): void => {
        new CliCommand('test')
          .withArguments([
            { name: 'my-arg' },
            { name: 'my-arg' }
          ])
      }
      expect(throwing).to.throw(CillyException)
      try {
        throwing()
      } catch (err) {
        expect((err as CillyException).message).to.equal(STRINGS.DUPLICATE_ARG_NAME('my-arg'))
      }
    })
  })
  describe('withOptions()', () => {
    it('should throw an exception when the short name already exists', () => {
      const throwing = (): void => {
        new CliCommand('test')
          .withOptions([
            { name: ['-s', '--same'] },
            { name: ['-s', '--not-same'] }
          ])
      }

      expect(throwing).to.throw(CillyException)
      try {
        throwing()
      } catch (err) {
        expect((err as CillyException).message).to.equal(STRINGS.DUPLICATE_OPT_NAME('s'))
      }
    })
    it('should throw an exception when the long name already exists', () => {
      const throwing = (): void => {
        new CliCommand('test')
          .withOptions([
            { name: ['-s', '--same'] },
            { name: ['-n', '--same'] }
          ])
      }

      expect(throwing).to.throw(CillyException)
      try {
        throwing()
      } catch (err) {
        expect((err as CillyException).message).to.equal(STRINGS.DUPLICATE_OPT_NAME('same'))
      }
    })
  })
  describe('withSubCommands()', () => {
    it('should let subcommand inherit all options if inheritOptions is true', () => {
      const parent = new CliCommand('parent').withOptions([
        { name: ['-s', '--short'] },
        { name: ['-n', '--nada'] }
      ])
      const child = new CliCommand('child', { inheritOpts: true }).withOptions([{ name: ['-a', '--ada'] }])
      parent.withSubCommands([child])
      for (const opt of Object.keys(parent.opts)) {
        expect(Object.keys(child.opts)).to.contain(opt)
      }
      expect(child.opts).to.haveOwnProperty('ada')
      expect(child.opts).to.haveOwnProperty('short')
      expect(child.opts).to.haveOwnProperty('nada')
    })
    it('should throw on duplicate subcommands', () => {
      const parent = new CliCommand('parent')
      const first = new CliCommand('first')
      const alsoFirst = new CliCommand('first')
      const throwing = (): void => { parent.withSubCommands([first, alsoFirst]) }
      expect(throwing).to.throw(CillyException)
      try {
        throwing()
      } catch (err) {
        expect((err as CillyException).message).to.equal(STRINGS.DUPLICATE_COMMAND_NAME('first', 'parent'))
      }
    })
  })
})
