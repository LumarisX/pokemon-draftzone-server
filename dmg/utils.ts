import type { ID } from "@pkmn/data";

/** Converts text into a lowercase alphanumeric ID. */
export function toID(text: unknown): ID {
  if (typeof text === "object" && text !== null && "id" in text) {
    text = (text as { id?: unknown }).id;
  }
  if (typeof text !== "string" && typeof text !== "number") return "" as ID;
  return ("" + text).toLowerCase().replace(/[^a-z0-9]+/g, "") as ID;
}

/** Convenience function used to determine whether one of `xs` is equal to `x`. */
export function is(x: string | undefined, xs: (string | undefined)[]): boolean;
export function is(
  x: string | undefined,
  ...xs: (string | undefined)[]
): boolean;
export function is<T extends string>(
  x: T | undefined,
  ...xs: (T | undefined)[]
) {
  if (Array.isArray(xs[0])) xs = xs[0];
  return !!(x && xs.includes(x));
}

/** Convenience function used to determine whether `x` includes one of `xs`. */
export function has(
  x: string[] | undefined,
  xs: (string | undefined)[],
): boolean;
export function has(
  x: string[] | undefined,
  ...xs: (string | undefined)[]
): boolean;
export function has<T extends string>(
  x: T[] | undefined,
  ...xs: (T | undefined)[]
) {
  if (Array.isArray(xs[0])) xs = xs[0];
  return !!x?.some((y) => xs.includes(y));
}

type Primitive = string | number | boolean | bigint | symbol | undefined | null;
type Builtin = Primitive | Function | Date | Error | RegExp;

type IsTuple<T> = T extends [infer A]
  ? T
  : T extends [infer A, infer B]
    ? T
    : T extends [infer A, infer B, infer C]
      ? T
      : T extends [infer A, infer B, infer C, infer D]
        ? T
        : T extends [infer A, infer B, infer C, infer D, infer E]
          ? T
          : never;

export type DeepPartial<T> = T extends Builtin
  ? T
  : T extends Map<infer K, infer V>
    ? Map<DeepPartial<K>, DeepPartial<V>>
    : T extends ReadonlyMap<infer K, infer V>
      ? ReadonlyMap<DeepPartial<K>, DeepPartial<V>>
      : T extends Set<infer U>
        ? Set<DeepPartial<U>>
        : T extends ReadonlySet<infer U>
          ? ReadonlySet<DeepPartial<U>>
          : T extends Array<infer U>
            ? T extends IsTuple<T>
              ? { [K in keyof T]?: DeepPartial<T[K]> }
              : Array<DeepPartial<U>>
            : T extends Promise<infer U>
              ? Promise<DeepPartial<U>>
              : T extends {}
                ? { [K in keyof T]?: DeepPartial<T[K]> }
                : Partial<T>;

// jQuery JavaScript Library v2.0.3
// MIT License Copyright 2005, 2013 jQuery Foundation, Inc. and other contributors
/* eslint-disable eqeqeq, @typescript-eslint/no-explicit-any, @typescript-eslint/unbound-method */
const class2Type: { [c: string]: string } = {
  "[object Boolean]": "boolean",
  "[object Number]": "number",
  "[object String]": "string",
  "[object Function]": "function",
  "[object Array]": "array",
  "[object Date]": "date",
  "[object RegExp]": "regexp",
  "[object Object]": "object",
  "[object Error]": "error",
};

const coreToString = class2Type.toString;
const coreHasOwn = class2Type.hasOwnProperty;

function isFunction(obj: any) {
  return getType(obj) === "function";
}

function isWindow(obj: any) {
  return obj != null && obj === obj.window;
}

function getType(obj: any) {
  if (obj == null) {
    return String(obj);
  }
  return typeof obj === "object" || typeof obj === "function"
    ? class2Type[coreToString.call(obj)] || "object"
    : typeof obj;
}

function isPlainObject(obj: any) {
  if (getType(obj) !== "object" || obj.nodeType || isWindow(obj)) {
    return false;
  }

  try {
    if (
      obj.constructor &&
      !coreHasOwn.call(obj.constructor.prototype, "isPrototypeOf")
    ) {
      return false;
    }
  } catch {
    return false;
  }

  return true;
}

/** Merge the contents of two or more objects together into the first object. */
export function extend(this: any, ...args: any[]) {
  let options;
  let name;
  let src;
  let copy;
  let copyIsArray;
  let clone;
  let target = args[0] || {};
  let i = 1;
  let deep = false;
  const length = args.length;

  if (typeof target === "boolean") {
    deep = target;
    target = args[1] || {};
    i = 2;
  }

  if (typeof target !== "object" && !isFunction(target)) {
    target = {};
  }

  if (length === i) {
    target = this;
    --i;
  }

  for (; i < length; i++) {
    if ((options = args[i]) != null) {
      for (name in options) {
        src = target[name];
        copy = options[name];

        if (target === copy) {
          continue;
        }

        if (
          deep &&
          copy &&
          (isPlainObject(copy) || (copyIsArray = Array.isArray(copy)))
        ) {
          if (copyIsArray) {
            copyIsArray = false;
            clone = src && Array.isArray(src) ? src : [];
          } else {
            clone = src && isPlainObject(src) ? src : {};
          }

          target[name] = extend(deep, clone, copy);
        } else if (copy !== undefined) {
          target[name] = copy;
        }
      }
    }
  }

  return target;
}
