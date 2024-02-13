class _StreamTextRestoreSpecialChar extends TransformStream {
  constructor() {
    super({
      transform(chunk, controller) {
        controller.enqueue(retoreSpecialChar(chunk as string));
      },
    });
  }
}

/**
 * not yet usable
 * https://bun.sh/docs/runtime/nodejs-apis#TextEncoderStream
 */
export class RestoreSpecialCharTransformStream {
  public writable;
  public readable;
  constructor(...strategies: any) {
    const { writable, readable } = new TransformStream({}, ...strategies);
    this.writable = writable;
    this.readable = readable
      .pipeThrough(new TextDecoderStream())
      .pipeThrough(new _StreamTextRestoreSpecialChar())
      .pipeThrough(new TextEncoderStream());
  }
}

export function retoreSpecialChar(data: string) {
  return data
    .replaceAll("&quot;", '"')
    .replaceAll("&gt;", ">")
    .replaceAll("&lt;", "<");
}

export function fnToString(fn: Function) {
  const fnstr = fn.toString();
  const args = fnstr.match(/(\(.*?\))/) as RegExpMatchArray;

  return fn
    .toString()
    .replace(/(function\(.*?\))/, `function ${fn.name}${args[0].toString()}`);
}

export function randomUUID() {
  return String("xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx").replace(
    /[xy]/g,
    (character) => {
      const random = (Math.random() * 16) | 0;
      const value = character === "x" ? random : (random & 0x3) | 0x8;

      return value.toString(16);
    }
  );
}
