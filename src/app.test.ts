import { describe } from 'mocha'
import { expect } from 'chai'

describe('Our very first unit tests :-)', () => {
  const syncFunc = (): boolean => true
  const asyncFunc = async (): Promise<boolean> => Promise.resolve(false)

  describe('A synchronous function', () => {
    it('should return true', () => {
      expect(syncFunc()).to.be.true
    })
  })

  describe('An asynchronous function', () => {
    it('should return false', async () => {
      expect(await asyncFunc()).to.be.false
    })
  })
})
