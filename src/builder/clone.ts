import type { BNode } from "./core";
import { cloneNode } from "./tree";

/** deep-clone a list of nodes giving every node a fresh id (used when inserting templates) */
export const cloneNodes = (nodes: BNode[]): BNode[] => nodes.map(cloneNode);
