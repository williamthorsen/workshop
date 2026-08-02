/** One way a payload contradicts itself, located by a path into it. */
export interface Violation {
  readonly path: string;
  readonly message: string;
}
