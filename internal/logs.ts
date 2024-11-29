

export const BuildServerComponantWithHooksWarning =
    `-----------------------------------
${ToColor("blue", "BUNEXT:")} this can occure when you export a jsx element that is verify as a server componant and has hooks.
${ToColor("green", "Solution:")} create a local function componant and export a function componant that return a reference to this local function componant.
Exemple at: ${ToColor("rgb(0,100,255)", "https://bunext.mate-team.com/workaround/server-componants#hook")}
-----------------------------------
`;


const clear = "\x1b[0m";
function ToColor(color: string, value: string) {
    return Bun.color(color, "ansi") + value + clear;
}
