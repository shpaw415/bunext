"use client";

export function generateUuid() {
  return String("xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx").replace(
    /[xy]/g,
    (character) => {
      const random = (Math.random() * 16) | 0;
      const value = character === "x" ? random : (random & 0x3) | 0x8;

      return value.toString(16);
    }
  );
}

export function generateRandomString(length: number) {
  let result = "";
  const characters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const charactersLength = characters.length;

  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }

  return result;
}

export function normalize(path: string) {
  // remove multiple slashes
  path = path.replace(/\/+/g, "/");
  // remove leading slash, will be added further
  if (path.startsWith("/")) path = path.substring(1);
  // remove trailing slash
  if (path.endsWith("/")) path = path.slice(0, -1);
  let segments = path.split("/");
  let normalizedPath = "/";
  for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex++) {
    if (segments[segmentIndex] === "." || segments[segmentIndex] === "") {
      // skip single dots and empty segments
      continue;
    }
    if (segments[segmentIndex] === "..") {
      // go up one level if possible
      normalizedPath = normalizedPath.substring(
        0,
        normalizedPath.lastIndexOf("/") + 1
      );
      continue;
    }
    // append path segment
    if (!normalizedPath.endsWith("/")) normalizedPath = normalizedPath + "/";
    normalizedPath = normalizedPath + segments[segmentIndex];
  }
  return normalizedPath;
}

export function dataURLtoFile(dataurl: string, filename: string) {
  var arr = dataurl.split(","),
    mime = arr
      .at(0)
      ?.match(/:(.*?);/)
      ?.at(1),
    bstr = atob(arr[arr.length - 1]),
    n = bstr.length,
    u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new File([u8arr], filename, { type: mime });
}

export async function urltoFile(
  url: string,
  filename: string,
  mimeType: string
) {
  if (url.startsWith("data:")) {
    var arr = url.split(","),
      mime = arr
        .at(0)
        ?.match(/:(.*?);/)
        ?.at(1),
      bstr = atob(arr[arr.length - 1]),
      n = bstr.length,
      u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    var file = new File([u8arr], filename, { type: mime || mimeType });
    return Promise.resolve(file);
  }
  return fetch(url)
    .then((res) => res.arrayBuffer())
    .then((buf) => new File([buf], filename, { type: mimeType }));
}

export function emailIsValid(email: string) {
  const patt = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return patt.test(email);
}

export function fileExtension(fileName: string) {
  return fileName.split(".").pop();
}

const _utils = {
  /**
   * Random value from given props
   */
  randomFrom,
  /**
   * Random number between min-max
   */
  randomIntFromInterval,
  /**
   * Random string of length: len
   */
  randomString: generateRandomString,
  /**
   * Random Date between from and to
   */
  randomDate,
  /**
   * Random Boolean
   */
  randomBool,
} as const;

export function randomBool() {
  return Boolean(randomIntFromInterval(0, 1));
}

export function randomDate(from: Date, to: Date) {
  const retDate = new Date();
  retDate.setTime(randomIntFromInterval(from.getTime(), to.getTime()));
  return retDate;
}

export function makeFakeData<DataType, ContextType extends Object>(
  len: number,
  makeData: (context: Partial<ContextType>, utils: typeof _utils) => DataType
) {
  const _context = {} as ContextType;
  return Array(len)
    .fill(null)
    .map(() => makeData(_context, _utils)) as Array<DataType>;
}

export function randomIntFromInterval(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1) + min);
}

export function randomFrom<T>(...props: T[]) {
  return props[randomIntFromInterval(0, props.length - 1)];
}
