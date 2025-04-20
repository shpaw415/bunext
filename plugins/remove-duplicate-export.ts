import type { BunextPlugin } from "./types";

/**
 * Fixes duplicate exports in Bun.Build output files
 * @param {string} bundleContent - The content of the bundle file
 * @returns {string} - The fixed bundle content
 */
function fixBunBuildExports(bundleContent: string) {
  // Find default exports
  const defaultExportRegex = /export\s+default\s+([^;\s]+)\s*;/g;
  const defaultExports = [...bundleContent.matchAll(defaultExportRegex)];

  // Find named exports
  const namedExportRegex = /export\s*{([^}]*)}/g;
  const namedExports = [...bundleContent.matchAll(namedExportRegex)];

  if (namedExports.length <= 1 && defaultExports.length <= 1) {
    // No duplicate exports to fix
    return bundleContent;
  }

  // Collect all named exports
  const exportedItems = new Map();
  const exportAliases = new Map();

  namedExports.forEach((match) => {
    const exportBlock = match[1];
    const exports = exportBlock.split(",").map((item) => item.trim());

    exports.forEach((exp) => {
      if (exp.includes(" as ")) {
        // Handle aliased exports
        const [original, alias] = exp.split(" as ").map((item) => item.trim());
        exportAliases.set(alias, original);
        exportedItems.set(original, true);
      } else if (exp) {
        exportedItems.set(exp, true);
      }
    });
  });

  // Create a single consolidated named export statement
  let consolidatedExports = [];

  // Add regular exports
  for (const item of exportedItems.keys()) {
    if (!exportAliases.has(item)) {
      consolidatedExports.push(item);
    }
  }

  // Add aliased exports
  for (const [alias, original] of exportAliases.entries()) {
    consolidatedExports.push(`${original} as ${alias}`);
  }

  // Create the result with all default exports preserved
  let result = bundleContent;

  // Replace all named export blocks only if we have named exports
  if (consolidatedExports.length > 0) {
    const newExportStatement = `export {\n  ${consolidatedExports.join(
      ",\n  "
    )}\n};`;

    // Replace all named export blocks
    let firstMatch = true;
    result = result.replace(namedExportRegex, (match) => {
      if (firstMatch) {
        firstMatch = false;
        return newExportStatement;
      }
      return "";
    });
  }

  return result;
}

/**
 * Process a bundle file to fix exports
 * @param {string} filePath - Path to the bundle file
 */
async function processBundleFile(file: Bun.BuildArtifact) {
  try {
    const content = await file.text();
    const fixedContent = fixBunBuildExports(content);
    await Bun.file(file.path).write(fixedContent);
  } catch (error) {
    console.error(`Error processing ${file.path}:`, error);
  }
}

export default {
  after_build: processBundleFile,
} as BunextPlugin;
