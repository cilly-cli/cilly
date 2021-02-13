export class CillyException extends Error {
  constructor(public msg: string) {
    super(msg)
  }
}