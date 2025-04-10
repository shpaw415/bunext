const separator = "-----------------------------------";
const bunextBlue = ToColor("blue", "BUNEXT:");
const solutionGreen = ToColor("green", "Solution:");

export const BuildServerComponentWithHooksWarning = `${separator}
${bunextBlue} this can occur when you export a jsx element that is verify as a server component and has hooks.
${solutionGreen} create a local function component and export a function component that return a reference to this local function component.
Exemple at: ${ToColor(
  "rgb(0,100,255)",
  "https://bunext.mate-team.com/workaround/server-components#hook"
)}
${separator}
`;

const clear = "\x1b[0m";
function ToColor(color: string, value: string) {
  try {
    return Bun.color(color, "ansi") + value + clear;
  } catch {
    return value;
  }
}
