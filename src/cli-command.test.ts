import { describe } from 'mocha'
import chai, { expect } from 'chai'
import { stub } from 'sinon'

import { CliCommand, OptionValue } from './cli-command'
import chaiAsPromised from 'chai-as-promised'

chai.use(chaiAsPromised)

describe('CliCommand', () => {
  describe('withOptions', () => {
    it('should pass with an empty list', () => {
      expect(() => new CliCommand('test').withOptions([]))
        .to.not.throw(Error)
    })
    it('should throw on an invalid option', () => {
      expect(() => new CliCommand('test').withOptions([
        { name: ['name with a space in it', ''], desc: '' }
      ])).to.throw(Error)
      expect(() => new CliCommand('test').withOptions([
        { name: ['-v', '--valid'], desc: 'A description', defaultValue: false },
        { name: ['name with a space in it', ''], desc: '' }
      ])).to.throw(Error)
    })
  })
  describe('withArguments', () => {
    it('should pass on an empty list', () => {
      expect(() => new CliCommand('test').withDescription('').withArguments([]))
        .to.not.throw(Error)
    })
    it('should throw on an argument with an invalid name', () => {
      expect(() => new CliCommand('test').withArguments([
        { name: 'invalid name' }
      ])).to.throw(Error)
    })
    it('should throw if the command has subcommands', () => {
      expect(() => new CliCommand('test').withDescription('').withSubCommands([
        new CliCommand('sub')
      ]).withArguments([{ name: 'test' }])).to.throw(Error)
    })
    describe('withSubCommands', () => {
      it('should pass on an empty list', () => {
        it('should pass on an empty list', () => {
          expect(() => new CliCommand('test').withDescription('').withSubCommands([]))
            .to.not.throw(Error)
          expect(() => new CliCommand('test').withDescription('')
            .withArguments([{ name: 'test' }])
            .withSubCommands([]))
            .to.not.throw(Error)
        })
      })
      it('should throw if the command already has arguments', () => {
        expect(() => new CliCommand('test').withDescription('')
          .withArguments([{ name: 'test' }])
          .withSubCommands([new CliCommand('sub')]))
          .to.throw(Error)
      })
    })
  })
  describe('parse', () => {
    let command: CliCommand

    describe('option parsing', () => {
      beforeEach(() => {
        command = new CliCommand('test')
          .withOptions([
            { name: ['-v', '--verbose'], desc: 'Verbose' },
            { name: ['-d', '--dry-run'], desc: 'Dry run' },
            { name: ['-r', '--required'], args: [{ name: 'arg', required: true }], desc: 'Required' },
            { name: ['-o', '--optional'], args: [{ name: 'arg', required: false }], desc: 'Optional' },
            { name: ['-mr', '--many-required'], args: [{ name: 'arg', required: true, variadic: true }], desc: 'Required variadic' },
            { name: ['-mr', '--many-optional'], args: [{ name: 'arg', required: false, variadic: true }], desc: 'Optional variadic' }
          ])
      })
      it('should not assign any options when none are provided', () => {
        const { opts } = command.parse([])
        expect(Object.keys(opts)).to.be.empty
      })
      it('should assign a boolean option with "true" if provided', () => {
        const { opts } = command.parse(['', '', '--verbose', '--dry-run'])
        expect(opts.verbose).to.be.true
        expect(opts.dryRun).to.be.true
      })
      it('should only assign the options that are provided', () => {
        const { opts } = command.parse(['', '', '--verbose'])
        expect(opts.verbose).to.be.true
        expect(opts.dryRun).to.be.undefined
      })
      it('should throw when a required option value is not passed', () => {
        expect(() => command.parse(['', '', '--required', '--verbose'])).to.throw(Error)
      })
    })
    describe('process', () => {
      const testHandler = (): void => { null }
      const subHandler = (): void => { null }

      beforeEach(() => {

        command = new CliCommand('test')
          .withOptions([
            { name: ['-v', '--verbose'], desc: 'Verbose' },
            { name: ['-d', '--dry-run'], desc: 'Dry run' },
          ])
          .withHandler(testHandler)
      })
      it('should be able to parse options from parent command if inheritOpts = true', async () => {
        command.withSubCommands([new CliCommand('sub', { inheritOpts: true }).withHandler(subHandler)])
        await expect(command.process(['', '', 'sub', '--verbose'])).to.not.be.rejected
      })
      it('should not be able to parse options from parent command if inheritOpts = false', async () => {
        command.withSubCommands([new CliCommand('sub', { inheritOpts: false }).withHandler(subHandler)])
        await expect(command.process(['', '', 'sub', '--verbose'])).to.be.rejected
      })
      it('should run the base handler if no matching subcommand is passed', async () => {
        const subCommand = new CliCommand('sub', { inheritOpts: true }).withHandler(subHandler)
        const parent = stub(command, 'handler')
        const sub = stub(subCommand, 'handler')

        await command
          .withSubCommands([subCommand])
          .process(['', '', '--verbose'])

        expect(parent.calledOnce).to.be.true
        expect(sub.called).to.be.false
      })
      it('should run the subcommand handler if a matching subcommand is passed', async () => {
        const subCommand = new CliCommand('sub', { inheritOpts: true }).withHandler(subHandler)
        const parent = stub(command, 'handler')
        const sub = stub(subCommand, 'handler')

        await command
          .withSubCommands([subCommand])
          .process(['', '', 'sub', '--verbose'])

        expect(parent.calledOnce).to.be.false
        expect(sub.called).to.be.true
      })
      it('should set optional arguments with default values to their default value if not provided', async () => {
        const subCommand = new CliCommand('sub123', { inheritOpts: true })
          .withArguments([{ name: 'arg', required: false, defaultValue: 'default' }])
          .withHandler(({ args }) => {
            expect(args.arg).to.be.equal('default')
          })

        await command.withSubCommands([subCommand]).process(['', '', 'sub123', '--verbose'])
      })
      it('should set optional arguments without default values to undefined if not provided', async () => {
        const subCommand = new CliCommand('sub123', { inheritOpts: true })
          .withArguments([{ name: 'arg', required: false }])
          .withHandler(({ args }) => {
            expect(args.arg).to.be.undefined
          })

        await command.withSubCommands([subCommand]).process(['', '', 'sub123', '--verbose'])
      })
      it('should set single-argument option values to the argument value', async () => {
        const subCommand = new CliCommand('sub123', { inheritOpts: true })
          .withOptions([{ name: ['-o', '--option'], desc: '', args: [{ name: 'arg' }] }])
          .withHandler(({ opts }) => {
            expect(opts.option).to.equal('hello')
          })

        await command.withSubCommands([subCommand]).process(['', '', 'sub123', '--option=hello'])
      })
      it('should set multi-argument option values to the key-value objects', async () => {
        const subCommand = new CliCommand('sub123', { inheritOpts: true })
          .withOptions([{ name: ['-o', '--option'], desc: '', args: [{ name: 'first' }, { name: 'second' }] }])
          .withHandler(({ opts }) => {
            expect(opts.option.first).to.equal('firstValue')
            expect(opts.option.second).to.equal('secondValue')
          })

        await command.withSubCommands([subCommand]).process(['', '', 'sub123', '--option', 'firstValue', 'secondValue'])
      })
      it('should set multi-optional-argument option values to the key-value objects with undefined values if not provided', async () => {
        const subCommand = new CliCommand('sub123', { inheritOpts: true })
          .withOptions([{ name: ['-o', '--option'], desc: '', args: [{ name: 'first' }, { name: 'second' }] }])
          .withHandler(({ opts }) => {
            expect(opts.option).to.haveOwnProperty('first')
            expect(opts.option).to.haveOwnProperty('second')
          })

        await command.withSubCommands([subCommand]).process(['', '', 'sub123', '--option'])
      })
      it('should run option validators if provided', async () => {
        const validator = (value: OptionValue, command: { args, opts }): boolean | string => {
          return true
        }
        const subCommand = new CliCommand('sub', { inheritOpts: true })
          .withOptions([{ name: ['-o', '--option'], desc: '', validator: validator }])
          .withHandler(testHandler)

        await command.withSubCommands([subCommand]).process(['', '', 'sub', '--option'])
        expect(false)
      })
      it('should pass option value to validator', async () => {
        const validator = (value: OptionValue, command: { args, opts }): boolean | string => {
          expect(value).to.equal('optionValue')
          return true
        }

        const subCommand = new CliCommand('sub', { inheritOpts: true })
          .withOptions([{ name: ['-o', '--option'], args: [{ name: 'some-value' }], desc: '', validator: validator }])
          .withHandler(testHandler)

        await command.withSubCommands([subCommand]).process(['', '', 'sub', '--option=optionValue'])
      })
      it('should pass args and options to validator', async () => {
        const validator = (value: OptionValue, command: { args, opts }): boolean | string => {
          expect(command.args).to.haveOwnProperty('arg')
          expect(command.opts).to.haveOwnProperty('option')
          expect(command.opts).to.haveOwnProperty('second')
          return true
        }
        const subCommand = new CliCommand('sub', { inheritOpts: true })
          .withArguments([{ name: 'arg' }])
          .withOptions([{ name: ['-o', '--option'], desc: '', validator: validator }, { name: ['-s', '--second'], desc: '' }])
          .withHandler(testHandler)

        await command.withSubCommands([subCommand]).process(['', '', 'sub', '--option', '--second'])
      })
    })
  })
})
