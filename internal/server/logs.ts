import "./bunext_global.ts";

const separator = "-----------------------------------";
const bunextBlue = ToColor("blue", "BUNEXT:");
const solutionGreen = ToColor("green", "Solution:");

const _isUnicodeSupported = isUnicodeSupported();
export const TerminalIcon = {
  info: ToColor("blue", _isUnicodeSupported ? "ℹ" : "i"),
  success: _isUnicodeSupported ? "✔" : "√",
  warning: ToColor("yellow", _isUnicodeSupported ? "⚠" : "‼"),
  error: ToColor("red", _isUnicodeSupported ? "✖️" : "×"),
  play: ToColor("white", _isUnicodeSupported ? "▶" : ">"),
  line: ToColor("white", "─"),
};

export const TextColor = "rgb(230,230,230)" as const;

export const BuildServerComponentWithHooksWarning = `${separator}
${bunextBlue} this can occur when you export a jsx element that is verify as a server component and has hooks.
${solutionGreen} create a local function component and export a function component that return a reference to this local function component.
Exemple at: ${ToColor(
  "rgb(0,100,255)",
  "https://bunext.mate-team.com/workaround/server-components#hook"
)}
${separator}
`;

export const AfterBunextInitMessage = `${separator}
${ToColor("blue", "Bunext")} is now ready to roll.
Run: \`${ToColor("white", "bun run dev")}\` to start the dev environment!
`;

const clear = "\x1b[0m";
export function ToColor(color: string, value: string | number) {
  try {
    return Bun.color(color, "ansi") + value?.toString() + clear;
  } catch {
    return value;
  }
}

function isUnicodeSupported() {
  const { env } = process;
  const { TERM, TERM_PROGRAM } = env;

  if (process.platform !== "win32") {
    return TERM !== "linux"; // Linux console (kernel)
  }

  return (
    Boolean(env.WT_SESSION) || // Windows Terminal
    Boolean(env.TERMINUS_SUBLIME) || // Terminus (<0.2.27)
    env.ConEmuTask === "{cmd::Cmder}" || // ConEmu and cmder
    TERM_PROGRAM === "Terminus-Sublime" ||
    TERM_PROGRAM === "vscode" ||
    TERM === "xterm-256color" ||
    TERM === "alacritty" ||
    TERM === "rxvt-unicode" ||
    TERM === "rxvt-unicode-256color" ||
    env.TERMINAL_EMULATOR === "JetBrains-JediTerm"
  );
}

export const SessionNotInitedWarning = `${TerminalIcon.error} ${ToColor(
  "red",
  "Error! "
)} ${ToColor(
  TextColor,
  "This error occurred because the plugin did not initialized the session before using it.\n await request.session.initData()"
)}`;

export function getStartLog() {
  return [
    `bunext ${process.env.NODE_ENV}`,
    "",
    ToColor("purple", `${TerminalIcon.play} Bunext ${Bunext.version}`),
    `${TerminalIcon.line} Local:   http://localhost:${serverConfig.HTTPServer.port}`,
    "",
  ].join("\n   ");
}
/**
 * time in ms
 */
export async function benchmark_console<T>(
  note: (time: number, res: T) => string | undefined | false | null,
  measuring: () => Promise<T> | T,
  onProduction = false
) {
  const start = process.hrtime();
  const measuringRes = await measuring();
  const elapsed = Math.round(process.hrtime(start)[1] / 1000000); // divide by a million to get nano to milli
  const res = note(elapsed, measuringRes);
  const enabled = process.env.NODE_ENV == "development" || onProduction;
  res && enabled && console.log(res);
  return measuringRes;
}

export function DevConsole(data: any) {
  const enabled = process.env.NODE_ENV == "development";
  enabled && console.log(data);
}
