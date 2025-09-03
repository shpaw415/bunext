import { renderToString } from "react-dom/server";
import { router } from "../../internal/server/router";
import type { JSX } from "react";
import { BunextRequest } from "../server/bunextRequest";
import type { JsxToStringWorkerMessage } from "./types";
import { ErrorFallback } from "../../components/fallback";
import { DirectiveTool } from "plugins/utils";
import { initServerSide } from "internal/server/init";

await initServerSide(false);

// Redirect all console methods to send process messages
function createConsoleRedirect(methodName: keyof typeof console) {
  return (...args: any[]) => {
    // Serialize arguments to handle class objects and other complex types
    const serializedArgs = args.map(arg => {
      try {
        // Handle Error objects specially to capture all error properties
        if (arg instanceof Error) {
          return {
            __className: 'Error',
            name: arg.name,
            message: arg.message,
            stack: arg.stack,
            cause: arg.cause,
            // Include any additional enumerable properties
            ...Object.getOwnPropertyNames(arg).reduce((acc, key) => {
              if (!['name', 'message', 'stack', 'cause'].includes(key)) {
                try {
                  acc[key] = (arg as any)[key];
                } catch { }
              }
              return acc;
            }, {} as any)
          };
        }

        // For objects and class instances, use JSON.stringify with a replacer
        if (typeof arg === 'object' && arg !== null) {
          return JSON.parse(JSON.stringify(arg, (key, value) => {
            // Handle Error objects in nested structures
            if (value instanceof Error) {
              return {
                __className: 'Error',
                name: value.name,
                message: value.message,
                stack: value.stack,
                cause: value.cause
              };
            }
            // Handle class instances by including constructor name
            if (typeof value === 'object' && value !== null && value.constructor !== Object) {
              return {
                __className: value.constructor.name,
                ...value
              };
            }
            return value;
          }));
        }
        return arg;
      } catch (error) {
        // Fallback for non-serializable objects
        return String(arg);
      }
    });

    process.send?.({
      type: methodName,
      message: serializedArgs,
    } as JsxToStringWorkerMessage);
  };
}


function RedirectAllConsoles() {
  // Override all console methods
  console.log = createConsoleRedirect('log');
  console.error = createConsoleRedirect('error');
  console.warn = createConsoleRedirect('warn');
  console.info = createConsoleRedirect('info');
  console.debug = createConsoleRedirect('debug');
  console.trace = createConsoleRedirect('trace');
  console.table = createConsoleRedirect('table');
  console.dir = createConsoleRedirect('dir');
  console.dirxml = createConsoleRedirect('dirxml');
  console.group = createConsoleRedirect('group');
  console.groupCollapsed = createConsoleRedirect('groupCollapsed');
  console.groupEnd = createConsoleRedirect('groupEnd');
  console.count = createConsoleRedirect('count');
  console.countReset = createConsoleRedirect('countReset');
  console.time = createConsoleRedirect('time');
  console.timeEnd = createConsoleRedirect('timeEnd');
  console.timeLog = createConsoleRedirect('timeLog');
  console.clear = createConsoleRedirect('clear');
  console.assert = createConsoleRedirect('assert');
}

RedirectAllConsoles();

const modulePath = process.env.module_path as string;
const props = JSON.parse(process.env.props as string) as {
  props: any;
  params: Record<string, unknown>;
};
const url = process.env.url as string;

const match = router.server?.match(url);

if (!match) process.exit(1);

let jsx: JSX.Element;

const req = new BunextRequest({
  request: new Request(url),
  response: new Response(),
  manager: undefined as any,
  directivesTools: await DirectiveTool.getInstance()
});
req.path = match.name;

try {

  jsx = await router.CreateDynamicPage(modulePath, props, match, req);
  process.send?.({
    type: "jsxToString",
    jsx: renderToString(jsx),
  } as JsxToStringWorkerMessage);

} catch (error) {
  console.error(`Error creating dynamic page: `, error);
  process.send?.({
    type: "jsxToString",
    jsx: renderToString(<ErrorFallback error={error as Error} />),
  } as JsxToStringWorkerMessage);

}




process.exit();
