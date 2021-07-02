import chai, { expect } from 'chai'
import chaiAsPromised from 'chai-as-promised'
import { spy, stub } from 'sinon'
import { Argument, CliCommand, OnProcessHook, Option, Validator } from './cli-command'
import { CillyException, DuplicateArgumentException, DuplicateCommandNameException, DuplicateOptionException, InvalidArgumentNameException, InvalidCommandNameException, InvalidLongOptionNameException, InvalidNumOptionNamesException, InvalidShortOptionNameException, NoArgsAndSubCommandsException, NoCommandHandlerException, ExpectedButGotException, UnknownOptionException, UnknownSubcommandException, ValidationError, UnexpectedArgumentException } from './exceptions'

chai.use(chaiAsPromised)

describe('CliCommand', () => {
  it('should throw an exception with an invalid command name', () => {
    const throwing = (): void => { new CliCommand('') }
    expect(throwing).to.throw(InvalidCommandNameException)
  })
  describe('process()', () => {
    it('should invoke the appropriate (sub)command handler', async () => {
      const handler = spy(() => { null })
      const otherHandler = spy(() => { null })
      const cmd = new CliCommand('test').withHandler(handler).withSubCommands(new CliCommand('hello').withHandler(otherHandler))

      await cmd.process(['test'])
      expect(handler.called).to.be.true
      expect(otherHandler.called).to.be.false
    })
    it('should invoke the appropriate hooks', async () => {
      const hook = spy(() => { null })
      const otherHook = spy(() => { null })
      const cmd = new CliCommand('test')
        .withArguments({ name: 'arg', onProcess: hook })
        .withOptions({ name: ['-v', '--verbose'], onProcess: otherHook })
        .withHandler(() => { null })

      await cmd.process(['test'], { raw: true })
      expect(hook.called).to.be.true
      expect(otherHook.called).to.be.true
    })
    it('should invoke appropriate hooks in subcommands', async () => {
      const hook = spy(() => { null })
      const otherHook = spy(() => { null })
      const cmd = new CliCommand('test')
        .withHandler(() => { null })
        .withSubCommands(new CliCommand('othertest')
          .withArguments({ name: 'arg', onProcess: hook })
          .withOptions({ name: ['-v', '--verbose'], onProcess: otherHook })
          .withHandler(() => { null })
        )

      await cmd.process(['test', 'othertest'], { raw: true })
      expect(hook.called).to.be.true
      expect(otherHook.called).to.be.true
    })
    it('should invoke the appropriate validators', async () => {
      const validator = spy(() => true)
      const otherValidator = spy(() => true)
      const cmd = new CliCommand('test')
        .withArguments({ name: 'arg', validator: validator })
        .withOptions({ name: ['-v', '--verbose'], validator: otherValidator })
        .withHandler(() => { null })

      await cmd.process(['test'])
      expect(validator.called).to.be.true
      expect(otherValidator.called).to.be.true
    })
    it('should throw an error if validation fails', async () => {
      const validator = spy(() => false)
      const cmd = new CliCommand('test')
        .withArguments({ name: 'arg', validator: validator })
        .withHandler(() => { null })

      await expect(cmd.process(['test', 'hi'])).to.eventually.be.rejectedWith(CillyException)
    })
    it('should alter the parsed input if a onProcess.assign() is called', async () => {
      const hook: OnProcessHook = async (value, parsed, assign) => {
        await assign(2)
      }

      const cmd = new CliCommand('test')
        .withArguments({ name: 'arg', onProcess: hook }, { name: 'ot' })
        .withHandler((args) => {
          expect(args.arg).to.equal(2)
          expect(args.ot).to.equal('general')
        })
      await cmd.process(['test', 'hello', 'general'], { raw: true })
    })
    it('should throw if an onProcess hook assigns an invalid value', async () => {
      const validator: Validator = () => false
      const hook: OnProcessHook = async (value, parsed, assign) => {
        await assign(2)
      }

      const cmd = new CliCommand('test')
        .withArguments({ name: 'arg', onProcess: hook, validator: validator }, { name: 'ot' })
        .withHandler(() => { null })

      await expect(cmd.process(['test', 'hello', 'general'], { raw: true }))
        .to.eventually.be.rejectedWith(ValidationError)
    })
  })
  describe('checkForMissingCommandHandlers()', () => {
    it('should throw if any subcommand is missing a handler', () => {
      const first = new CliCommand('first')
      const second = new CliCommand('second')
      const third = new CliCommand('third')

      first.withSubCommands(second)
      second.withSubCommands(third, first)

      const checkForMissingCommandHandlers = (first as any).checkForMissingCommandHandlers.bind(first)
      expect(() => checkForMissingCommandHandlers()).to.throw(NoCommandHandlerException)
      try {
        checkForMissingCommandHandlers()
      } catch (err) {
        expect((err as NoCommandHandlerException).command.name).to.equal(first.name)
      }

      (first as any).handler = (): void => { null }
      (second as any).handler = (): void => { null }

      expect(() => checkForMissingCommandHandlers()).to.throw(NoCommandHandlerException)
      try {
        checkForMissingCommandHandlers()
      } catch (err) {
        expect((err as NoCommandHandlerException).command.name).to.equal(third.name)
      }
    })
    it('should not throw if no subcommand is missing a handler', () => {
      const first = new CliCommand('first')
      const second = new CliCommand('second')
      const third = new CliCommand('third')
      const checkForMissingCommandHandlers = (first as any).checkForMissingCommandHandlers.bind(first)

      first.withSubCommands(second)
      second.withSubCommands(third);

      (first as any).handler = (): void => { null }
      (second as any).handler = (): void => { null }
      (third as any).handler = (): void => { null }

      expect(() => checkForMissingCommandHandlers()).to.not.throw()
    })
  })
  describe('getCommand()', () => {
    it('should return the correct command', () => {
      const first = new CliCommand('first')
      const second = new CliCommand('second')
      const third = new CliCommand('third')

      first.withSubCommands(second)
      second.withSubCommands(third, first)

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
    it('should call the correct help handler when parsing --help in subcommands', () => {
      const firstHelp = spy()
      const secondHelp = spy()
      const thirdHelp = spy()

      const cmd = new CliCommand('first').withHelpHandler(firstHelp)
        .withSubCommands(new CliCommand('second').withHelpHandler(firstHelp)
          .withSubCommands(new CliCommand('third', { inheritOpts: true }).withHelpHandler(thirdHelp)))

      cmd.parse(['second', 'third', '--help'], { raw: true })
      expect(firstHelp.called).to.be.false
      expect(secondHelp.called).to.be.false
      expect(thirdHelp.called).to.be.true
    })
    it('should be able to parse inherited short option flags', () => {
      const cmd = new CliCommand('first')
        .withSubCommands(new CliCommand('second')
          .withOptions({ name: ['-rc', '--run-config'], args: [{ name: 'path', required: true }] })
          .withSubCommands(new CliCommand('third', { inheritOpts: true })
            .withOptions({ name: ['-o', '--other'] })))

      expect(() => { cmd.parse(['second', 'third', '-rc', 'rc.json'], { raw: true }) }).to.not.throw(UnknownOptionException)
    })
    it('should throw when an expected option argument is not provided', () => {
      const cmd = new CliCommand('test')
        .withOptions({ name: ['-n', '--name'], args: [{ name: 'name', required: true }] })

      expect(() => cmd.parse(['test', '--name'], { raw: true })).to.throw(ExpectedButGotException)
    })
    it('should immediately invoke any onParse() hooks when parsing an option', () => {
      const optHook = spy(() => { null })
      const cmd = new CliCommand('test')
        .withOptions({ name: ['-v', '--version'], onParse: optHook })

      cmd.parse(['test', '-v'], { raw: true })
      expect(optHook.called).to.be.true
    })
    it('should immediately invoke any onParse() hooks when parsing an argument', () => {
      const argHook = spy(() => { null })
      const cmd = new CliCommand('test')
        .withArguments({ name: 'version', onParse: argHook })

      cmd.parse(['test', 'a-value-for-version'], { raw: true })
      expect(argHook.called).to.be.true
    })
    it('should immediately invoke the help handler when seeing the --help flag', () => {
      const helpFnc = spy(() => { null })
      const secondHelpFnc = spy(() => { null })
      const cmd = new CliCommand('test')
        .withHelpHandler(helpFnc)
        .withSubCommands(
          new CliCommand('next')
            .withHelpHandler(secondHelpFnc)
        )

      cmd.parse(['test', '--help'], { raw: true })
      expect(helpFnc.called).to.be.true
      expect(secondHelpFnc.called).to.be.false

      cmd.parse(['test', 'next', '--help'], { raw: true })
      expect(secondHelpFnc.called).to.be.true
    })
    it('should throw if an unknown subcommand is requested', () => {
      const cmd = new CliCommand('test').withSubCommands(new CliCommand('next'))
      const throwing = (): void => { cmd.parse(['test', 'not-next'], { raw: true }) }
      expect(throwing).to.throw(UnknownSubcommandException)
    })
    it('should correctly negate negatable flags', () => {
      const cmd = new CliCommand('parent')
        .withOptions({ name: ['-v', '--verbose'], defaultValue: true, negatable: true })
      const parsed = cmd.parse(['parent', '--no-verbose'], { raw: true })
      expect(parsed).to.eql({
        args: {},
        opts: {
          verbose: false,
          help: undefined
        },
        extra: []
      })
    })
    it('should parse input as defined by subcommand when invoked', () => {
      const cmd = new CliCommand('parent')
        .withOptions({ name: ['-v', '--verbose'], defaultValue: false })
        .withSubCommands(
          new CliCommand('child')
            .withOptions(
              { name: ['-v', '--verbose'], defaultValue: true },
              { name: ['-f', '--files'], args: [{ name: 'files', variadic: true }] }
            )
        )

      const parsed = cmd.parse(['parent', 'child', '-f', '.gitignore', '.eslintrc.json'], { raw: true })
      expect(parsed).to.eql({
        args: {},
        opts: {
          verbose: true,
          files: ['.gitignore', '.eslintrc.json'],
          help: undefined
        },
        extra: []
      })
    })
    it('should correctly parse terminated variadic arguments', () => {
      const cmd = new CliCommand('test')
        .withArguments(
          { name: 'files', variadic: true },
          { name: 'dirs', variadic: true }
        )

      const parsed = cmd.parse(['test', '1', '2', '3', '--', '4', '5', '6'], { raw: true })
      expect(parsed.args.files).to.eql(['1', '2', '3'])
      expect(parsed.args.dirs).to.eql(['4', '5', '6'])
    })
    it('should correctly parse terminated variadic option arguments', () => {
      const cmd = new CliCommand('test')
        .withOptions(
          {
            name: ['-e', '--enfo'], args: [
              { name: 'files', variadic: true },
              { name: 'dirs', variadic: true }
            ]
          }
        )

      const parsed = cmd.parse(['test', '-e', '1', '2', '3', '--', '4', '5', '6'], { raw: true })
      expect(parsed.opts.enfo.files).to.eql(['1', '2', '3'])
      expect(parsed.opts.enfo.dirs).to.eql(['4', '5', '6'])
    })
    it('should throw an error when duplicate options are passed', () => {
      const cmd = new CliCommand('test').withOptions({ name: ['-s', '--same'] })
      const throwing = (): void => { cmd.parse(['test', '--same', '--same'], { raw: true }) }
      expect(throwing).to.throw(DuplicateOptionException)
    })
    it('should throw an error when an unknown option is passed', () => {
      const throwing = (): void => {
        const cmd = new CliCommand('test').withOptions({ name: ['-s', '--same'] })
        cmd.parse(['test', '--same', '--not-same'], { raw: true })
      }
      expect(throwing).to.throw(UnknownOptionException)
    })
    it('should put all extra arguments into extra if consumeUnknownArgs is true', () => {
      const cmd = new CliCommand('test', { consumeUnknownArgs: true })
        .withArguments({ name: 'arg' })

      const parsed = cmd.parse(['test', 'hello', 'this', 'should', 'go', 'into', 'extra'], { raw: true })
      expect(parsed).to.eql({
        args: {
          arg: 'hello'
        },
        opts: {
          help: undefined
        },
        extra: ['this', 'should', 'go', 'into', 'extra']
      })
    })
    it('should throw UnexpectedArgumentException if consumeUnknownArgs is false and unexpected argument is received', () => {
      const cmd = new CliCommand('test', { consumeUnknownArgs: false })
        .withArguments({ name: 'arg' })

      expect(() => cmd.parse(['test', 'hello', 'this', 'should', 'go', 'into', 'extra'], { raw: true })).to.throw(UnexpectedArgumentException)
    })
    it('should put all extra options into extra if opts.consumeUnknownOptions is true', () => {
      const cmd = new CliCommand('test', { consumeUnknownOpts: true })
        .withArguments({ name: 'arg' })

      const parsed = cmd.parse(['test', 'hello', '--go'], { raw: true })
      expect(parsed).to.eql({
        args: {
          arg: 'hello'
        },
        opts: {
          help: undefined
        },
        extra: ['--go']
      })
    })
    it('should put all extra options and arguments into extra if opts.consumeUnknownOptions and opts.consumeUnknownArgs are true', () => {
      const cmd = new CliCommand('test', { consumeUnknownOpts: true, consumeUnknownArgs: true })
        .withArguments({ name: 'arg' })

      const parsed = cmd.parse(['test', 'hello', 'this', 'should', '--go', 'into', 'extra'], { raw: true })
      expect(parsed).to.eql({
        args: {
          arg: 'hello'
        },
        opts: {
          help: undefined
        },
        extra: ['this', 'should', '--go', 'into', 'extra']
      })
    })
    it('should generate the appropriate output (1)', () => {
      const cmd = new CliCommand('test')
        .withArguments({ name: 'first', required: true }, { name: 'second', required: false })
        .withOptions(
          { name: ['-d', '--dir'], args: [{ name: 'dir' }], defaultValue: './', required: true },
          {
            name: ['-e', '--extra'], args: [
              { name: 'first', defaultValue: '' },
              { name: 'second', defaultValue: 'kenobi' }
            ]
          }
        )

      const parsed = cmd.parse(['test', 'hello', 'there', '--dir', '/usr/bin/', '-e', 'general'], { raw: true })
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
          help: undefined,
          dir: '/usr/bin/'
        },
        extra: []
      })
    })
    it('should generate the appropriate output (2)', () => {
      const cmd = new CliCommand('test')
        .withArguments({ name: 'first', required: true, variadic: true })
        .withOptions(
          { name: ['-m', '--many'], args: [{ name: 'things', variadic: true }] },
          { name: ['-mo', '--many-optional'], args: [{ name: 'things', variadic: true, required: false }], defaultValue: [1, 2, 3] }
        )

      const parsed = cmd.parse(['test', 'one', 'two', 'three', '-m', 'many-one', 'many two'], { raw: true })
      expect(parsed).to.eql({
        args: {
          first: ['one', 'two', 'three']
        },
        opts: {
          many: ['many-one', 'many two'],
          manyOptional: [1, 2, 3],
          help: undefined
        },
        extra: []
      })
    })
    it('should not assign default value to boolean flags when they are passed', () => {
      const cli = new CliCommand('test').withOptions({ name: ['-s', '--silent'], defaultValue: false })
      const { opts } = cli.parse(['test', '--silent'], { raw: true })
      expect(opts.silent).to.exist
      expect(opts.silent).to.be.true
    })
    it('should assign default value to boolean flags when they are not passed', () => {
      const cli = new CliCommand('test').withOptions({ name: ['-s', '--silent'], defaultValue: false })
      const { opts } = cli.parse(['test'], { raw: true })
      expect(opts.silent).to.exist
      expect(opts.silent).to.be.false
    })
    it('should assign default value to options with arguments when the option is not passed', () => {
      const cli = new CliCommand('test')
        .withOptions({ name: ['-f', '--file'], args: [{ name: 'files' }], defaultValue: 'file.txt' })
      const { opts } = cli.parse(['test', '--file', 'test.txt'], { raw: true })
      expect(opts.file).to.exist
      expect(opts.file).to.equal('test.txt')
    })
    it('should not assign default value to options with arguments when the option is passed', () => {
      const cli = new CliCommand('test')
        .withOptions({ name: ['-f', '--file'], args: [{ name: 'file' }], defaultValue: 'file.txt' })
      const { opts } = cli.parse(['test'], { raw: true })
      expect(opts.file).to.exist
      expect(opts.file).to.equal('file.txt')
    })
    it('should not assign default value to options with variadic arguments when the option is passed', () => {
      const cli = new CliCommand('test')
        .withOptions({ name: ['-f', '--files'], args: [{ name: 'files', variadic: true }], defaultValue: ['file.txt'] })
      const { opts } = cli.parse(['test', '--files'], { raw: true })
      expect(opts.files).to.exist
      expect(opts.files).to.be.empty
    })
    it('should assign default value to options with variadic arguments when the option is not passed', () => {
      const cli = new CliCommand('test')
        .withOptions({ name: ['-f', '--files'], args: [{ name: 'files', variadic: true }], defaultValue: ['file.txt'] })
      const { opts } = cli.parse(['test'], { raw: true })
      expect(opts.files).to.exist
      expect(opts.files).to.eql(['file.txt'])
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
      .withArguments({ name: 'my-arg' })
      .withOptions({ name: ['-v', '--verbose'] }, { name: ['-m', '--my-option'] })

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
      const cli = new CliCommand('test').withArguments({ name: 'test' })
      const checkSubCommand = (cli as any).checkSubCommand.bind(cli)
      const throwing = (): void => {
        checkSubCommand(new CliCommand('something'))
      }
      expect(throwing).to.throw(NoArgsAndSubCommandsException)
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
      const cli = new CliCommand('test').withSubCommands(new CliCommand('asd'))
      const checkArgument = (cli as any).checkArgument.bind(cli)

      const throwing = (): void => {
        checkArgument({ name: 'arg' })
      }
      expect(throwing).to.throw(NoArgsAndSubCommandsException)
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
      expect(throwing).to.throw(InvalidArgumentNameException)
    })
  })
  describe('checkOption()', () => {
    it('should throw an exception if there are more than two flag definitions', () => {
      const cli = new CliCommand('test')
      const checkOption = (cli as any).checkOption.bind(cli)
      const names = ['-w', '--wee', '----weeeee']
      const throwing = (): void => { checkOption({ name: names }) }
      expect(throwing).to.throw(InvalidNumOptionNamesException)
    })
    it('should throw an exception if short flag is invalid', () => {
      const cli = new CliCommand('test')
      const checkOption = (cli as any).checkOption.bind(cli)
      const throwing = (): void => { checkOption({ name: ['wrong', '--not-wrong'] }) }
      expect(throwing).to.throw(InvalidShortOptionNameException)
    })
    it('should throw an exception if long flag is invalid', () => {
      const cli = new CliCommand('test')
      const checkOption = (cli as any).checkOption.bind(cli)
      const throwing = (): void => { checkOption({ name: ['-not-wrong', 'wrong'] }) }
      expect(throwing).to.throw(InvalidLongOptionNameException)
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
      const cli = new CliCommand('test').withArguments({ name: 'arg', required: true })
      const handleUnassignedArguments = (cli as any).handleUnassignedArguments.bind(cli)
      const throwing = (): void => handleUnassignedArguments()
      expect(throwing).to.throw(ExpectedButGotException)
    })
    it('should assign default values to all optional, unassigned arguments', () => {
      const cli = new CliCommand('test').withArguments({ name: 'arg', required: false }, { name: 'my-arg', required: false, defaultValue: 'hello' })
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
      const cli = new CliCommand('test').withOptions({ name: ['-s', '--same'], required: true })
      const handleUnassignedOptions = (cli as any).handleUnassignedOptions.bind(cli)
      const throwing = (): void => handleUnassignedOptions()
      expect(throwing).to.throw(ExpectedButGotException)
    })
    it('should assign default values to all optional, unassigned options', () => {
      const cli = new CliCommand('test').withOptions({ name: ['-s', '--same'], defaultValue: [1, 2, 3] })
      const handleUnassignedOptions = (cli as any).handleUnassignedOptions.bind(cli)
      handleUnassignedOptions()
      const opts = (cli as any).parsed.opts
      expect(opts).to.eql({
        same: [1, 2, 3],
        help: undefined
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
          .withArguments(
            { name: 'my-arg' },
            { name: 'my-arg' }
          )
      }
      expect(throwing).to.throw(DuplicateArgumentException)
    })
  })
  describe('withSubCommands()', () => {
    it('should let 3rd level subcommands have access to grandparent options', () => {
      const me = new CliCommand('me', { inheritOpts: true })
        .withOptions({ name: ['-m', '--me'] })
      const pa = new CliCommand('pa', { inheritOpts: true })
        .withOptions({ name: ['-p', '--pa'] })
        .withSubCommands(me)
      const grandpa = new CliCommand('grandpa')
        .withOptions({ name: ['-g', '--grandpa'] })
        .withSubCommands(pa)

      expect((me as any).opts).to.haveOwnProperty('me')
      expect((me as any).opts).to.haveOwnProperty('pa')
      expect((me as any).opts).to.haveOwnProperty('grandpa')

      expect((pa as any).opts).to.haveOwnProperty('pa')
      expect((pa as any).opts).to.haveOwnProperty('grandpa')
    })
    it('should not inherit the parents --help option when inheritOpts is true', () => {
      const parentHelp = spy()
      const childHelp = spy()

      const child = new CliCommand('child', { inheritOpts: true })
        .withOptions({ name: ['-c', '--child'] })
        .withHelpHandler(childHelp)
      const parent = new CliCommand('parent')
        .withHelpHandler(parentHelp)
        .withOptions({ name: ['-p', '--parent'] })
        .withSubCommands(child)

      const childHelpOption = (child as any).opts.help
      childHelpOption.onParse()

      expect(childHelp.called).to.be.true
      expect(parentHelp.called).to.be.false
    })
    it('should let subcommand inherit all options if inheritOptions is true', () => {
      const parent = new CliCommand('parent').withOptions(
        { name: ['-s', '--short'] },
        { name: ['-n', '--nada'] }
      )
      const child = new CliCommand('child', { inheritOpts: true }).withOptions({ name: ['-a', '--ada'] })
      parent.withSubCommands(child)
      for (const opt of Object.keys((parent as any).opts)) {
        expect(Object.keys((child as any).opts)).to.contain(opt)
      }
      expect((child as any).opts).to.haveOwnProperty('ada')
      expect((child as any).opts).to.haveOwnProperty('short')
      expect((child as any).opts).to.haveOwnProperty('nada')
    })
    it('should throw on duplicate subcommands', () => {
      const parent = new CliCommand('parent')
      const first = new CliCommand('first')
      const alsoFirst = new CliCommand('first')
      const throwing = (): void => { parent.withSubCommands(first, alsoFirst) }
      expect(throwing).to.throw(DuplicateCommandNameException)
    })
  })
  describe('dump()', () => {
    it('should generate a correct dump for nested subcommands', () => {
      const parent = new CliCommand('get')
        .withDescription('This is a get')
        .withOptions({ name: ['-f', '--files'], args: [{ name: 'files', variadic: true }] })
        .withSubCommands(
          new CliCommand('download', { inheritOpts: true })
            .withOptions({ name: ['-d', '--dry-run'], required: false, defaultValue: true })
            .withArguments({ name: 'path', required: true })
        )

      expect(parent.dump()).to.eql({
        name: 'get',
        version: undefined,
        description: 'This is a get',
        args: [],
        opts: [
          {
            name: ['-h', '--help'],
            required: undefined,
            negatable: undefined,
            defaultValue: undefined,
            description: 'Display help for command',
            args: []
          },
          {
            name: ['-f', '--files'],
            defaultValue: undefined,
            description: undefined,
            negatable: undefined,
            required: undefined,
            args: [
              {
                name: 'files',
                variadic: true,
                defaultValue: undefined,
                description: undefined,
                required: undefined
              }
            ]
          },
        ],
        subCommands: [
          {
            name: 'download',
            version: undefined,
            description: undefined,
            args: [
              {
                name: 'path',
                required: true,
                variadic: undefined,
                defaultValue: undefined,
                description: undefined,
              }
            ],
            opts: [
              {
                name: ['-h', '--help'],
                required: undefined,
                negatable: undefined,
                defaultValue: undefined,
                description: 'Display help for command',
                args: []
              },
              {
                name: ['-d', '--dry-run'],
                required: false,
                negatable: undefined,
                description: undefined,
                defaultValue: true,
                args: []
              },
              {
                name: ['-f', '--files'],
                negatable: undefined,
                description: undefined,
                required: undefined,
                defaultValue: undefined,
                args: [
                  {
                    name: 'files',
                    variadic: true,
                    required: undefined,
                    defaultValue: undefined,
                    description: undefined
                  }
                ]
              }
            ],
            subCommands: []
          }
        ]
      })
    })
  })
  describe('withHelpHandler()', () => {
    it('should replace the default help handler', async () => {
      const cmd = new CliCommand('test')
        .withHandler(() => { null })
        .withHelpHandler(() => {
          throw new CillyException('no help')
        })

      await expect(cmd.process(['test', '--help'], { raw: true })).to.eventually.be.rejectedWith(CillyException)
    })
  })
  describe('withHandler()', () => {
    it('should assign the correct handler to the command object', () => {
      const handler = spy(() => { null })
      const cmd = new CliCommand('test').withHandler(handler)
        ; (cmd as any).handler()
      expect(handler.called).to.be.true
    })
    it('should call the handler function with the provided context', async () => {
      const context = { name: 'I am a context object' }

      function handler(): any {
        return this
      }

      const cmd = new CliCommand('test').withHandler(handler, context)
      const callingContext = await cmd.process(['test'], { raw: true })
      expect(callingContext).to.equal(context)
    })
    it('should call the handler function with the CliCommand as the context if no context is provided', async () => {

      function handler(): any {
        return this
      }

      const cmd = new CliCommand('test').withHandler(handler)
      const callingContext = await cmd.process(['test'], { raw: true })
      expect(callingContext).to.equal(cmd)
    })
  })
  describe('withVersion()', () => {
    it('should assign the version', () => {
      const cmd = new CliCommand('test').withVersion('1.2.3')
      expect(cmd.version).to.equal('1.2.3')
    })
    it('should call the passed handler when version flag is passed', () => {
      const handler = spy(() => { null })
      const cmd = new CliCommand('test').withVersion('1.2.3', handler)
      cmd.parse(['test', '--version'], { raw: true })
      expect(handler.called).to.be.true
    })
  })
  describe('withOptions()', () => {
    it('should share options with subcommand if one is defined to inherit', () => {
      const child = new CliCommand('child', { inheritOpts: true })
      const parent = new CliCommand('parent')
        .withSubCommands(child)
        .withOptions({ name: ['-t', '--test'] })

      expect((child as any).opts['test']).to.exist
    })
  })
  describe('help()', () => {
    it('should invoke the helpHandler', () => {
      const helpHandler = spy(() => { null })
      const cmd = new CliCommand('test')
        .withHelpHandler(helpHandler)

      cmd.help()
      expect(helpHandler.called).to.be.true
    })
  })
  describe('splitOptionAssignments()', () => {
    const splitOptionAssingments = (new CliCommand('test') as any).splitOptionAssignments
    it('should correctly split option assignments', () => {
      expect(splitOptionAssingments(['--option=anders', '-o=ba', '--asd', 'dsa']))
        .to.eql(['--option', 'anders', '-o', 'ba', '--asd', 'dsa'])
    })
  })
})
