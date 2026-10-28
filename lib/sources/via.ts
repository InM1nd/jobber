/** The line that says where a JSearch job was listed; Jobber shows it as "via LinkedIn". Pure: safe for client code. */
export const viaLine = (publisher: string) => `Listed on ${publisher} (found through Google for Jobs).`;

export function viaOf(description: string | null | undefined): string | null {
  return description?.match(/Listed on ([^\n(]{2,60}) \(found through Google for Jobs\)\.\s*$/)?.[1]?.trim() || null;
}
