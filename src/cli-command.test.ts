import chai, { expect } from 'chai'
import chaiAsPromised from 'chai-as-promised'
import { CliCommand } from './cli-command'

chai.use(chaiAsPromised)

describe('CliCommand', () => {
  describe('parse()', () => {
    it('should generate the appropriate output', () => {
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
  })
})