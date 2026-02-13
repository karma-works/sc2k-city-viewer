export function boolToYn(val: boolean | undefined): string {
  return val ? 'Y' : 'N';
}

export function boolToInt(val: boolean | undefined): number {
  return val ? 1 : 0;
}

declare global {
  interface Number {
    between(min: number, max: number): boolean;
  }
}

Number.prototype.between = function (min: number, max: number): boolean {
  return (this as number) > min && (this as number) < max;
};
