import { describe } from 'mocha'
import chai, { expect } from 'chai'
import { stub } from 'sinon'

import { CliCommand } from './cli-command'
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
      it('should run the base handler if no matching subcommand is passed', () => {
        const subCommand = new CliCommand('sub', { inheritOpts: true }).withHandler(subHandler)
        const parent = stub(command, 'handler')
        const sub = stub(subCommand, 'handler')

        void command
          .withSubCommands([subCommand])
          .process(['', '', '--verbose'])

        expect(parent.calledOnce).to.be.true
        expect(sub.called).to.be.false
      })
      it('should run the subcommand handler if a matching subcommand is passed', () => {
        const subCommand = new CliCommand('sub', { inheritOpts: true }).withHandler(subHandler)
        const parent = stub(command, 'handler')
        const sub = stub(subCommand, 'handler')

        void command
          .withSubCommands([subCommand])
          .process(['', '', 'sub', '--verbose'])

        expect(parent.calledOnce).to.be.false
        expect(sub.called).to.be.true
      })
      it('should set arguments to their default value', async (done) => {
        const subCommand = new CliCommand('sub', { inheritOpts: true })
          .withArguments([{ name: 'arg', defaultValue: 'default' }])
          .withHandler(({ args }) => {
            expect(args.arg).to.be.equal('default')
            done()
          })

        await command.withSubCommands([subCommand]).process(['', '', 'sub', '--verbose'])
      })
    })
  })
})
