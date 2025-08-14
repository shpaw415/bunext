import { router } from "internal/server/router";



export async function getRelatedCssContent(pathName: string): Promise<string> {

    if (process.env.NODE_ENV === "development") {
        const cssPaths = await router.getCssPaths(true);
        return (await Promise.all(cssPaths.map(path => Bun.file(router.buildDir + path).text()))).join("\n");
    }
    console.log(pathName);
    const cssPaths = await router.getCssPaths();
    cssPaths.filter((path) => {

    })
    return "";

}