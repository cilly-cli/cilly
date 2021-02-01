import { expect } from 'chai'
import { describe } from 'mocha'
import { Parser } from './parser'


describe('src/parser/parser.ts', () => {

  describe('isValidName()', () => {
    it('should return false on empty strings', () => {
      expect(Parser.isValidName('')).to.be.false
    })
    it('should return true on single-word strings', () => {
      expect(Parser.isValidName('word')).to.be.true
    })
    it('should return true on single-word strings with mixed casing and numbers', () => {
      expect(Parser.isValidName('worD12s3')).to.be.true
    })
    it('should return true on multi-word strings', () => {
      expect(Parser.isValidName('word-with-more-words')).to.be.true
    })
    it('should return false if string contains punctuation', () => {
      expect(Parser.isValidName('word-with-!exclamation?marks')).to.be.false
    })
  })
  describe('isShortOptionName()', () => {
    it('should return false on empty strings', () => {
      expect(Parser.isShortOptionName('')).to.be.false
    })
    it('should return true on strings with one leading dash', () => {
      expect(Parser.isShortOptionName('-w')).to.be.true
      expect(Parser.isShortOptionName('-word')).to.be.true
      expect(Parser.isShortOptionName('-word-with-more-words')).to.be.true
    })
    it('should return false on strings with no leading dashes', () => {
      expect(Parser.isShortOptionName('word')).to.be.false
      expect(Parser.isShortOptionName('word-one-more')).to.be.false
    })
    it('should return false on strings with more than one leading dash', () => {
      expect(Parser.isShortOptionName('--word')).to.be.false
      expect(Parser.isShortOptionName('--word-with-more')).to.be.false
      expect(Parser.isShortOptionName('--w')).to.be.false
    })
  })
  describe('isLongOptionName()', () => {
    it('should return false on empty strings', () => {
      expect(Parser.isLongOptionName('')).to.be.false
    })
    it('should return false on strings with one leading dash', () => {
      expect(Parser.isLongOptionName('-w')).to.be.false
      expect(Parser.isLongOptionName('-word')).to.be.false
      expect(Parser.isLongOptionName('-word-with-more-words')).to.be.false
    })
    it('should return false on strings with no leading dashes', () => {
      expect(Parser.isLongOptionName('word')).to.be.false
      expect(Parser.isLongOptionName('word-one-more')).to.be.false
    })
    it('should return true on strings with two leading dashes', () => {
      expect(Parser.isLongOptionName('--word')).to.be.true
      expect(Parser.isLongOptionName('--word-with-more')).to.be.true
      expect(Parser.isLongOptionName('--w')).to.be.true
    })
    it('should return false on strings with m,ore than two leading dashes', () => {
      expect(Parser.isLongOptionName('---word')).to.be.false
    })
  })

  describe('isVariadic()', () => {
    it('should return false on empty strings', () => {
      expect(Parser.isVariadic('')).to.be.false
    })
    it('should return true if three consecutive periods occur', () => {
      expect(Parser.isVariadic('...')).to.be.true
      expect(Parser.isVariadic('...somevariable-here')).to.be.true
    })
    it('should return false if there are less than three periods', () => {
      expect(Parser.isVariadic('.')).to.be.false
      expect(Parser.isVariadic('..')).to.be.false
    })
    it('should return false on strings just containing words', () => {
      expect(Parser.isVariadic('word')).to.be.false
      expect(Parser.isVariadic('word-more')).to.be.false
    })
  })

  describe('isRequired()', () => {
    it('should return false on strings not starting and ending with <>', () => {
      expect(Parser.isRequired('word')).to.be.false
      expect(Parser.isRequired('[word]')).to.be.false
      expect(Parser.isRequired('!word?')).to.be.false
    })
    it('should return true on strings starting and ending with <>', () => {
      expect(Parser.isRequired('<word>')).to.be.true
      expect(Parser.isRequired('<word-and-more-words>')).to.be.true
      expect(Parser.isRequired('<...variadic-words-here>')).to.be.true
    })
  })

  describe('isOptional()', () => {
    it('should return false on strings not starting and ending with []', () => {
      expect(Parser.isOptional('word')).to.be.false
      expect(Parser.isOptional('<word>')).to.be.false
      expect(Parser.isOptional('!word?')).to.be.false
    })
    it('should return true on strings starting and ending with []', () => {
      expect(Parser.isOptional('[word]'), '[word]').to.be.true
      expect(Parser.isOptional('[word-and-more-words]'), '[word-and-more-words]').to.be.true
      expect(Parser.isOptional('[...variadic-words-here]'), '[...variadic-words-here]').to.be.true
    })
  })

  describe('isValidCliOptionSignature()', () => {
    it('should return true on options without values', () => {
      expect(Parser.isValidCliOptionSignature('-o, --output')).to.be.true
      expect(Parser.isValidCliOptionSignature('-long-name, --even-longer-name-here')).to.be.true
    })
    it('should return true on options with values', () => {
      expect(Parser.isValidCliOptionSignature('-o, --output <required>')).to.be.true
      expect(Parser.isValidCliOptionSignature('-long-name, --even-longer-name-here [optional]')).to.be.true
      expect(Parser.isValidCliOptionSignature('-long-name, --even-longer-name-here [...optionals] <another-required>')).to.be.true
      expect(Parser.isValidCliOptionSignature('-a, --auto-s2tart <...files> [something]')).to.be.true
    })
    it('should return false on options without short names', () => {
      expect(Parser.isValidCliOptionSignature('--output <required>')).to.be.false
      expect(Parser.isValidCliOptionSignature('--even-longer-name-here [optional]')).to.be.false
      expect(Parser.isValidCliOptionSignature('--even-longer-name-here [...optionals] <another-required>')).to.be.false
      expect(Parser.isValidCliOptionSignature(', --auto-s2tart <...files> [something]')).to.be.false
    })
    it('should return false on options without long names', () => {
      expect(Parser.isValidCliOptionSignature('-o, -- <required>')).to.be.false
      expect(Parser.isValidCliOptionSignature('-long-name,  [optional]')).to.be.false
      expect(Parser.isValidCliOptionSignature('-long-name [...optionals] <another-required>')).to.be.false
      expect(Parser.isValidCliOptionSignature('-a, - <...files> [something]')).to.be.false
    })
  })

  describe('getLongOptionName()', () => {
    it('should return the long option name from a valid option signature', () => {
      expect(Parser.getLongOptionName('-o, --output <required>')).to.equal('output')
      expect(Parser.getLongOptionName('-long-name, --even-longer-name-here [optional]')).to.equal('even-longer-name-here')
      expect(Parser.getLongOptionName('-long-name, --even-longer-name-here [...optionals] <another-required>')).to.equal('even-longer-name-here')
      expect(Parser.getLongOptionName('-a, --auto-s2tart <...files> [something]')).to.equal('auto-s2tart')
    })
    it('should throw an exception if no long option name could be found', () => {
      expect(() => Parser.getLongOptionName('-o [...variadic]')).to.throw(Error)
    })
  })

  describe('Parser.capitalize()', () => {
    it('should not modify an empty string', () => {
      const input = ''
      expect(Parser.capitalize(input)).to.equal(input)
    })
    it('should return a fully capitalized string when input is a single character', () => {
      const input = 'a'
      expect(Parser.capitalize(input)).to.equal(input.toUpperCase())
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
        expect(Parser.capitalize(lower)).to.equal(capitalized)
      }
    })
  })

  describe('Parser.toCamelCase()', () => {
    it('should not modify an empty string', () => {
      const input = ''
      expect(Parser.toCamelCase([input])).to.equal(input)
    })
    it('should not modify a single word string', () => {
      const input = 'single'
      expect(Parser.toCamelCase([input])).to.equal(input)
    })
    it('should capitalize the second word in a two-word string', () => {
      expect(Parser.toCamelCase(['multiple', 'words'])).to.equal('multipleWords')
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
        const camelCased = Parser.toCamelCase(input)
        expect(/[a-z]/.test(camelCased[0])).to.be.true
      }
    })
  })
})