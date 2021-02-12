import { expect } from 'chai'
import { describe } from 'mocha'
import { TokenParser } from './token-parser'


describe('src/token-parser/token-parser.ts', () => {

  describe('isValidName()', () => {
    it('should return false on empty strings', () => {
      expect(TokenParser.isValidName('')).to.be.false
    })
    it('should return true on single-word strings', () => {
      expect(TokenParser.isValidName('word')).to.be.true
    })
    it('should return true on single-word strings with mixed casing and numbers', () => {
      expect(TokenParser.isValidName('worD12s3')).to.be.true
    })
    it('should return true on multi-word strings', () => {
      expect(TokenParser.isValidName('word-with-more-words')).to.be.true
    })
    it('should return false if string contains punctuation', () => {
      expect(TokenParser.isValidName('word-with-!exclamation?marks')).to.be.false
    })
  })
  describe('isShortOptionName()', () => {
    it('should return false on empty strings', () => {
      expect(TokenParser.isShortOptionName('')).to.be.false
    })
    it('should return true on strings with one leading dash', () => {
      expect(TokenParser.isShortOptionName('-w')).to.be.true
      expect(TokenParser.isShortOptionName('-word')).to.be.true
      expect(TokenParser.isShortOptionName('-word-with-more-words')).to.be.true
    })
    it('should return false on strings with no leading dashes', () => {
      expect(TokenParser.isShortOptionName('word')).to.be.false
      expect(TokenParser.isShortOptionName('word-one-more')).to.be.false
    })
    it('should return false on strings with more than one leading dash', () => {
      expect(TokenParser.isShortOptionName('--word')).to.be.false
      expect(TokenParser.isShortOptionName('--word-with-more')).to.be.false
      expect(TokenParser.isShortOptionName('--w')).to.be.false
    })
  })
  describe('isLongOptionName()', () => {
    it('should return false on empty strings', () => {
      expect(TokenParser.isLongOptionName('')).to.be.false
    })
    it('should return false on strings with one leading dash', () => {
      expect(TokenParser.isLongOptionName('-w')).to.be.false
      expect(TokenParser.isLongOptionName('-word')).to.be.false
      expect(TokenParser.isLongOptionName('-word-with-more-words')).to.be.false
    })
    it('should return false on strings with no leading dashes', () => {
      expect(TokenParser.isLongOptionName('word')).to.be.false
      expect(TokenParser.isLongOptionName('word-one-more')).to.be.false
    })
    it('should return true on strings with two leading dashes', () => {
      expect(TokenParser.isLongOptionName('--word')).to.be.true
      expect(TokenParser.isLongOptionName('--word-with-more')).to.be.true
      expect(TokenParser.isLongOptionName('--w')).to.be.true
    })
    it('should return false on strings with m,ore than two leading dashes', () => {
      expect(TokenParser.isLongOptionName('---word')).to.be.false
    })
  })

  describe('isVariadic()', () => {
    it('should return false on empty strings', () => {
      expect(TokenParser.isVariadic('')).to.be.false
    })
    it('should return true if three consecutive periods occur', () => {
      expect(TokenParser.isVariadic('...')).to.be.true
      expect(TokenParser.isVariadic('...somevariable-here')).to.be.true
    })
    it('should return false if there are less than three periods', () => {
      expect(TokenParser.isVariadic('.')).to.be.false
      expect(TokenParser.isVariadic('..')).to.be.false
    })
    it('should return false on strings just containing words', () => {
      expect(TokenParser.isVariadic('word')).to.be.false
      expect(TokenParser.isVariadic('word-more')).to.be.false
    })
  })

  describe('isRequired()', () => {
    it('should return false on strings not starting and ending with <>', () => {
      expect(TokenParser.isRequired('word')).to.be.false
      expect(TokenParser.isRequired('[word]')).to.be.false
      expect(TokenParser.isRequired('!word?')).to.be.false
    })
    it('should return true on strings starting and ending with <>', () => {
      expect(TokenParser.isRequired('<word>')).to.be.true
      expect(TokenParser.isRequired('<word-and-more-words>')).to.be.true
      expect(TokenParser.isRequired('<...variadic-words-here>')).to.be.true
    })
  })

  describe('isOptional()', () => {
    it('should return false on strings not starting and ending with []', () => {
      expect(TokenParser.isOptional('word')).to.be.false
      expect(TokenParser.isOptional('<word>')).to.be.false
      expect(TokenParser.isOptional('!word?')).to.be.false
    })
    it('should return true on strings starting and ending with []', () => {
      expect(TokenParser.isOptional('[word]'), '[word]').to.be.true
      expect(TokenParser.isOptional('[word-and-more-words]'), '[word-and-more-words]').to.be.true
      expect(TokenParser.isOptional('[...variadic-words-here]'), '[...variadic-words-here]').to.be.true
    })
  })

  describe('isValidCliOptionSignature()', () => {
    it('should return true on options without values', () => {
      expect(TokenParser.isValidCliOptionSignature('-o, --output')).to.be.true
      expect(TokenParser.isValidCliOptionSignature('-long-name, --even-longer-name-here')).to.be.true
    })
    it('should return true on options with values', () => {
      expect(TokenParser.isValidCliOptionSignature('-o, --output <required>')).to.be.true
      expect(TokenParser.isValidCliOptionSignature('-long-name, --even-longer-name-here [optional]')).to.be.true
      expect(TokenParser.isValidCliOptionSignature('-long-name, --even-longer-name-here [...optionals] <another-required>')).to.be.true
      expect(TokenParser.isValidCliOptionSignature('-a, --auto-s2tart <...files> [something]')).to.be.true
    })
    it('should return false on options without short names', () => {
      expect(TokenParser.isValidCliOptionSignature('--output <required>')).to.be.false
      expect(TokenParser.isValidCliOptionSignature('--even-longer-name-here [optional]')).to.be.false
      expect(TokenParser.isValidCliOptionSignature('--even-longer-name-here [...optionals] <another-required>')).to.be.false
      expect(TokenParser.isValidCliOptionSignature(', --auto-s2tart <...files> [something]')).to.be.false
    })
    it('should return false on options without long names', () => {
      expect(TokenParser.isValidCliOptionSignature('-o, -- <required>')).to.be.false
      expect(TokenParser.isValidCliOptionSignature('-long-name,  [optional]')).to.be.false
      expect(TokenParser.isValidCliOptionSignature('-long-name [...optionals] <another-required>')).to.be.false
      expect(TokenParser.isValidCliOptionSignature('-a, - <...files> [something]')).to.be.false
    })
  })

  describe('getLongOptionName()', () => {
    it('should return the long option name from a valid option signature', () => {
      expect(TokenParser.getLongOptionName('-o, --output <required>')).to.equal('output')
      expect(TokenParser.getLongOptionName('-long-name, --even-longer-name-here [optional]')).to.equal('even-longer-name-here')
      expect(TokenParser.getLongOptionName('-long-name, --even-longer-name-here [...optionals] <another-required>')).to.equal('even-longer-name-here')
      expect(TokenParser.getLongOptionName('-a, --auto-s2tart <...files> [something]')).to.equal('auto-s2tart')
    })
    it('should throw an exception if no long option name could be found', () => {
      expect(() => TokenParser.getLongOptionName('-o [...variadic]')).to.throw(Error)
    })
  })

  describe('Parser.capitalize()', () => {
    it('should not modify an empty string', () => {
      const input = ''
      expect(TokenParser.capitalize(input)).to.equal(input)
    })
    it('should return a fully capitalized string when input is a single character', () => {
      const input = 'a'
      expect(TokenParser.capitalize(input)).to.equal(input.toUpperCase())
    })
    it('should return a correctly capitalized string when input is a word with more than one letter', () => {
      const inputs = [
        ['word', 'Word'],
        ['test', 'Test'],
        ['as', 'As'],
        ['dsa', 'Dsa'],
        ['multiple', 'Multiple']
      ]
      for (const [lower, capitalized] of inputs) {
        expect(TokenParser.capitalize(lower)).to.equal(capitalized)
      }
    })
  })

  describe('Parser.toCamelCase()', () => {
    it('should not modify an empty string', () => {
      const input = ''
      expect(TokenParser.toCamelCase([input])).to.equal(input)
    })
    it('should not modify a single word string', () => {
      const input = 'single'
      expect(TokenParser.toCamelCase([input])).to.equal(input)
    })
    it('should capitalize the second word in a two-word string', () => {
      expect(TokenParser.toCamelCase(['multiple', 'words'])).to.equal('multipleWords')
    })
    it('should never capitalize the first word', () => {
      const inputs = [
        ['word'],
        ['test', 'words'],
        ['some', 'strings', 'that', 'are', 'long'],
        [''],
        ['a']
      ]
      for (const input of inputs) {
        const camelCased = TokenParser.toCamelCase(input)
        expect(/[a-z]/.test(camelCased[0])).to.be.true
      }
    })
  })
})