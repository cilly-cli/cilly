export class CillyException extends Error {
  constructor(public msg: string, extra?: any) {
    super(`${msg}${extra ? JSON.stringify(extra) : ''}`)
  }
}