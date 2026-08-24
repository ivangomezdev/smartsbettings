export function parseCliArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) throw new TypeError(`Argumento inesperado: ${token}`);
    const [rawKey, inlineValue] = token.slice(2).split(/=(.*)/s, 2);
    const key = rawKey.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    if (rawKey.startsWith("no-")) {
      const positiveKey = rawKey.slice(3).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      options[positiveKey] = false;
    } else if (inlineValue !== undefined) {
      options[key] = inlineValue;
    } else if (argv[index + 1] && !argv[index + 1].startsWith("--")) {
      options[key] = argv[index + 1];
      index += 1;
    } else {
      options[key] = true;
    }
  }
  return options;
}

export function commaList(value) {
  return typeof value === "string" ? value.split(",").map((item) => item.trim()).filter(Boolean) : [];
}

export function positiveInteger(value, fallback) {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new TypeError("Se esperaba un entero positivo.");
  return parsed;
}
