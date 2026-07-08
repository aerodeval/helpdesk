import { existsSync } from "node:fs";
import path from "path";
import type { PluginOption } from "vite";

interface LocalFrappeUIDevConfigParams {
  mode: string;
  rootDir: string;
}

interface LocalFrappeUIDevConfig {
  useLocalFrappeUI: boolean;
  localFrappeUIPath: string;
  localFrappeUIAliases: Record<string, string>;
}

interface ImportFrappeUIPluginParams {
  useLocalFrappeUI: boolean;
}

type FrappeUIPluginFactory = (...args: any[]) => PluginOption;
type FrappeUIPluginModule = { default: FrappeUIPluginFactory };

async function loadFrappeUIPluginModule(
  modulePath: string
): Promise<FrappeUIPluginModule> {
  return (await import(modulePath)) as FrappeUIPluginModule;
}

export function getLocalFrappeUIDevConfig({
  mode,
  rootDir,
}: LocalFrappeUIDevConfigParams): LocalFrappeUIDevConfig {
  // Use the local frappe-ui clone in every mode when it's installed — it
  // carries experimental exports (FloatingWindow) the npm package doesn't,
  // so production builds need it as much as dev does.
  const localFrappeUIPath = path.resolve(rootDir, "../frappe-ui");
  const useLocalFrappeUI = existsSync(
    path.join(localFrappeUIPath, "node_modules")
  );

  if (existsSync(localFrappeUIPath) && !useLocalFrappeUI) {
    console.warn("⚠️  Local frappe-ui found but dependencies not installed.");
    console.warn("   Run: cd ../frappe-ui && yarn install");
  }

  const localFrappeUIAliases: Record<string, string> = useLocalFrappeUI
    ? {
        "frappe-ui/style.css": path.resolve(
          localFrappeUIPath,
          "src",
          "style.css"
        ),
        // Subpath exports whose physical path differs from the bare-name alias
        // (the alias resolves "frappe-ui/x" as a filesystem path, bypassing the
        // package's exports map). "./editor" maps to src/molecules/editor, so it
        // needs its own alias — and must come before the generic "frappe-ui".
        "frappe-ui/editor": path.resolve(
          localFrappeUIPath,
          "src",
          "molecules",
          "editor"
        ),
        "frappe-ui": localFrappeUIPath,
      }
    : {};

  // @framework/ui lives in the local frappe app (apps/frappe/ui) and isn't
  // published to npm, so resolve it to source in every mode (unlike frappe-ui
  // there is no npm fallback for production builds). Its package exports map
  // "./*" → "src/*", so aliasing the bare name to src/ makes
  // "@framework/ui/components/Composer" resolve too.
  const frameworkUIPath = path.resolve(rootDir, "../../frappe/ui/src");
  if (existsSync(frameworkUIPath)) {
    localFrappeUIAliases["@framework/ui"] = frameworkUIPath;
  }

  return {
    useLocalFrappeUI,
    localFrappeUIPath,
    localFrappeUIAliases,
  };
}

export async function importFrappeUIPlugin({
  useLocalFrappeUI,
}: ImportFrappeUIPluginParams): Promise<FrappeUIPluginFactory> {
  const npmModulePath = "frappe-ui/vite";
  const modulePath = useLocalFrappeUI
    ? "../frappe-ui/vite/index.js"
    : npmModulePath;

  try {
    const module = await loadFrappeUIPluginModule(modulePath);
    return module.default as FrappeUIPluginFactory;
  } catch (error) {
    if (useLocalFrappeUI) {
      console.warn(
        "⚠️  Failed to import local frappe-ui plugin, falling back to npm package"
      );
      console.warn(
        "   Error:",
        error instanceof Error ? error.message : String(error)
      );
      const fallbackModule = await loadFrappeUIPluginModule(npmModulePath);
      return fallbackModule.default as FrappeUIPluginFactory;
    }
    throw error;
  }
}
