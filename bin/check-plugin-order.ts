import { initServerSide } from "internal/server/init";
import { pluginLoader } from "internal/server/plugin-loader";



const commandLineArgsList = {
    "--no-undefined-priority": false,
    "--json": false
};

type commandLineArgs = typeof commandLineArgsList

const args = process.argv.slice(2).reduce((acc, curr) => {
    const [key, value] = curr.split("=");
    (acc as commandLineArgs)[key as keyof commandLineArgs] = (value ? value : true) as never;
    if (!(key in commandLineArgsList)) {
        throw new Error(`Unknown argument: ${key}`);
    }
    return acc;

}, {} as commandLineArgs);


await initServerSide();
let plugins = pluginLoader.getPlugins().map(({ name, priority, filePaths }) => ({ name, priority, filePaths }))

if (args["--no-undefined-priority"]) {
    plugins = plugins.filter(p => p.priority !== undefined);
}

if (args["--json"]) {
    plugins = JSON.stringify(plugins) as any;
}

console.log(plugins);


process.exit(0);