declare module "qrcode-terminal" {
  interface Options {
    small?: boolean;
  }
  function generate(text: string, options?: Options, callback?: (code: string) => void): void;
  export default { generate };
}
