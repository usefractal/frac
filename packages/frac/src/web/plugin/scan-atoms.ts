import {
  existsSync,
  globSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join, parse, resolve } from "node:path";
import { hasDefaultExport } from "./validate-view.js";

export interface DiscoveredAtom {
  name: string;
  filePath: string;
}

export interface InvalidAtom {
  filePath: string;
}

export interface ScannedAtoms {
  valid: DiscoveredAtom[];
  invalid: InvalidAtom[];
}

export function scanAtomsSync(atomsDir: string): ScannedAtoms {
  const flatPattern = resolve(atomsDir, "*.{tsx,jsx}");
  const dirPattern = resolve(atomsDir, "*/index.{tsx,jsx}");

  const flatFiles = globSync(flatPattern).map((file) => ({
    name: parse(file).name,
    filePath: file,
  }));

  const dirFiles = globSync(dirPattern).map((file) => ({
    name: basename(dirname(file)),
    filePath: file,
  }));

  const candidates = [...flatFiles, ...dirFiles].filter((candidate) => {
    return candidate.name !== "index";
  });

  const valid: DiscoveredAtom[] = [];
  const invalid: InvalidAtom[] = [];

  for (const candidate of candidates) {
    const code = readFileSync(candidate.filePath, "utf-8");
    if (hasDefaultExport(code, candidate.filePath)) {
      valid.push(candidate);
    } else {
      invalid.push({ filePath: candidate.filePath });
    }
  }

  return { valid, invalid };
}

export function assertUniqueAtomNames(atoms: DiscoveredAtom[]): void {
  const nameMap = new Map<string, string[]>();

  for (const atom of atoms) {
    const paths = nameMap.get(atom.name) ?? [];
    paths.push(atom.filePath);
    nameMap.set(atom.name, paths);
  }

  for (const [name, paths] of nameMap) {
    if (paths.length > 1) {
      throw new Error(
        `frac: duplicate Fractal name "${name}" resolved from:\n  - ${paths.join("\n  - ")}\nRename one of the files to avoid the conflict.`,
      );
    }
  }
}

export function discoverAtomsSync(atomsDir: string): DiscoveredAtom[] {
  const { valid } = scanAtomsSync(atomsDir);
  assertUniqueAtomNames(valid);
  return valid;
}

export function generateAtomsDts(atoms: DiscoveredAtom[]): string {
  const entries = atoms.map((a) => `    "${a.name}": true;`).join("\n");
  return [
    "export {};",
    "",
    'declare module "@usefractal/frac/server" {',
    "  interface AtomNameRegistry {",
    entries,
    "  }",
    "}",
    "",
  ].join("\n");
}

export function writeAtomsDts(
  projectRoot: string,
  atoms: DiscoveredAtom[],
): void {
  const dir = join(projectRoot, ".frac");
  mkdirSync(dir, { recursive: true });

  const filePath = join(dir, "atoms.d.ts");
  const content = generateAtomsDts(atoms);

  try {
    const existing = readFileSync(filePath, "utf-8");
    if (existing === content) {
      return;
    }
  } catch {
    // file does not exist yet
  }

  writeFileSync(filePath, content, "utf-8");
}

export function scanAndWriteAtomsDts(
  root: string,
  atomsDir?: string,
): DiscoveredAtom[] {
  const rawDir =
    atomsDir ??
    (existsSync(resolve(root, "src/fractals")) ? "src/fractals" : "src/atoms");
  const resolvedDir = isAbsolute(rawDir) ? rawDir : resolve(root, rawDir);

  const atoms = discoverAtomsSync(resolvedDir);
  writeAtomsDts(root, atoms);

  return atoms;
}
