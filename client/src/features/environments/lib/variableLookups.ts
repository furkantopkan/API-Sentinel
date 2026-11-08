import type { Environment, VariableLookup } from '@api-sentinel/shared';

export interface EditorVariables {
  /** For the Final URL preview: secrets appear as `***`. */
  display: VariableLookup;
  /**
   * For validation before sending. The browser never has secret values, so
   * they are replaced by `0`, which is valid in a URL, in a JSON string and
   * as a bare JSON value: a secret alone can never cause a false error.
   */
  validate: VariableLookup;
}

export const NO_VARIABLES: EditorVariables = {
  display: () => undefined,
  validate: () => undefined,
};

export const SECRET_DISPLAY = '***';
const SECRET_FOR_VALIDATION = '0';

/** Builds the browser-side lookups. Real secret values are resolved only on the server. */
export function editorVariablesFor(environment: Environment | undefined): EditorVariables {
  if (!environment) return NO_VARIABLES;
  const enabled = new Map(
    environment.variables.filter((v) => v.enabled).map((variable) => [variable.key, variable]),
  );
  const lookup = (secretValue: string): VariableLookup => {
    return (name) => {
      const variable = enabled.get(name);
      if (!variable) return undefined;
      return variable.isSecret ? secretValue : variable.value;
    };
  };
  return { display: lookup(SECRET_DISPLAY), validate: lookup(SECRET_FOR_VALIDATION) };
}
