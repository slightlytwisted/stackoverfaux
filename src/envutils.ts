// Helper functions for working with environment variables

// Returns the value of the given environment variable. Causes the current process to exit with an error if the
// variable is not set, unless a defaultValue is provided.
export function assertEnvVar(name: string, defaultValue?: string): string {
  const value = process.env[name];
  if (!value) {
    if (defaultValue == undefined) {
      console.error(`Environment variable '${name}' not set!`);
      process.exit(1);
    }
    return defaultValue;
  }
  return value;
}

export function assertEnvVarNumber(
  name: string,
  defaultValue?: string,
): number {
  const value = Number(assertEnvVar(name, defaultValue));
  if (isNaN(value)) {
    console.error(
      `Value of environment variable '${name}' could not be parsed as a number!`,
    );
    process.exit(1);
  }
  return value;
}

export function assertEnvVarBool(name: string, defaultValue?: string): boolean {
  const value = assertEnvVar(name, defaultValue);
  switch (value.toLowerCase()) {
    case "true":
      return true;
    case "false":
      return false;
    default:
      console.error(
        `Value of environment variable '${name}' could not be parsed as a boolean!`,
      );
      process.exit(1);
  }
}
