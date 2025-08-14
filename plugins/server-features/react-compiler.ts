import * as babel from "@babel/core";
import ReactCompiler from 'babel-plugin-react-compiler';

export type ReactCompilerOptions = Record<string, unknown>;

export async function transformWithReactCompiler(
    code: string,
    filename: string,
    compilerOptions: ReactCompilerOptions = {}
): Promise<{ code: string; map?: any }> {
    const result = await babel.transformAsync(code, {
        filename,
        plugins: [[ReactCompiler, compilerOptions]], // ⚠️ doit tourner en premier
        parserOpts: { plugins: ['jsx', 'typescript'] },
        ast: false,
        sourceMaps: true,
        configFile: false,
        babelrc: false,
        // Important: laisse ton bundler faire le reste (TS->JS, etc.)
    });

    if (!result || !result.code) {
        throw new Error('Babel transform returned null for React Compiler.');
    }
    return { code: result.code, map: result.map ?? undefined };
}