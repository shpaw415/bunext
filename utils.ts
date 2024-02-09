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
