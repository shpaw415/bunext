"use client";

/**
 * Generates a random UUID (Universally Unique Identifier) string.
 * Uses version 4 UUID format with random values.
 * 
 * @returns {string} A UUID string in the format xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
 * @example
 * ```typescript
 * const id = generateUuid();
 * console.log(id); // "f47ac10b-58cc-4372-a567-0e02b2c3d479"
 * ```
 */
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

/**
 * Generates a random string of specified length using alphanumeric characters.
 * 
 * @param {number} length - The desired length of the random string
 * @returns {string} A random string containing uppercase letters, lowercase letters, and digits
 * @example
 * ```typescript
 * const randomStr = generateRandomString(10);
 * console.log(randomStr); // "aB3dE7fG9h"
 * ```
 */
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

/**
 * Normalizes a file path by resolving relative path segments and cleaning up slashes.
 * Removes duplicate slashes, resolves "." and ".." segments, and ensures proper leading slash.
 * 
 * @param {string} path - The path string to normalize
 * @returns {string} The normalized path with proper slash formatting
 * @example
 * ```typescript
 * normalize("/path//to/../file.txt"); // "/path/file.txt"
 * normalize("./folder/./file.txt");   // "/folder/file.txt"
 * normalize("/path/to/file/");        // "/path/to/file"
 * ```
 */
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

/**
 * Converts a data URL string to a File object.
 * Parses the base64 encoded data and extracts the MIME type to create a proper File instance.
 * 
 * @param {string} dataurl - The data URL string (e.g., "data:image/png;base64,...")
 * @param {string} filename - The name to assign to the created file
 * @returns {File} A File object created from the data URL
 * @example
 * ```typescript
 * const dataUrl = "data:text/plain;base64,SGVsbG8gV29ybGQ=";
 * const file = dataURLtoFile(dataUrl, "hello.txt");
 * console.log(file.name); // "hello.txt"
 * console.log(file.type); // "text/plain"
 * ```
 */
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

/**
 * Converts a URL (data URL or HTTP URL) to a File object.
 * For data URLs, it decodes the base64 content. For HTTP URLs, it fetches the content.
 * 
 * @param {string} url - The URL to convert (data URL or HTTP URL)
 * @param {string} filename - The name to assign to the created file
 * @param {string} mimeType - The MIME type to use (fallback for data URLs, primary for HTTP URLs)
 * @returns {Promise<File>} A promise that resolves to a File object
 * @example
 * ```typescript
 * // With data URL
 * const dataUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";
 * const file1 = await urltoFile(dataUrl, "pixel.png", "image/png");
 * 
 * // With HTTP URL
 * const file2 = await urltoFile("https://example.com/image.jpg", "image.jpg", "image/jpeg");
 * ```
 */
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

/**
 * Validates if a string is a properly formatted email address.
 * Uses a regular expression to check for valid email format.
 * 
 * @param {string} email - The email string to validate
 * @returns {boolean} True if the email format is valid, false otherwise
 * @example
 * ```typescript
 * emailIsValid("user@example.com");     // true
 * emailIsValid("invalid.email");        // false
 * emailIsValid("user@domain.co.uk");    // true
 * emailIsValid("user@");                // false
 * ```
 */
export function emailIsValid(email: string) {
  const patt = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return patt.test(email);
}

/**
 * Extracts the file extension from a filename.
 * Returns the last part after the final dot in the filename.
 * 
 * @param {string} fileName - The filename to extract the extension from
 * @returns {string | undefined} The file extension (without the dot) or undefined if no extension
 * @example
 * ```typescript
 * fileExtension("document.pdf");     // "pdf"
 * fileExtension("image.jpeg");       // "jpeg"
 * fileExtension("archive.tar.gz");   // "gz"
 * fileExtension("noextension");      // undefined
 * ```
 */
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

/**
 * Generates a random boolean value.
 * 
 * @returns {boolean} A randomly generated true or false value
 * @example
 * ```typescript
 * const coinFlip = randomBool();
 * console.log(coinFlip); // true or false
 * ```
 */
export function randomBool() {
  return Boolean(randomIntFromInterval(0, 1));
}

/**
 * Generates a random date between two given dates.
 * 
 * @param {Date} from - The start date (inclusive)
 * @param {Date} to - The end date (inclusive)
 * @returns {Date} A random date between the from and to dates
 * @example
 * ```typescript
 * const startDate = new Date('2023-01-01');
 * const endDate = new Date('2023-12-31');
 * const randomDate = randomDate(startDate, endDate);
 * console.log(randomDate); // Random date in 2023
 * ```
 */
export function randomDate(from: Date, to: Date) {
  const retDate = new Date();
  retDate.setTime(randomIntFromInterval(from.getTime(), to.getTime()));
  return retDate;
}

/**
 * Generates an array of fake data using a provided factory function.
 * The factory function receives a shared context object and utility functions to generate realistic test data.
 * 
 * @template DataType - The type of data objects to generate
 * @template ContextType - The type of the shared context object
 * @param {number} len - The number of fake data items to generate
 * @param {(context: Partial<ContextType>, utils: typeof _utils) => DataType} makeData - Factory function that creates a single data item
 * @returns {Array<DataType>} An array of generated fake data items
 * @example
 * ```typescript
 * interface User {
 *   id: string;
 *   name: string;
 *   email: string;
 *   age: number;
 * }
 * 
 * const fakeUsers = makeFakeData<User, {}>(5, (context, utils) => ({
 *   id: utils.randomString(8),
 *   name: utils.randomFrom("Alice", "Bob", "Charlie"),
 *   email: `user${utils.randomIntFromInterval(1, 1000)}@example.com`,
 *   age: utils.randomIntFromInterval(18, 65)
 * }));
 * ```
 */
export function makeFakeData<DataType, ContextType extends Object>(
  len: number,
  makeData: (context: Partial<ContextType>, utils: typeof _utils) => DataType
) {
  const _context = {} as ContextType;
  return Array(len)
    .fill(null)
    .map(() => makeData(_context, _utils)) as Array<DataType>;
}

/**
 * Generates a random integer between the specified minimum and maximum values (inclusive).
 * 
 * @param {number} min - The minimum value (inclusive)
 * @param {number} max - The maximum value (inclusive)
 * @returns {number} A random integer between min and max
 * @example
 * ```typescript
 * randomIntFromInterval(1, 6);   // Random number between 1 and 6 (dice roll)
 * randomIntFromInterval(0, 100); // Random number between 0 and 100
 * randomIntFromInterval(5, 5);   // Always returns 5
 * ```
 */
export function randomIntFromInterval(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1) + min);
}

/**
 * Selects a random element from the provided arguments.
 * 
 * @template T - The type of the elements to choose from
 * @param {...T[]} props - The elements to randomly choose from
 * @returns {T} A randomly selected element from the provided arguments
 * @example
 * ```typescript
 * randomFrom("apple", "banana", "cherry");     // Returns one of the fruits
 * randomFrom(1, 2, 3, 4, 5);                  // Returns one of the numbers
 * randomFrom("red", "green", "blue");         // Returns one of the colors
 * ```
 */
export function randomFrom<T>(...props: T[]) {
  return props[randomIntFromInterval(0, props.length - 1)];
}

/**
 * Converts a File or Blob object to a base64 encoded data URL string.
 * 
 * @param {Blob} file - The File or Blob object to convert
 * @returns {Promise<string | ArrayBuffer | null>} A promise that resolves to the base64 data URL string
 * @example
 * ```typescript
 * const file = new File(["Hello World"], "hello.txt", { type: "text/plain" });
 * const base64 = await fileToBase64(file);
 * console.log(base64); // "data:text/plain;base64,SGVsbG8gV29ybGQ="
 * 
 * // With an image file
 * const imageFile = // ... get image file from input
 * const imageBase64 = await fileToBase64(imageFile);
 * // Use imageBase64 as src for an img element
 * ```
 */
export function fileToBase64(file: Blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
  });
}
