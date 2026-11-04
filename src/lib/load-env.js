import fs from "fs";
import path from "path";
import module from "module";

// Register custom alias resolver for "@/..." imports in standalone scripts
const originalResolve = module._resolveFilename;
module._resolveFilename = function (request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    const relativePath = request.slice(2);
    const absolutePath = path.join(process.cwd(), "src", relativePath);
    return originalResolve.call(this, absolutePath, parent, isMain, options);
  }
  return originalResolve.call(this, request, parent, isMain, options);
};

// Load .env.local manually for standalone script execution
const envLocalPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envLocalPath)) {
  const envConfig = fs.readFileSync(envLocalPath, "utf-8");
  envConfig.split("\n").forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const firstEquals = trimmed.indexOf("=");
      if (firstEquals !== -1) {
        const key = trimmed.substring(0, firstEquals).trim();
        let value = trimmed.substring(firstEquals + 1).trim();
        if (value.startsWith('"') && value.endsWith('"')) {
          value = value.substring(1, value.length - 1);
        } else if (value.startsWith("'") && value.endsWith("'")) {
          value = value.substring(1, value.length - 1);
        }
        process.env[key] = value;
      }
    }
  });
}
