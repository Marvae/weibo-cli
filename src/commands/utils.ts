/**
 * Parses a positive integer from user input.
 *
 * @param input Raw CLI option value.
 * @param fallback Value returned when parsing fails or input is not positive.
 * @returns A positive integer.
 * @throws {Error} Never throws. Invalid values resolve to `fallback`.
 */
export function parsePositiveInt(input: string | undefined, fallback: number): number {
  const value = Number(input);
  if (!Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return Math.floor(value);
}

/**
 * Strips basic HTML markup from Weibo text content.
 *
 * @param input Raw HTML string from API payloads.
 * @returns Clean plain text string.
 * @throws {Error} Never throws. Undefined input returns an empty string.
 */
export function stripHtml(input: string | undefined): string {
  if (!input) {
    return '';
  }
  return input
    .replace(/<br\s*\/?>(\n)?/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Prints command output in JSON or table/text format.
 *
 * @param data Output payload to print.
 * @param json Whether to force JSON output.
 * @returns Nothing. Writes to stdout.
 * @throws {Error} May throw if stdout writing fails.
 */
export function outputResult(data: unknown, json: boolean): void {
  if (json) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  if (Array.isArray(data)) {
    if (data.length === 0) {
      console.log('No results.');
      return;
    }
    console.table(data);
    return;
  }

  if (data && typeof data === 'object') {
    console.table([data]);
    return;
  }

  console.log(String(data));
}
