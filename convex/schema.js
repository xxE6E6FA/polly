// @bun
var Create = Object.create;
var GetProtoOf = Object.getPrototypeOf;
var DefProp = Object.defineProperty;
var GetOwnPropNames = Object.getOwnPropertyNames;
var HasOwnProp = Object.prototype.hasOwnProperty;
var ToEsm = (mod, isNodeMode, target) => {
  target = mod != null ? Create(GetProtoOf(mod)) : {};
  const to =
    isNodeMode || !mod || !mod.__esModule
      ? DefProp(target, "default", { value: mod, enumerable: true })
      : target;
  for (const key of GetOwnPropNames(mod)) {
    if (!HasOwnProp.call(to, key)) {
      DefProp(to, key, {
        get: () => mod[key],
        enumerable: true,
      });
    }
  }
  return to;
};
var CommonJs = (cb, mod) => () => (
  mod || cb((mod = { exports: {} }).exports, mod), mod.exports
);

// node_modules/.pnpm/cookie@1.0.2/node_modules/cookie/dist/index.js
var requireDist = CommonJs(exports => {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.parse = parse;
  exports.serialize = serialize;
  var cookieNameRegExp = /^[\u0021-\u003A\u003C\u003E-\u007E]+$/;
  var cookieValueRegExp = /^[\u0021-\u003A\u003C-\u007E]*$/;
  var domainValueRegExp =
    /^([.]?[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)([.][a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i;
  var pathValueRegExp = /^[\u0020-\u003A\u003D-\u007E]*$/;
  var ToString = Object.prototype.toString;
  var NullObject = /* @__PURE__ */ (() => {
    const C = function () {};
    C.prototype = Object.create(null);
    return C;
  })();
  function parse(str, options) {
    const obj = new NullObject();
    const len2 = str.length;
    if (len2 < 2) {
      return obj;
    }
    const dec = options?.decode || decode;
    let index = 0;
    do {
      const eqIdx = str.indexOf("=", index);
      if (eqIdx === -1) {
        break;
      }
      const colonIdx = str.indexOf(";", index);
      const endIdx = colonIdx === -1 ? len2 : colonIdx;
      if (eqIdx > endIdx) {
        index = str.lastIndexOf(";", eqIdx - 1) + 1;
        continue;
      }
      const keyStartIdx = startIndex(str, index, eqIdx);
      const keyEndIdx = endIndex(str, eqIdx, keyStartIdx);
      const key = str.slice(keyStartIdx, keyEndIdx);
      if (obj[key] === undefined) {
        const valStartIdx = startIndex(str, eqIdx + 1, endIdx);
        const valEndIdx = endIndex(str, endIdx, valStartIdx);
        const value = dec(str.slice(valStartIdx, valEndIdx));
        obj[key] = value;
      }
      index = endIdx + 1;
    } while (index < len2);
    return obj;
  }
  function startIndex(str, index, max) {
    do {
      const code2 = str.charCodeAt(index);
      if (code2 !== 32 && code2 !== 9) {
        return index;
      }
    } while (++index < max);
    return max;
  }
  function endIndex(str, index, min) {
    while (index > min) {
      const code2 = str.charCodeAt(--index);
      if (code2 !== 32 && code2 !== 9) {
        return index + 1;
      }
    }
    return min;
  }
  function serialize(name, val, options) {
    const enc = options?.encode || encodeURIComponent;
    if (!cookieNameRegExp.test(name)) {
      throw new TypeError(`argument name is invalid: ${name}`);
    }
    const value = enc(val);
    if (!cookieValueRegExp.test(value)) {
      throw new TypeError(`argument val is invalid: ${val}`);
    }
    let str = `${name}=${value}`;
    if (!options) {
      return str;
    }
    if (options.maxAge !== undefined) {
      if (!Number.isInteger(options.maxAge)) {
        throw new TypeError(`option maxAge is invalid: ${options.maxAge}`);
      }
      str += `; Max-Age=${options.maxAge}`;
    }
    if (options.domain) {
      if (!domainValueRegExp.test(options.domain)) {
        throw new TypeError(`option domain is invalid: ${options.domain}`);
      }
      str += `; Domain=${options.domain}`;
    }
    if (options.path) {
      if (!pathValueRegExp.test(options.path)) {
        throw new TypeError(`option path is invalid: ${options.path}`);
      }
      str += `; Path=${options.path}`;
    }
    if (options.expires) {
      if (
        !(isDate(options.expires) && Number.isFinite(options.expires.valueOf()))
      ) {
        throw new TypeError(`option expires is invalid: ${options.expires}`);
      }
      str += `; Expires=${options.expires.toUTCString()}`;
    }
    if (options.httpOnly) {
      str += "; HttpOnly";
    }
    if (options.secure) {
      str += "; Secure";
    }
    if (options.partitioned) {
      str += "; Partitioned";
    }
    if (options.priority) {
      const priority =
        typeof options.priority === "string"
          ? options.priority.toLowerCase()
          : undefined;
      switch (priority) {
        case "low":
          str += "; Priority=Low";
          break;
        case "medium":
          str += "; Priority=Medium";
          break;
        case "high":
          str += "; Priority=High";
          break;
        default:
          throw new TypeError(
            `option priority is invalid: ${options.priority}`
          );
      }
    }
    if (options.sameSite) {
      const sameSite =
        typeof options.sameSite === "string"
          ? options.sameSite.toLowerCase()
          : options.sameSite;
      switch (sameSite) {
        case true:
        case "strict":
          str += "; SameSite=Strict";
          break;
        case "lax":
          str += "; SameSite=Lax";
          break;
        case "none":
          str += "; SameSite=None";
          break;
        default:
          throw new TypeError(
            `option sameSite is invalid: ${options.sameSite}`
          );
      }
    }
    return str;
  }
  function decode(str) {
    if (str.indexOf("%") === -1) {
      return str;
    }
    try {
      return decodeURIComponent(str);
    } catch (_e) {
      return str;
    }
  }
  function isDate(val) {
    return ToString.call(val) === "[object Date]";
  }
});
// node_modules/.pnpm/convex@1.28.0_react@19.2.0/node_modules/convex/dist/esm/values/base64.js
var lookup = [];
var revLookup = [];
var Arr = Uint8Array;
var code = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
for (i = 0, len = code.length; i < len; ++i) {
  lookup[i] = code[i];
  revLookup[code.charCodeAt(i)] = i;
}
var i;
var len;
revLookup[45] = 62;
revLookup[95] = 63;
function getLens(b64) {
  var len2 = b64.length;
  if (len2 % 4 > 0) {
    throw new Error("Invalid string. Length must be a multiple of 4");
  }
  var validLen = b64.indexOf("=");
  if (validLen === -1) {
    validLen = len2;
  }
  var placeHoldersLen = validLen === len2 ? 0 : 4 - (validLen % 4);
  return [validLen, placeHoldersLen];
}
function ByteLength(_b64, validLen, placeHoldersLen) {
  return ((validLen + placeHoldersLen) * 3) / 4 - placeHoldersLen;
}
function toByteArray(b64) {
  var tmp;
  var lens = getLens(b64);
  var validLen = lens[0];
  var placeHoldersLen = lens[1];
  var arr = new Arr(ByteLength(b64, validLen, placeHoldersLen));
  var curByte = 0;
  var len2 = placeHoldersLen > 0 ? validLen - 4 : validLen;
  var i2;
  for (i2 = 0; i2 < len2; i2 += 4) {
    tmp =
      (revLookup[b64.charCodeAt(i2)] << 18) |
      (revLookup[b64.charCodeAt(i2 + 1)] << 12) |
      (revLookup[b64.charCodeAt(i2 + 2)] << 6) |
      revLookup[b64.charCodeAt(i2 + 3)];
    arr[curByte++] = (tmp >> 16) & 255;
    arr[curByte++] = (tmp >> 8) & 255;
    arr[curByte++] = tmp & 255;
  }
  if (placeHoldersLen === 2) {
    tmp =
      (revLookup[b64.charCodeAt(i2)] << 2) |
      (revLookup[b64.charCodeAt(i2 + 1)] >> 4);
    arr[curByte++] = tmp & 255;
  }
  if (placeHoldersLen === 1) {
    tmp =
      (revLookup[b64.charCodeAt(i2)] << 10) |
      (revLookup[b64.charCodeAt(i2 + 1)] << 4) |
      (revLookup[b64.charCodeAt(i2 + 2)] >> 2);
    arr[curByte++] = (tmp >> 8) & 255;
    arr[curByte++] = tmp & 255;
  }
  return arr;
}
function tripletToBase64(num) {
  return (
    lookup[(num >> 18) & 63] +
    lookup[(num >> 12) & 63] +
    lookup[(num >> 6) & 63] +
    lookup[num & 63]
  );
}
function encodeChunk(uint8, start, end) {
  var tmp;
  var output = [];
  for (var i2 = start; i2 < end; i2 += 3) {
    tmp =
      ((uint8[i2] << 16) & 16711680) +
      ((uint8[i2 + 1] << 8) & 65280) +
      (uint8[i2 + 2] & 255);
    output.push(tripletToBase64(tmp));
  }
  return output.join("");
}
function fromByteArray(uint8) {
  var tmp;
  var len2 = uint8.length;
  var extraBytes = len2 % 3;
  var parts = [];
  var maxChunkLength = 16383;
  for (
    var i2 = 0, len22 = len2 - extraBytes;
    i2 < len22;
    i2 += maxChunkLength
  ) {
    parts.push(
      encodeChunk(
        uint8,
        i2,
        i2 + maxChunkLength > len22 ? len22 : i2 + maxChunkLength
      )
    );
  }
  if (extraBytes === 1) {
    tmp = uint8[len2 - 1];
    parts.push(`${lookup[tmp >> 2] + lookup[(tmp << 4) & 63]}==`);
  } else if (extraBytes === 2) {
    tmp = (uint8[len2 - 2] << 8) + uint8[len2 - 1];
    parts.push(
      lookup[tmp >> 10] +
        lookup[(tmp >> 4) & 63] +
        lookup[(tmp << 2) & 63] +
        "="
    );
  }
  return parts.join("");
}

// node_modules/.pnpm/convex@1.28.0_react@19.2.0/node_modules/convex/dist/esm/common/index.js
function isSimpleObject(value) {
  const isObject = typeof value === "object";
  const prototype = Object.getPrototypeOf(value);
  const isSimple =
    prototype === null ||
    prototype === Object.prototype ||
    prototype?.constructor?.name === "Object";
  return isObject && isSimple;
}

// node_modules/.pnpm/convex@1.28.0_react@19.2.0/node_modules/convex/dist/esm/values/value.js
var LITTLE_ENDIAN = true;
var MIN_INT64 = BigInt("-9223372036854775808");
var MAX_INT64 = BigInt("9223372036854775807");
var ZERO = BigInt("0");
var EIGHT = BigInt("8");
var TWOFIFTYSIX = BigInt("256");
function isSpecial(n) {
  return Number.isNaN(n) || !Number.isFinite(n) || Object.is(n, -0);
}
function slowBigIntToBase64(value) {
  if (value < ZERO) {
    value -= MIN_INT64 + MIN_INT64;
  }
  let hex = value.toString(16);
  if (hex.length % 2 === 1) {
    hex = `0${hex}`;
  }
  const bytes = new Uint8Array(new ArrayBuffer(8));
  let i2 = 0;
  for (const hexByte of hex.match(/.{2}/g).reverse()) {
    bytes.set([parseInt(hexByte, 16)], i2++);
    value >>= EIGHT;
  }
  return fromByteArray(bytes);
}
function slowBase64ToBigInt(encoded) {
  const integerBytes = toByteArray(encoded);
  if (integerBytes.byteLength !== 8) {
    throw new Error(
      `Received ${integerBytes.byteLength} bytes, expected 8 for $integer`
    );
  }
  let value = ZERO;
  let power = ZERO;
  for (const byte of integerBytes) {
    value += BigInt(byte) * TWOFIFTYSIX ** power;
    power++;
  }
  if (value > MAX_INT64) {
    value += MIN_INT64 + MIN_INT64;
  }
  return value;
}
function modernBigIntToBase64(value) {
  if (value < MIN_INT64 || MAX_INT64 < value) {
    throw new Error(
      `BigInt ${value} does not fit into a 64-bit signed integer.`
    );
  }
  const buffer = new ArrayBuffer(8);
  new DataView(buffer).setBigInt64(0, value, true);
  return fromByteArray(new Uint8Array(buffer));
}
function modernBase64ToBigInt(encoded) {
  const integerBytes = toByteArray(encoded);
  if (integerBytes.byteLength !== 8) {
    throw new Error(
      `Received ${integerBytes.byteLength} bytes, expected 8 for $integer`
    );
  }
  const intBytesView = new DataView(integerBytes.buffer);
  return intBytesView.getBigInt64(0, true);
}
var bigIntToBase64 = DataView.prototype.setBigInt64
  ? modernBigIntToBase64
  : slowBigIntToBase64;
var _base64ToBigInt = DataView.prototype.getBigInt64
  ? modernBase64ToBigInt
  : slowBase64ToBigInt;
var MAX_IDENTIFIER_LEN = 1024;
function validateObjectField(k) {
  if (k.length > MAX_IDENTIFIER_LEN) {
    throw new Error(
      `Field name ${k} exceeds maximum field name length ${MAX_IDENTIFIER_LEN}.`
    );
  }
  if (k.startsWith("$")) {
    throw new Error(`Field name ${k} starts with a '$', which is reserved.`);
  }
  for (let i2 = 0; i2 < k.length; i2 += 1) {
    const charCode = k.charCodeAt(i2);
    if (charCode < 32 || charCode >= 127) {
      throw new Error(
        `Field name ${k} has invalid character '${k[i2]}': Field names can only contain non-control ASCII characters`
      );
    }
  }
}
function stringifyValueForError(value) {
  return JSON.stringify(value, (_key, value2) => {
    if (value2 === undefined) {
      return "undefined";
    }
    if (typeof value2 === "bigint") {
      return `${value2.toString()}n`;
    }
    return value2;
  });
}
function convexToJsonInternal(
  value,
  originalValue,
  context,
  includeTopLevelUndefined
) {
  if (value === undefined) {
    const contextText =
      context &&
      ` (present at path ${context} in original object ${stringifyValueForError(originalValue)})`;
    throw new Error(
      `undefined is not a valid Convex value${contextText}. To learn about Convex's supported types, see https://docs.convex.dev/using/types.`
    );
  }
  if (value === null) {
    return value;
  }
  if (typeof value === "bigint") {
    if (value < MIN_INT64 || MAX_INT64 < value) {
      throw new Error(
        `BigInt ${value} does not fit into a 64-bit signed integer.`
      );
    }
    return { $integer: bigIntToBase64(value) };
  }
  if (typeof value === "number") {
    if (isSpecial(value)) {
      const buffer = new ArrayBuffer(8);
      new DataView(buffer).setFloat64(0, value, LITTLE_ENDIAN);
      return { $float: fromByteArray(new Uint8Array(buffer)) };
    }
    return value;
  }
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    return value;
  }
  if (value instanceof ArrayBuffer) {
    return { $bytes: fromByteArray(new Uint8Array(value)) };
  }
  if (Array.isArray(value)) {
    return value.map((value2, i2) =>
      convexToJsonInternal(value2, originalValue, `${context}[${i2}]`, false)
    );
  }
  if (value instanceof Set) {
    throw new Error(
      errorMessageForUnsupportedType(context, "Set", [...value], originalValue)
    );
  }
  if (value instanceof Map) {
    throw new Error(
      errorMessageForUnsupportedType(context, "Map", [...value], originalValue)
    );
  }
  if (!isSimpleObject(value)) {
    const theType = value?.constructor?.name;
    const typeName = theType ? `${theType} ` : "";
    throw new Error(
      errorMessageForUnsupportedType(context, typeName, value, originalValue)
    );
  }
  const out = {};
  const entries = Object.entries(value);
  entries.sort(([k1, _v1], [k2, _v2]) => (k1 === k2 ? 0 : k1 < k2 ? -1 : 1));
  for (const [k, v] of entries) {
    if (v !== undefined) {
      validateObjectField(k);
      out[k] = convexToJsonInternal(v, originalValue, `${context}.${k}`, false);
    } else if (includeTopLevelUndefined) {
      validateObjectField(k);
      out[k] = convexOrUndefinedToJsonInternal(
        v,
        originalValue,
        `${context}.${k}`
      );
    }
  }
  return out;
}
function errorMessageForUnsupportedType(
  context,
  typeName,
  value,
  originalValue
) {
  if (context) {
    return `${typeName}${stringifyValueForError(value)} is not a supported Convex type (present at path ${context} in original object ${stringifyValueForError(originalValue)}). To learn about Convex's supported types, see https://docs.convex.dev/using/types.`;
  }
  return `${typeName}${stringifyValueForError(value)} is not a supported Convex type.`;
}
function convexOrUndefinedToJsonInternal(value, originalValue, context) {
  if (value === undefined) {
    return { $undefined: null };
  }
  if (originalValue === undefined) {
    throw new Error(
      `Programming error. Current value is ${stringifyValueForError(value)} but original value is undefined`
    );
  }
  return convexToJsonInternal(value, originalValue, context, false);
}
function convexToJson(value) {
  return convexToJsonInternal(value, value, "", false);
}

// node_modules/.pnpm/convex@1.28.0_react@19.2.0/node_modules/convex/dist/esm/values/validators.js
var DefProp2 = Object.defineProperty;
var DefNormalProp = (obj, key, value) =>
  key in obj
    ? DefProp2(obj, key, {
        enumerable: true,
        configurable: true,
        writable: true,
        value,
      })
    : (obj[key] = value);
var PublicField = (obj, key, value) =>
  DefNormalProp(obj, typeof key !== "symbol" ? `${key}` : key, value);

class BaseValidator {
  constructor({ isOptional }) {
    PublicField(this, "type");
    PublicField(this, "fieldPaths");
    PublicField(this, "isOptional");
    PublicField(this, "isConvexValidator");
    this.isOptional = isOptional;
    this.isConvexValidator = true;
  }
  get optional() {
    return this.isOptional === "optional";
  }
}

class VId extends BaseValidator {
  constructor({ isOptional, tableName }) {
    super({ isOptional });
    PublicField(this, "tableName");
    PublicField(this, "kind", "id");
    if (typeof tableName !== "string") {
      throw new Error("v.id(tableName) requires a string");
    }
    this.tableName = tableName;
  }
  get json() {
    return { type: "id", tableName: this.tableName };
  }
  asOptional() {
    return new VId({
      isOptional: "optional",
      tableName: this.tableName,
    });
  }
}

class VFloat64 extends BaseValidator {
  constructor() {
    super(...arguments);
    PublicField(this, "kind", "float64");
  }
  get json() {
    return { type: "number" };
  }
  asOptional() {
    return new VFloat64({
      isOptional: "optional",
    });
  }
}

class VInt64 extends BaseValidator {
  constructor() {
    super(...arguments);
    PublicField(this, "kind", "int64");
  }
  get json() {
    return { type: "bigint" };
  }
  asOptional() {
    return new VInt64({ isOptional: "optional" });
  }
}

class VBoolean extends BaseValidator {
  constructor() {
    super(...arguments);
    PublicField(this, "kind", "boolean");
  }
  get json() {
    return { type: this.kind };
  }
  asOptional() {
    return new VBoolean({
      isOptional: "optional",
    });
  }
}

class VBytes extends BaseValidator {
  constructor() {
    super(...arguments);
    PublicField(this, "kind", "bytes");
  }
  get json() {
    return { type: this.kind };
  }
  asOptional() {
    return new VBytes({ isOptional: "optional" });
  }
}

class VString extends BaseValidator {
  constructor() {
    super(...arguments);
    PublicField(this, "kind", "string");
  }
  get json() {
    return { type: this.kind };
  }
  asOptional() {
    return new VString({
      isOptional: "optional",
    });
  }
}

class VNull extends BaseValidator {
  constructor() {
    super(...arguments);
    PublicField(this, "kind", "null");
  }
  get json() {
    return { type: this.kind };
  }
  asOptional() {
    return new VNull({ isOptional: "optional" });
  }
}

class VAny extends BaseValidator {
  constructor() {
    super(...arguments);
    PublicField(this, "kind", "any");
  }
  get json() {
    return {
      type: this.kind,
    };
  }
  asOptional() {
    return new VAny({
      isOptional: "optional",
    });
  }
}

class VObject extends BaseValidator {
  constructor({ isOptional, fields }) {
    super({ isOptional });
    PublicField(this, "fields");
    PublicField(this, "kind", "object");
    globalThis.Object.values(fields).forEach(v => {
      if (!v.isConvexValidator) {
        throw new Error("v.object() entries must be validators");
      }
    });
    this.fields = fields;
  }
  get json() {
    return {
      type: this.kind,
      value: globalThis.Object.fromEntries(
        globalThis.Object.entries(this.fields).map(([k, v]) => [
          k,
          {
            fieldType: v.json,
            optional: v.isOptional === "optional",
          },
        ])
      ),
    };
  }
  asOptional() {
    return new VObject({
      isOptional: "optional",
      fields: this.fields,
    });
  }
}

class VLiteral extends BaseValidator {
  constructor({ isOptional, value }) {
    super({ isOptional });
    PublicField(this, "value");
    PublicField(this, "kind", "literal");
    if (
      typeof value !== "string" &&
      typeof value !== "boolean" &&
      typeof value !== "number" &&
      typeof value !== "bigint"
    ) {
      throw new Error("v.literal(value) must be a string, number, or boolean");
    }
    this.value = value;
  }
  get json() {
    return {
      type: this.kind,
      value: convexToJson(this.value),
    };
  }
  asOptional() {
    return new VLiteral({
      isOptional: "optional",
      value: this.value,
    });
  }
}

class VArray extends BaseValidator {
  constructor({ isOptional, element }) {
    super({ isOptional });
    PublicField(this, "element");
    PublicField(this, "kind", "array");
    this.element = element;
  }
  get json() {
    return {
      type: this.kind,
      value: this.element.json,
    };
  }
  asOptional() {
    return new VArray({
      isOptional: "optional",
      element: this.element,
    });
  }
}

class VRecord extends BaseValidator {
  constructor({ isOptional, key, value }) {
    super({ isOptional });
    PublicField(this, "key");
    PublicField(this, "value");
    PublicField(this, "kind", "record");
    if (key.isOptional === "optional") {
      throw new Error("Record validator cannot have optional keys");
    }
    if (value.isOptional === "optional") {
      throw new Error("Record validator cannot have optional values");
    }
    if (!(key.isConvexValidator && value.isConvexValidator)) {
      throw new Error("Key and value of v.record() but be validators");
    }
    this.key = key;
    this.value = value;
  }
  get json() {
    return {
      type: this.kind,
      keys: this.key.json,
      values: {
        fieldType: this.value.json,
        optional: false,
      },
    };
  }
  asOptional() {
    return new VRecord({
      isOptional: "optional",
      key: this.key,
      value: this.value,
    });
  }
}

class VUnion extends BaseValidator {
  constructor({ isOptional, members }) {
    super({ isOptional });
    PublicField(this, "members");
    PublicField(this, "kind", "union");
    members.forEach(member => {
      if (!member.isConvexValidator) {
        throw new Error("All members of v.union() must be validators");
      }
    });
    this.members = members;
  }
  get json() {
    return {
      type: this.kind,
      value: this.members.map(v => v.json),
    };
  }
  asOptional() {
    return new VUnion({
      isOptional: "optional",
      members: this.members,
    });
  }
}

// node_modules/.pnpm/convex@1.28.0_react@19.2.0/node_modules/convex/dist/esm/values/validator.js
function isValidator(v2) {
  return !!v2.isConvexValidator;
}
var v = {
  id: tableName => {
    return new VId({
      isOptional: "required",
      tableName,
    });
  },
  null: () => {
    return new VNull({ isOptional: "required" });
  },
  number: () => {
    return new VFloat64({ isOptional: "required" });
  },
  float64: () => {
    return new VFloat64({ isOptional: "required" });
  },
  bigint: () => {
    return new VInt64({ isOptional: "required" });
  },
  int64: () => {
    return new VInt64({ isOptional: "required" });
  },
  boolean: () => {
    return new VBoolean({ isOptional: "required" });
  },
  string: () => {
    return new VString({ isOptional: "required" });
  },
  bytes: () => {
    return new VBytes({ isOptional: "required" });
  },
  literal: literal => {
    return new VLiteral({ isOptional: "required", value: literal });
  },
  array: element => {
    return new VArray({ isOptional: "required", element });
  },
  object: fields => {
    return new VObject({ isOptional: "required", fields });
  },
  record: (keys, values) => {
    return new VRecord({
      isOptional: "required",
      key: keys,
      value: values,
    });
  },
  union: (...members) => {
    return new VUnion({
      isOptional: "required",
      members,
    });
  },
  any: () => {
    return new VAny({ isOptional: "required" });
  },
  optional: value => {
    return value.asOptional();
  },
};
// node_modules/.pnpm/convex@1.28.0_react@19.2.0/node_modules/convex/dist/esm/server/schema.js
var DefProp3 = Object.defineProperty;
var DefNormalProp2 = (obj, key, value) =>
  key in obj
    ? DefProp3(obj, key, {
        enumerable: true,
        configurable: true,
        writable: true,
        value,
      })
    : (obj[key] = value);
var PublicField2 = (obj, key, value) =>
  DefNormalProp2(obj, typeof key !== "symbol" ? `${key}` : key, value);

class TableDefinition {
  constructor(documentType) {
    PublicField2(this, "indexes");
    PublicField2(this, "stagedDbIndexes");
    PublicField2(this, "searchIndexes");
    PublicField2(this, "stagedSearchIndexes");
    PublicField2(this, "vectorIndexes");
    PublicField2(this, "stagedVectorIndexes");
    PublicField2(this, "validator");
    this.indexes = [];
    this.stagedDbIndexes = [];
    this.searchIndexes = [];
    this.stagedSearchIndexes = [];
    this.vectorIndexes = [];
    this.stagedVectorIndexes = [];
    this.validator = documentType;
  }
  " indexes"() {
    return this.indexes;
  }
  index(name, indexConfig) {
    if (Array.isArray(indexConfig)) {
      this.indexes.push({
        indexDescriptor: name,
        fields: indexConfig,
      });
    } else if (indexConfig.staged) {
      this.stagedDbIndexes.push({
        indexDescriptor: name,
        fields: indexConfig.fields,
      });
    } else {
      this.indexes.push({
        indexDescriptor: name,
        fields: indexConfig.fields,
      });
    }
    return this;
  }
  searchIndex(name, indexConfig) {
    if (indexConfig.staged) {
      this.stagedSearchIndexes.push({
        indexDescriptor: name,
        searchField: indexConfig.searchField,
        filterFields: indexConfig.filterFields || [],
      });
    } else {
      this.searchIndexes.push({
        indexDescriptor: name,
        searchField: indexConfig.searchField,
        filterFields: indexConfig.filterFields || [],
      });
    }
    return this;
  }
  vectorIndex(name, indexConfig) {
    if (indexConfig.staged) {
      this.stagedVectorIndexes.push({
        indexDescriptor: name,
        vectorField: indexConfig.vectorField,
        dimensions: indexConfig.dimensions,
        filterFields: indexConfig.filterFields || [],
      });
    } else {
      this.vectorIndexes.push({
        indexDescriptor: name,
        vectorField: indexConfig.vectorField,
        dimensions: indexConfig.dimensions,
        filterFields: indexConfig.filterFields || [],
      });
    }
    return this;
  }
  self() {
    return this;
  }
  export() {
    const documentType = this.validator.json;
    if (typeof documentType !== "object") {
      throw new Error(
        "Invalid validator: please make sure that the parameter of `defineTable` is valid (see https://docs.convex.dev/database/schemas)"
      );
    }
    return {
      indexes: this.indexes,
      stagedDbIndexes: this.stagedDbIndexes,
      searchIndexes: this.searchIndexes,
      stagedSearchIndexes: this.stagedSearchIndexes,
      vectorIndexes: this.vectorIndexes,
      stagedVectorIndexes: this.stagedVectorIndexes,
      documentType,
    };
  }
}
function defineTable(documentSchema) {
  if (isValidator(documentSchema)) {
    return new TableDefinition(documentSchema);
  }
  return new TableDefinition(v.object(documentSchema));
}

class SchemaDefinition {
  constructor(tables, options) {
    PublicField2(this, "tables");
    PublicField2(this, "strictTableNameTypes");
    PublicField2(this, "schemaValidation");
    this.tables = tables;
    this.schemaValidation =
      options?.schemaValidation === undefined ? true : options.schemaValidation;
  }
  export() {
    return JSON.stringify({
      tables: Object.entries(this.tables).map(([tableName, definition]) => {
        const {
          indexes,
          stagedDbIndexes,
          searchIndexes,
          stagedSearchIndexes,
          vectorIndexes,
          stagedVectorIndexes,
          documentType,
        } = definition.export();
        return {
          tableName,
          indexes,
          stagedDbIndexes,
          searchIndexes,
          stagedSearchIndexes,
          vectorIndexes,
          stagedVectorIndexes,
          documentType,
        };
      }),
      schemaValidation: this.schemaValidation,
    });
  }
}
function defineSchema(schema, options) {
  return new SchemaDefinition(schema, options);
}
var _systemSchema = defineSchema({
  _scheduled_functions: defineTable({
    name: v.string(),
    args: v.array(v.any()),
    scheduledTime: v.float64(),
    completedTime: v.optional(v.float64()),
    state: v.union(
      v.object({ kind: v.literal("pending") }),
      v.object({ kind: v.literal("inProgress") }),
      v.object({ kind: v.literal("success") }),
      v.object({ kind: v.literal("failed"), error: v.string() }),
      v.object({ kind: v.literal("canceled") })
    ),
  }),
  _storage: defineTable({
    sha256: v.string(),
    size: v.float64(),
    contentType: v.optional(v.string()),
  }),
});
// node_modules/.pnpm/@convex-dev+auth@0.0.87_@auth+core@0.39.1_convex@1.28.0_react@19.2.0__react@19.2.0/node_modules/@convex-dev/auth/dist/server/implementation/index.js
var _importCookie = ToEsm(requireDist(), 1);

// node_modules/.pnpm/@convex-dev+auth@0.0.87_@auth+core@0.39.1_convex@1.28.0_react@19.2.0__react@19.2.0/node_modules/@convex-dev/auth/dist/server/implementation/types.js
var authTables = {
  users: defineTable({
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
  })
    .index("email", ["email"])
    .index("phone", ["phone"]),
  authSessions: defineTable({
    userId: v.id("users"),
    expirationTime: v.number(),
  }).index("userId", ["userId"]),
  authAccounts: defineTable({
    userId: v.id("users"),
    provider: v.string(),
    providerAccountId: v.string(),
    secret: v.optional(v.string()),
    emailVerified: v.optional(v.string()),
    phoneVerified: v.optional(v.string()),
  })
    .index("userIdAndProvider", ["userId", "provider"])
    .index("providerAndAccountId", ["provider", "providerAccountId"]),
  authRefreshTokens: defineTable({
    sessionId: v.id("authSessions"),
    expirationTime: v.number(),
    firstUsedTime: v.optional(v.number()),
    parentRefreshTokenId: v.optional(v.id("authRefreshTokens")),
  })
    .index("sessionId", ["sessionId"])
    .index("sessionIdAndParentRefreshTokenId", [
      "sessionId",
      "parentRefreshTokenId",
    ]),
  authVerificationCodes: defineTable({
    accountId: v.id("authAccounts"),
    provider: v.string(),
    code: v.string(),
    expirationTime: v.number(),
    verifier: v.optional(v.string()),
    emailVerified: v.optional(v.string()),
    phoneVerified: v.optional(v.string()),
  })
    .index("accountId", ["accountId"])
    .index("code", ["code"]),
  authVerifiers: defineTable({
    sessionId: v.optional(v.id("authSessions")),
    signature: v.optional(v.string()),
  }).index("signature", ["signature"]),
  authRateLimits: defineTable({
    identifier: v.string(),
    lastAttemptTime: v.number(),
    attemptsLeft: v.number(),
  }).index("identifier", ["identifier"]),
};
var _defaultSchema = defineSchema(authTables);
// node_modules/convex/dist/esm/values/base64.js
var lookup2 = [];
var revLookup2 = [];
var Arr2 = Uint8Array;
var code2 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
for (i2 = 0, len2 = code2.length; i2 < len2; ++i2) {
  lookup2[i2] = code2[i2];
  revLookup2[code2.charCodeAt(i2)] = i2;
}
var i2;
var len2;
revLookup2[45] = 62;
revLookup2[95] = 63;
function getLens2(b64) {
  var len3 = b64.length;
  if (len3 % 4 > 0) {
    throw new Error("Invalid string. Length must be a multiple of 4");
  }
  var validLen = b64.indexOf("=");
  if (validLen === -1) {
    validLen = len3;
  }
  var placeHoldersLen = validLen === len3 ? 0 : 4 - (validLen % 4);
  return [validLen, placeHoldersLen];
}
function ByteLength2(_b64, validLen, placeHoldersLen) {
  return ((validLen + placeHoldersLen) * 3) / 4 - placeHoldersLen;
}
function toByteArray2(b64) {
  var tmp;
  var lens = getLens2(b64);
  var validLen = lens[0];
  var placeHoldersLen = lens[1];
  var arr = new Arr2(ByteLength2(b64, validLen, placeHoldersLen));
  var curByte = 0;
  var len3 = placeHoldersLen > 0 ? validLen - 4 : validLen;
  var i3;
  for (i3 = 0; i3 < len3; i3 += 4) {
    tmp =
      (revLookup2[b64.charCodeAt(i3)] << 18) |
      (revLookup2[b64.charCodeAt(i3 + 1)] << 12) |
      (revLookup2[b64.charCodeAt(i3 + 2)] << 6) |
      revLookup2[b64.charCodeAt(i3 + 3)];
    arr[curByte++] = (tmp >> 16) & 255;
    arr[curByte++] = (tmp >> 8) & 255;
    arr[curByte++] = tmp & 255;
  }
  if (placeHoldersLen === 2) {
    tmp =
      (revLookup2[b64.charCodeAt(i3)] << 2) |
      (revLookup2[b64.charCodeAt(i3 + 1)] >> 4);
    arr[curByte++] = tmp & 255;
  }
  if (placeHoldersLen === 1) {
    tmp =
      (revLookup2[b64.charCodeAt(i3)] << 10) |
      (revLookup2[b64.charCodeAt(i3 + 1)] << 4) |
      (revLookup2[b64.charCodeAt(i3 + 2)] >> 2);
    arr[curByte++] = (tmp >> 8) & 255;
    arr[curByte++] = tmp & 255;
  }
  return arr;
}
function tripletToBase642(num) {
  return (
    lookup2[(num >> 18) & 63] +
    lookup2[(num >> 12) & 63] +
    lookup2[(num >> 6) & 63] +
    lookup2[num & 63]
  );
}
function encodeChunk2(uint8, start, end) {
  var tmp;
  var output = [];
  for (var i3 = start; i3 < end; i3 += 3) {
    tmp =
      ((uint8[i3] << 16) & 16711680) +
      ((uint8[i3 + 1] << 8) & 65280) +
      (uint8[i3 + 2] & 255);
    output.push(tripletToBase642(tmp));
  }
  return output.join("");
}
function fromByteArray2(uint8) {
  var tmp;
  var len3 = uint8.length;
  var extraBytes = len3 % 3;
  var parts = [];
  var maxChunkLength = 16383;
  for (
    var i3 = 0, len22 = len3 - extraBytes;
    i3 < len22;
    i3 += maxChunkLength
  ) {
    parts.push(
      encodeChunk2(
        uint8,
        i3,
        i3 + maxChunkLength > len22 ? len22 : i3 + maxChunkLength
      )
    );
  }
  if (extraBytes === 1) {
    tmp = uint8[len3 - 1];
    parts.push(`${lookup2[tmp >> 2] + lookup2[(tmp << 4) & 63]}==`);
  } else if (extraBytes === 2) {
    tmp = (uint8[len3 - 2] << 8) + uint8[len3 - 1];
    parts.push(
      lookup2[tmp >> 10] +
        lookup2[(tmp >> 4) & 63] +
        lookup2[(tmp << 2) & 63] +
        "="
    );
  }
  return parts.join("");
}

// node_modules/convex/dist/esm/common/index.js
function isSimpleObject2(value) {
  const isObject = typeof value === "object";
  const prototype = Object.getPrototypeOf(value);
  const isSimple =
    prototype === null ||
    prototype === Object.prototype ||
    prototype?.constructor?.name === "Object";
  return isObject && isSimple;
}

// node_modules/convex/dist/esm/values/value.js
var LITTLE_ENDIAN2 = true;
var MIN_INT642 = BigInt("-9223372036854775808");
var MAX_INT642 = BigInt("9223372036854775807");
var ZERO2 = BigInt("0");
var EIGHT2 = BigInt("8");
var TWOFIFTYSIX2 = BigInt("256");
function isSpecial2(n) {
  return Number.isNaN(n) || !Number.isFinite(n) || Object.is(n, -0);
}
function slowBigIntToBase642(value) {
  if (value < ZERO2) {
    value -= MIN_INT642 + MIN_INT642;
  }
  let hex = value.toString(16);
  if (hex.length % 2 === 1) {
    hex = `0${hex}`;
  }
  const bytes = new Uint8Array(new ArrayBuffer(8));
  let i3 = 0;
  for (const hexByte of hex.match(/.{2}/g).reverse()) {
    bytes.set([parseInt(hexByte, 16)], i3++);
    value >>= EIGHT2;
  }
  return fromByteArray2(bytes);
}
function slowBase64ToBigInt2(encoded) {
  const integerBytes = toByteArray2(encoded);
  if (integerBytes.byteLength !== 8) {
    throw new Error(
      `Received ${integerBytes.byteLength} bytes, expected 8 for $integer`
    );
  }
  let value = ZERO2;
  let power = ZERO2;
  for (const byte of integerBytes) {
    value += BigInt(byte) * TWOFIFTYSIX2 ** power;
    power++;
  }
  if (value > MAX_INT642) {
    value += MIN_INT642 + MIN_INT642;
  }
  return value;
}
function modernBigIntToBase642(value) {
  if (value < MIN_INT642 || MAX_INT642 < value) {
    throw new Error(
      `BigInt ${value} does not fit into a 64-bit signed integer.`
    );
  }
  const buffer = new ArrayBuffer(8);
  new DataView(buffer).setBigInt64(0, value, true);
  return fromByteArray2(new Uint8Array(buffer));
}
function modernBase64ToBigInt2(encoded) {
  const integerBytes = toByteArray2(encoded);
  if (integerBytes.byteLength !== 8) {
    throw new Error(
      `Received ${integerBytes.byteLength} bytes, expected 8 for $integer`
    );
  }
  const intBytesView = new DataView(integerBytes.buffer);
  return intBytesView.getBigInt64(0, true);
}
var bigIntToBase642 = DataView.prototype.setBigInt64
  ? modernBigIntToBase642
  : slowBigIntToBase642;
var _base64ToBigInt2 = DataView.prototype.getBigInt64
  ? modernBase64ToBigInt2
  : slowBase64ToBigInt2;
var MAX_IDENTIFIER_LEN2 = 1024;
function validateObjectField2(k) {
  if (k.length > MAX_IDENTIFIER_LEN2) {
    throw new Error(
      `Field name ${k} exceeds maximum field name length ${MAX_IDENTIFIER_LEN2}.`
    );
  }
  if (k.startsWith("$")) {
    throw new Error(`Field name ${k} starts with a '$', which is reserved.`);
  }
  for (let i3 = 0; i3 < k.length; i3 += 1) {
    const charCode = k.charCodeAt(i3);
    if (charCode < 32 || charCode >= 127) {
      throw new Error(
        `Field name ${k} has invalid character '${k[i3]}': Field names can only contain non-control ASCII characters`
      );
    }
  }
}
function stringifyValueForError2(value) {
  return JSON.stringify(value, (_key, value2) => {
    if (value2 === undefined) {
      return "undefined";
    }
    if (typeof value2 === "bigint") {
      return `${value2.toString()}n`;
    }
    return value2;
  });
}
function convexToJsonInternal2(
  value,
  originalValue,
  context,
  includeTopLevelUndefined
) {
  if (value === undefined) {
    const contextText =
      context &&
      ` (present at path ${context} in original object ${stringifyValueForError2(originalValue)})`;
    throw new Error(
      `undefined is not a valid Convex value${contextText}. To learn about Convex's supported types, see https://docs.convex.dev/using/types.`
    );
  }
  if (value === null) {
    return value;
  }
  if (typeof value === "bigint") {
    if (value < MIN_INT642 || MAX_INT642 < value) {
      throw new Error(
        `BigInt ${value} does not fit into a 64-bit signed integer.`
      );
    }
    return { $integer: bigIntToBase642(value) };
  }
  if (typeof value === "number") {
    if (isSpecial2(value)) {
      const buffer = new ArrayBuffer(8);
      new DataView(buffer).setFloat64(0, value, LITTLE_ENDIAN2);
      return { $float: fromByteArray2(new Uint8Array(buffer)) };
    }
    return value;
  }
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    return value;
  }
  if (value instanceof ArrayBuffer) {
    return { $bytes: fromByteArray2(new Uint8Array(value)) };
  }
  if (Array.isArray(value)) {
    return value.map((value2, i3) =>
      convexToJsonInternal2(value2, originalValue, `${context}[${i3}]`, false)
    );
  }
  if (value instanceof Set) {
    throw new Error(
      errorMessageForUnsupportedType2(context, "Set", [...value], originalValue)
    );
  }
  if (value instanceof Map) {
    throw new Error(
      errorMessageForUnsupportedType2(context, "Map", [...value], originalValue)
    );
  }
  if (!isSimpleObject2(value)) {
    const theType = value?.constructor?.name;
    const typeName = theType ? `${theType} ` : "";
    throw new Error(
      errorMessageForUnsupportedType2(context, typeName, value, originalValue)
    );
  }
  const out = {};
  const entries = Object.entries(value);
  entries.sort(([k1, _v1], [k2, _v2]) => (k1 === k2 ? 0 : k1 < k2 ? -1 : 1));
  for (const [k, v2] of entries) {
    if (v2 !== undefined) {
      validateObjectField2(k);
      out[k] = convexToJsonInternal2(
        v2,
        originalValue,
        `${context}.${k}`,
        false
      );
    } else if (includeTopLevelUndefined) {
      validateObjectField2(k);
      out[k] = convexOrUndefinedToJsonInternal2(
        v2,
        originalValue,
        `${context}.${k}`
      );
    }
  }
  return out;
}
function errorMessageForUnsupportedType2(
  context,
  typeName,
  value,
  originalValue
) {
  if (context) {
    return `${typeName}${stringifyValueForError2(value)} is not a supported Convex type (present at path ${context} in original object ${stringifyValueForError2(originalValue)}). To learn about Convex's supported types, see https://docs.convex.dev/using/types.`;
  }
  return `${typeName}${stringifyValueForError2(value)} is not a supported Convex type.`;
}
function convexOrUndefinedToJsonInternal2(value, originalValue, context) {
  if (value === undefined) {
    return { $undefined: null };
  }
  if (originalValue === undefined) {
    throw new Error(
      `Programming error. Current value is ${stringifyValueForError2(value)} but original value is undefined`
    );
  }
  return convexToJsonInternal2(value, originalValue, context, false);
}
function convexToJson2(value) {
  return convexToJsonInternal2(value, value, "", false);
}

// node_modules/convex/dist/esm/values/validators.js
var DefProp4 = Object.defineProperty;
var DefNormalProp3 = (obj, key, value) =>
  key in obj
    ? DefProp4(obj, key, {
        enumerable: true,
        configurable: true,
        writable: true,
        value,
      })
    : (obj[key] = value);
var PublicField3 = (obj, key, value) =>
  DefNormalProp3(obj, typeof key !== "symbol" ? `${key}` : key, value);

class BaseValidator2 {
  constructor({ isOptional }) {
    PublicField3(this, "type");
    PublicField3(this, "fieldPaths");
    PublicField3(this, "isOptional");
    PublicField3(this, "isConvexValidator");
    this.isOptional = isOptional;
    this.isConvexValidator = true;
  }
  get optional() {
    return this.isOptional === "optional";
  }
}

class VId2 extends BaseValidator2 {
  constructor({ isOptional, tableName }) {
    super({ isOptional });
    PublicField3(this, "tableName");
    PublicField3(this, "kind", "id");
    if (typeof tableName !== "string") {
      throw new Error("v.id(tableName) requires a string");
    }
    this.tableName = tableName;
  }
  get json() {
    return { type: "id", tableName: this.tableName };
  }
  asOptional() {
    return new VId2({
      isOptional: "optional",
      tableName: this.tableName,
    });
  }
}

class VFloat642 extends BaseValidator2 {
  constructor() {
    super(...arguments);
    PublicField3(this, "kind", "float64");
  }
  get json() {
    return { type: "number" };
  }
  asOptional() {
    return new VFloat642({
      isOptional: "optional",
    });
  }
}

class VInt642 extends BaseValidator2 {
  constructor() {
    super(...arguments);
    PublicField3(this, "kind", "int64");
  }
  get json() {
    return { type: "bigint" };
  }
  asOptional() {
    return new VInt642({ isOptional: "optional" });
  }
}

class VBoolean2 extends BaseValidator2 {
  constructor() {
    super(...arguments);
    PublicField3(this, "kind", "boolean");
  }
  get json() {
    return { type: this.kind };
  }
  asOptional() {
    return new VBoolean2({
      isOptional: "optional",
    });
  }
}

class VBytes2 extends BaseValidator2 {
  constructor() {
    super(...arguments);
    PublicField3(this, "kind", "bytes");
  }
  get json() {
    return { type: this.kind };
  }
  asOptional() {
    return new VBytes2({ isOptional: "optional" });
  }
}

class VString2 extends BaseValidator2 {
  constructor() {
    super(...arguments);
    PublicField3(this, "kind", "string");
  }
  get json() {
    return { type: this.kind };
  }
  asOptional() {
    return new VString2({
      isOptional: "optional",
    });
  }
}

class VNull2 extends BaseValidator2 {
  constructor() {
    super(...arguments);
    PublicField3(this, "kind", "null");
  }
  get json() {
    return { type: this.kind };
  }
  asOptional() {
    return new VNull2({ isOptional: "optional" });
  }
}

class VAny2 extends BaseValidator2 {
  constructor() {
    super(...arguments);
    PublicField3(this, "kind", "any");
  }
  get json() {
    return {
      type: this.kind,
    };
  }
  asOptional() {
    return new VAny2({
      isOptional: "optional",
    });
  }
}

class VObject2 extends BaseValidator2 {
  constructor({ isOptional, fields }) {
    super({ isOptional });
    PublicField3(this, "fields");
    PublicField3(this, "kind", "object");
    globalThis.Object.values(fields).forEach(v2 => {
      if (!v2.isConvexValidator) {
        throw new Error("v.object() entries must be valiators");
      }
    });
    this.fields = fields;
  }
  get json() {
    return {
      type: this.kind,
      value: globalThis.Object.fromEntries(
        globalThis.Object.entries(this.fields).map(([k, v2]) => [
          k,
          {
            fieldType: v2.json,
            optional: v2.isOptional === "optional",
          },
        ])
      ),
    };
  }
  asOptional() {
    return new VObject2({
      isOptional: "optional",
      fields: this.fields,
    });
  }
}

class VLiteral2 extends BaseValidator2 {
  constructor({ isOptional, value }) {
    super({ isOptional });
    PublicField3(this, "value");
    PublicField3(this, "kind", "literal");
    if (
      typeof value !== "string" &&
      typeof value !== "boolean" &&
      typeof value !== "number" &&
      typeof value !== "bigint"
    ) {
      throw new Error("v.literal(value) must be a string, number, or boolean");
    }
    this.value = value;
  }
  get json() {
    return {
      type: this.kind,
      value: convexToJson2(this.value),
    };
  }
  asOptional() {
    return new VLiteral2({
      isOptional: "optional",
      value: this.value,
    });
  }
}

class VArray2 extends BaseValidator2 {
  constructor({ isOptional, element }) {
    super({ isOptional });
    PublicField3(this, "element");
    PublicField3(this, "kind", "array");
    this.element = element;
  }
  get json() {
    return {
      type: this.kind,
      value: this.element.json,
    };
  }
  asOptional() {
    return new VArray2({
      isOptional: "optional",
      element: this.element,
    });
  }
}

class VRecord2 extends BaseValidator2 {
  constructor({ isOptional, key, value }) {
    super({ isOptional });
    PublicField3(this, "key");
    PublicField3(this, "value");
    PublicField3(this, "kind", "record");
    if (key.isOptional === "optional") {
      throw new Error("Record validator cannot have optional keys");
    }
    if (value.isOptional === "optional") {
      throw new Error("Record validator cannot have optional values");
    }
    if (!(key.isConvexValidator && value.isConvexValidator)) {
      throw new Error("Key and value of v.record() but be validators");
    }
    this.key = key;
    this.value = value;
  }
  get json() {
    return {
      type: this.kind,
      keys: this.key.json,
      values: {
        fieldType: this.value.json,
        optional: false,
      },
    };
  }
  asOptional() {
    return new VRecord2({
      isOptional: "optional",
      key: this.key,
      value: this.value,
    });
  }
}

class VUnion2 extends BaseValidator2 {
  constructor({ isOptional, members }) {
    super({ isOptional });
    PublicField3(this, "members");
    PublicField3(this, "kind", "union");
    members.forEach(member => {
      if (!member.isConvexValidator) {
        throw new Error("All members of v.union() must be validators");
      }
    });
    this.members = members;
  }
  get json() {
    return {
      type: this.kind,
      value: this.members.map(v2 => v2.json),
    };
  }
  asOptional() {
    return new VUnion2({
      isOptional: "optional",
      members: this.members,
    });
  }
}

// node_modules/convex/dist/esm/values/validator.js
function isValidator2(v2) {
  return !!v2.isConvexValidator;
}
var v2 = {
  id: tableName => {
    return new VId2({
      isOptional: "required",
      tableName,
    });
  },
  null: () => {
    return new VNull2({ isOptional: "required" });
  },
  number: () => {
    return new VFloat642({ isOptional: "required" });
  },
  float64: () => {
    return new VFloat642({ isOptional: "required" });
  },
  bigint: () => {
    return new VInt642({ isOptional: "required" });
  },
  int64: () => {
    return new VInt642({ isOptional: "required" });
  },
  boolean: () => {
    return new VBoolean2({ isOptional: "required" });
  },
  string: () => {
    return new VString2({ isOptional: "required" });
  },
  bytes: () => {
    return new VBytes2({ isOptional: "required" });
  },
  literal: literal => {
    return new VLiteral2({ isOptional: "required", value: literal });
  },
  array: element => {
    return new VArray2({ isOptional: "required", element });
  },
  object: fields => {
    return new VObject2({ isOptional: "required", fields });
  },
  record: (keys, values) => {
    return new VRecord2({
      isOptional: "required",
      key: keys,
      value: values,
    });
  },
  union: (...members) => {
    return new VUnion2({
      isOptional: "required",
      members,
    });
  },
  any: () => {
    return new VAny2({ isOptional: "required" });
  },
  optional: value => {
    return value.asOptional();
  },
};
// node_modules/convex/dist/esm/server/schema.js
var DefProp5 = Object.defineProperty;
var DefNormalProp4 = (obj, key, value) =>
  key in obj
    ? DefProp5(obj, key, {
        enumerable: true,
        configurable: true,
        writable: true,
        value,
      })
    : (obj[key] = value);
var PublicField4 = (obj, key, value) =>
  DefNormalProp4(obj, typeof key !== "symbol" ? `${key}` : key, value);

class TableDefinition2 {
  constructor(documentType) {
    PublicField4(this, "indexes");
    PublicField4(this, "searchIndexes");
    PublicField4(this, "vectorIndexes");
    PublicField4(this, "validator");
    this.indexes = [];
    this.searchIndexes = [];
    this.vectorIndexes = [];
    this.validator = documentType;
  }
  " indexes"() {
    return this.indexes;
  }
  index(name, fields) {
    this.indexes.push({ indexDescriptor: name, fields });
    return this;
  }
  searchIndex(name, indexConfig) {
    this.searchIndexes.push({
      indexDescriptor: name,
      searchField: indexConfig.searchField,
      filterFields: indexConfig.filterFields || [],
    });
    return this;
  }
  vectorIndex(name, indexConfig) {
    this.vectorIndexes.push({
      indexDescriptor: name,
      vectorField: indexConfig.vectorField,
      dimensions: indexConfig.dimensions,
      filterFields: indexConfig.filterFields || [],
    });
    return this;
  }
  self() {
    return this;
  }
  export() {
    const documentType = this.validator.json;
    if (typeof documentType !== "object") {
      throw new Error(
        "Invalid validator: please make sure that the parameter of `defineTable` is valid (see https://docs.convex.dev/database/schemas)"
      );
    }
    return {
      indexes: this.indexes,
      searchIndexes: this.searchIndexes,
      vectorIndexes: this.vectorIndexes,
      documentType,
    };
  }
}
function defineTable2(documentSchema) {
  if (isValidator2(documentSchema)) {
    return new TableDefinition2(documentSchema);
  }
  return new TableDefinition2(v2.object(documentSchema));
}

class SchemaDefinition2 {
  constructor(tables, options) {
    PublicField4(this, "tables");
    PublicField4(this, "strictTableNameTypes");
    PublicField4(this, "schemaValidation");
    this.tables = tables;
    this.schemaValidation =
      options?.schemaValidation === undefined ? true : options.schemaValidation;
  }
  export() {
    return JSON.stringify({
      tables: Object.entries(this.tables).map(([tableName, definition]) => {
        const { indexes, searchIndexes, vectorIndexes, documentType } =
          definition.export();
        return {
          tableName,
          indexes,
          searchIndexes,
          vectorIndexes,
          documentType,
        };
      }),
      schemaValidation: this.schemaValidation,
    });
  }
}
function defineSchema2(schema, options) {
  return new SchemaDefinition2(schema, options);
}
var _systemSchema2 = defineSchema2({
  _scheduled_functions: defineTable2({
    name: v2.string(),
    args: v2.array(v2.any()),
    scheduledTime: v2.float64(),
    completedTime: v2.optional(v2.float64()),
    state: v2.union(
      v2.object({ kind: v2.literal("pending") }),
      v2.object({ kind: v2.literal("inProgress") }),
      v2.object({ kind: v2.literal("success") }),
      v2.object({ kind: v2.literal("failed"), error: v2.string() }),
      v2.object({ kind: v2.literal("canceled") })
    ),
  }),
  _storage: defineTable2({
    sha256: v2.string(),
    size: v2.float64(),
    contentType: v2.optional(v2.string()),
  }),
});
// convex/lib/schemas.ts
var userModelSchema = v2.object({
  userId: v2.id("users"),
  modelId: v2.string(),
  name: v2.string(),
  provider: v2.string(),
  contextLength: v2.number(),
  maxOutputTokens: v2.optional(v2.number()),
  supportsImages: v2.boolean(),
  supportsTools: v2.boolean(),
  supportsReasoning: v2.boolean(),
  supportsFiles: v2.optional(v2.boolean()),
  inputModalities: v2.optional(v2.array(v2.string())),
  selected: v2.optional(v2.boolean()),
  free: v2.optional(v2.boolean()),
  isAvailable: v2.optional(v2.boolean()),
  availabilityCheckedAt: v2.optional(v2.number()),
  createdAt: v2.number(),
});
var builtInModelSchema = v2.object({
  modelId: v2.string(),
  name: v2.string(),
  provider: v2.string(),
  displayProvider: v2.optional(v2.string()),
  contextLength: v2.number(),
  maxOutputTokens: v2.optional(v2.number()),
  supportsImages: v2.boolean(),
  supportsTools: v2.boolean(),
  supportsReasoning: v2.boolean(),
  supportsFiles: v2.optional(v2.boolean()),
  inputModalities: v2.optional(v2.array(v2.string())),
  free: v2.boolean(),
  isActive: v2.optional(v2.boolean()),
  createdAt: v2.number(),
});
var userImageModelSchema = v2.object({
  userId: v2.id("users"),
  modelId: v2.string(),
  name: v2.string(),
  provider: v2.string(),
  description: v2.optional(v2.string()),
  supportedAspectRatios: v2.optional(v2.array(v2.string())),
  supportsUpscaling: v2.optional(v2.boolean()),
  supportsInpainting: v2.optional(v2.boolean()),
  supportsOutpainting: v2.optional(v2.boolean()),
  supportsImageToImage: v2.optional(v2.boolean()),
  supportsMultipleImages: v2.optional(v2.boolean()),
  supportsNegativePrompt: v2.optional(v2.boolean()),
  modelVersion: v2.optional(v2.string()),
  owner: v2.optional(v2.string()),
  tags: v2.optional(v2.array(v2.string())),
  selected: v2.optional(v2.boolean()),
  createdAt: v2.number(),
});
var imageModelDefinitionSchema = v2.object({
  modelId: v2.string(),
  name: v2.string(),
  provider: v2.string(),
  description: v2.string(),
  modelVersion: v2.string(),
  owner: v2.string(),
  tags: v2.array(v2.string()),
  supportedAspectRatios: v2.array(v2.string()),
  supportsUpscaling: v2.boolean(),
  supportsInpainting: v2.boolean(),
  supportsOutpainting: v2.boolean(),
  supportsImageToImage: v2.boolean(),
  supportsMultipleImages: v2.boolean(),
  supportsNegativePrompt: v2.optional(v2.boolean()),
  coverImageUrl: v2.optional(v2.string()),
  exampleImages: v2.optional(v2.array(v2.string())),
  createdAt: v2.number(),
  lastUpdated: v2.number(),
});
var _modelForInternalActionsSchema = v2.object({
  modelId: v2.string(),
  name: v2.string(),
  provider: v2.string(),
  supportsReasoning: v2.boolean(),
  supportsImages: v2.optional(v2.boolean()),
  supportsTools: v2.optional(v2.boolean()),
  supportsFiles: v2.optional(v2.boolean()),
  contextLength: v2.optional(v2.number()),
  free: v2.optional(v2.boolean()),
  isActive: v2.optional(v2.boolean()),
  selected: v2.optional(v2.boolean()),
  maxOutputTokens: v2.optional(v2.number()),
  inputModalities: v2.optional(v2.array(v2.string())),
});
var attachmentSchema = v2.object({
  type: v2.union(v2.literal("image"), v2.literal("pdf"), v2.literal("text")),
  url: v2.string(),
  name: v2.string(),
  size: v2.float64(),
  content: v2.optional(v2.string()),
  thumbnail: v2.optional(v2.string()),
  storageId: v2.optional(v2.id("_storage")),
  mimeType: v2.optional(v2.string()),
  textFileId: v2.optional(v2.id("_storage")),
  extractedText: v2.optional(v2.string()),
  extractionError: v2.optional(v2.string()),
  generatedImage: v2.optional(
    v2.object({
      isGenerated: v2.boolean(),
      source: v2.string(),
      model: v2.optional(v2.string()),
      prompt: v2.optional(v2.string()),
    })
  ),
});
var reasoningConfigSchema = v2.object({
  enabled: v2.boolean(),
  effort: v2.union(v2.literal("low"), v2.literal("medium"), v2.literal("high")),
  maxTokens: v2.optional(v2.number()),
});
var messageRoleSchema = v2.union(
  v2.literal("user"),
  v2.literal("assistant"),
  v2.literal("system"),
  v2.literal("context")
);
var providerSchema = v2.union(
  v2.literal("openai"),
  v2.literal("anthropic"),
  v2.literal("google"),
  v2.literal("groq"),
  v2.literal("openrouter"),
  v2.literal("replicate"),
  v2.literal("elevenlabs")
);
var webCitationSchema = v2.object({
  type: v2.literal("url_citation"),
  url: v2.string(),
  title: v2.string(),
  cited_text: v2.optional(v2.string()),
  snippet: v2.optional(v2.string()),
  description: v2.optional(v2.string()),
  image: v2.optional(v2.string()),
  favicon: v2.optional(v2.string()),
  siteName: v2.optional(v2.string()),
  publishedDate: v2.optional(v2.string()),
  author: v2.optional(v2.string()),
});
var _messageMetadataSchema = v2.object({
  tokenCount: v2.optional(v2.number()),
  reasoningTokenCount: v2.optional(v2.number()),
  finishReason: v2.optional(v2.string()),
  duration: v2.optional(v2.number()),
  thinkingDurationMs: v2.optional(v2.number()),
  stopped: v2.optional(v2.boolean()),
  searchQuery: v2.optional(v2.string()),
  searchFeature: v2.optional(v2.string()),
  searchCategory: v2.optional(v2.string()),
  searchMode: v2.optional(
    v2.union(v2.literal("fast"), v2.literal("auto"), v2.literal("deep"))
  ),
});
var extendedMessageMetadataSchema = v2.object({
  tokenCount: v2.optional(v2.number()),
  reasoningTokenCount: v2.optional(v2.number()),
  finishReason: v2.optional(v2.string()),
  duration: v2.optional(v2.number()),
  thinkingDurationMs: v2.optional(v2.number()),
  stopped: v2.optional(v2.boolean()),
  searchQuery: v2.optional(v2.string()),
  searchFeature: v2.optional(v2.string()),
  searchCategory: v2.optional(v2.string()),
  searchMode: v2.optional(
    v2.union(v2.literal("fast"), v2.literal("auto"), v2.literal("deep"))
  ),
  status: v2.optional(v2.union(v2.literal("pending"), v2.literal("error"))),
  webSearchCost: v2.optional(v2.number()),
  temperature: v2.optional(v2.number()),
  usage: v2.optional(
    v2.object({
      promptTokens: v2.number(),
      completionTokens: v2.number(),
      totalTokens: v2.number(),
    })
  ),
});
var ttsAudioCacheEntrySchema = v2.object({
  storageId: v2.id("_storage"),
  voiceId: v2.optional(v2.string()),
  modelId: v2.optional(v2.string()),
  outputFormat: v2.optional(v2.string()),
  optimizeLatency: v2.optional(v2.string()),
  textHash: v2.string(),
  createdAt: v2.number(),
  mimeType: v2.optional(v2.string()),
  sizeBytes: v2.optional(v2.number()),
});
var modelProviderArgs = {
  model: v2.optional(v2.string()),
  provider: v2.optional(v2.string()),
};
var _conversationActionArgs = {
  conversationId: v2.id("conversations"),
  ...modelProviderArgs,
};
var _messageCreationArgs = {
  content: v2.string(),
  attachments: v2.optional(v2.array(attachmentSchema)),
  useWebSearch: v2.optional(v2.boolean()),
};
var _conversationCreationSchema = v2.object({
  title: v2.string(),
  userId: v2.id("users"),
  personaId: v2.optional(v2.id("personas")),
  sourceConversationId: v2.optional(v2.id("conversations")),
  isStreaming: v2.optional(v2.boolean()),
  isPinned: v2.optional(v2.boolean()),
  isArchived: v2.optional(v2.boolean()),
  createdAt: v2.optional(v2.number()),
  updatedAt: v2.optional(v2.number()),
});
var _messageCreationSchema = v2.object({
  conversationId: v2.id("conversations"),
  role: messageRoleSchema,
  content: v2.string(),
  reasoning: v2.optional(v2.string()),
  model: v2.optional(v2.string()),
  provider: v2.optional(providerSchema),
  reasoningConfig: v2.optional(reasoningConfigSchema),
  parentId: v2.optional(v2.id("messages")),
  isMainBranch: v2.optional(v2.boolean()),
  sourceConversationId: v2.optional(v2.id("conversations")),
  useWebSearch: v2.optional(v2.boolean()),
  attachments: v2.optional(v2.array(attachmentSchema)),
  citations: v2.optional(v2.array(webCitationSchema)),
  metadata: v2.optional(extendedMessageMetadataSchema),
  createdAt: v2.optional(v2.number()),
});
var _contextMessageSchema = v2.object({
  role: v2.union(
    v2.literal("user"),
    v2.literal("assistant"),
    v2.literal("system")
  ),
  content: v2.union(
    v2.string(),
    v2.array(
      v2.object({
        type: v2.union(
          v2.literal("text"),
          v2.literal("image_url"),
          v2.literal("file")
        ),
        text: v2.optional(v2.string()),
        image_url: v2.optional(v2.object({ url: v2.string() })),
        file: v2.optional(
          v2.object({
            filename: v2.string(),
            file_data: v2.string(),
          })
        ),
        attachment: v2.optional(
          v2.object({
            storageId: v2.id("_storage"),
            type: v2.string(),
            name: v2.string(),
          })
        ),
      })
    )
  ),
});
var _reasoningConfigForActionSchema = v2.object({
  enabled: v2.boolean(),
  effort: v2.union(v2.literal("low"), v2.literal("medium"), v2.literal("high")),
  maxTokens: v2.optional(v2.number()),
});
var exportPayload = v2.object({
  includeAttachments: v2.boolean(),
  conversationIds: v2.optional(v2.array(v2.id("conversations"))),
});
var importPayload = v2.object({
  fileUrl: v2.string(),
  fileName: v2.optional(v2.string()),
  originalFormat: v2.optional(v2.string()),
});
var bulkArchivePayload = v2.object({
  conversationIds: v2.array(v2.id("conversations")),
});
var bulkDeletePayload = v2.object({
  conversationIds: v2.array(v2.id("conversations")),
  permanentDelete: v2.optional(v2.boolean()),
});
var conversationSummaryPayload = v2.object({
  conversationId: v2.id("conversations"),
  messageRange: v2.optional(
    v2.object({
      startMessageId: v2.optional(v2.id("messages")),
      endMessageId: v2.optional(v2.id("messages")),
    })
  ),
});
var migrationPayload = v2.object({
  migrationVersion: v2.string(),
  batchSize: v2.optional(v2.number()),
});
var _jobPayloadSchema = v2.union(
  v2.object({ type: v2.literal("export"), data: exportPayload }),
  v2.object({ type: v2.literal("import"), data: importPayload }),
  v2.object({ type: v2.literal("bulk_archive"), data: bulkArchivePayload }),
  v2.object({ type: v2.literal("bulk_delete"), data: bulkDeletePayload }),
  v2.object({
    type: v2.literal("conversation_summary"),
    data: conversationSummaryPayload,
  }),
  v2.object({ type: v2.literal("data_migration"), data: migrationPayload }),
  v2.object({ type: v2.literal("model_migration"), data: migrationPayload }),
  v2.object({ type: v2.literal("backup"), data: v2.object({}) })
);
var exportResult = v2.object({
  fileStorageId: v2.id("_storage"),
  fileSizeBytes: v2.number(),
  totalConversations: v2.number(),
  totalMessages: v2.number(),
});
var importResult = v2.object({
  totalImported: v2.number(),
  totalProcessed: v2.number(),
  errors: v2.array(v2.string()),
  conversationIds: v2.array(v2.string()),
});
var bulkOperationResult = v2.object({
  totalProcessed: v2.number(),
  successCount: v2.number(),
  errorCount: v2.number(),
  errors: v2.array(v2.string()),
});
var summaryResult = v2.object({
  summary: v2.string(),
  tokenCount: v2.optional(v2.number()),
  model: v2.optional(v2.string()),
});
var migrationResult = v2.object({
  migratedCount: v2.number(),
  skippedCount: v2.number(),
  errorCount: v2.number(),
  errors: v2.array(v2.string()),
});
var backgroundJobTypeSchema = v2.union(
  v2.literal("export"),
  v2.literal("import"),
  v2.literal("bulk_archive"),
  v2.literal("bulk_delete"),
  v2.literal("conversation_summary"),
  v2.literal("data_migration"),
  v2.literal("model_migration"),
  v2.literal("backup")
);
var backgroundJobCategorySchema = v2.union(
  v2.literal("data_transfer"),
  v2.literal("bulk_operations"),
  v2.literal("ai_processing"),
  v2.literal("maintenance")
);
var backgroundJobStatusSchema = v2.union(
  v2.literal("scheduled"),
  v2.literal("processing"),
  v2.literal("completed"),
  v2.literal("failed"),
  v2.literal("cancelled")
);
var backgroundJobPrioritySchema = v2.union(
  v2.literal("low"),
  v2.literal("normal"),
  v2.literal("high"),
  v2.literal("urgent")
);
var openRouterSortingSchema = v2.union(
  v2.literal("default"),
  v2.literal("price"),
  v2.literal("throughput"),
  v2.literal("latency")
);
var userSchema = v2.object({
  name: v2.optional(v2.string()),
  email: v2.optional(v2.string()),
  emailVerified: v2.optional(v2.number()),
  emailVerificationTime: v2.optional(v2.number()),
  image: v2.optional(v2.string()),
  isAnonymous: v2.optional(v2.boolean()),
  messagesSent: v2.optional(v2.number()),
  createdAt: v2.optional(v2.number()),
  monthlyMessagesSent: v2.optional(v2.number()),
  monthlyLimit: v2.optional(v2.number()),
  lastMonthlyReset: v2.optional(v2.number()),
  hasUnlimitedCalls: v2.optional(v2.boolean()),
  conversationCount: v2.optional(v2.number()),
  totalMessageCount: v2.optional(v2.number()),
});
var accountSchema = v2.object({
  userId: v2.id("users"),
  type: v2.string(),
  provider: v2.string(),
  providerAccountId: v2.string(),
  refresh_token: v2.optional(v2.string()),
  access_token: v2.optional(v2.string()),
  expires_at: v2.optional(v2.number()),
  token_type: v2.optional(v2.string()),
  scope: v2.optional(v2.string()),
  id_token: v2.optional(v2.string()),
  session_state: v2.optional(v2.string()),
});
var sessionSchema = v2.object({
  sessionToken: v2.string(),
  userId: v2.id("users"),
  expires: v2.number(),
});
var conversationSchema = v2.object({
  title: v2.string(),
  userId: v2.id("users"),
  personaId: v2.optional(v2.id("personas")),
  sourceConversationId: v2.optional(v2.id("conversations")),
  isStreaming: v2.optional(v2.boolean()),
  isPinned: v2.optional(v2.boolean()),
  isArchived: v2.optional(v2.boolean()),
  tokenEstimate: v2.optional(v2.number()),
  activeBranchId: v2.optional(v2.string()),
  activeForkDefaultBranchId: v2.optional(v2.string()),
  activeForkRootId: v2.optional(v2.id("messages")),
  parentConversationId: v2.optional(v2.id("conversations")),
  branchFromMessageId: v2.optional(v2.id("messages")),
  branchId: v2.optional(v2.string()),
  rootConversationId: v2.optional(v2.id("conversations")),
  createdAt: v2.number(),
  updatedAt: v2.number(),
});
var sharedConversationSchema = v2.object({
  shareId: v2.string(),
  originalConversationId: v2.id("conversations"),
  userId: v2.id("users"),
  title: v2.string(),
  sharedAt: v2.number(),
  lastUpdated: v2.number(),
  messageCount: v2.number(),
});
var userApiKeySchema = v2.object({
  userId: v2.id("users"),
  provider: v2.string(),
  encryptedKey: v2.optional(v2.array(v2.number())),
  initializationVector: v2.optional(v2.array(v2.number())),
  clientEncryptedKey: v2.optional(v2.string()),
  partialKey: v2.string(),
  isValid: v2.boolean(),
  createdAt: v2.number(),
  lastValidated: v2.optional(v2.number()),
});
var personaSchema = v2.object({
  userId: v2.optional(v2.id("users")),
  name: v2.string(),
  description: v2.string(),
  prompt: v2.string(),
  icon: v2.optional(v2.string()),
  ttsVoiceId: v2.optional(v2.string()),
  temperature: v2.optional(v2.number()),
  topP: v2.optional(v2.number()),
  topK: v2.optional(v2.number()),
  frequencyPenalty: v2.optional(v2.number()),
  presencePenalty: v2.optional(v2.number()),
  repetitionPenalty: v2.optional(v2.number()),
  advancedSamplingEnabled: v2.optional(v2.boolean()),
  isBuiltIn: v2.boolean(),
  isActive: v2.boolean(),
  order: v2.optional(v2.number()),
  createdAt: v2.number(),
  updatedAt: v2.number(),
});
var _personaImportSchema = v2.object({
  name: v2.string(),
  description: v2.string(),
  prompt: v2.string(),
  icon: v2.optional(v2.string()),
});
var userPersonaSettingsSchema = v2.object({
  userId: v2.id("users"),
  personaId: v2.id("personas"),
  isDisabled: v2.boolean(),
  createdAt: v2.number(),
  updatedAt: v2.number(),
});
var userSettingsSchema = v2.object({
  userId: v2.id("users"),
  personasEnabled: v2.optional(v2.boolean()),
  defaultModelSelected: v2.optional(v2.boolean()),
  openRouterSorting: v2.optional(openRouterSortingSchema),
  anonymizeForDemo: v2.optional(v2.boolean()),
  autoArchiveEnabled: v2.optional(v2.boolean()),
  autoArchiveDays: v2.optional(v2.number()),
  ttsVoiceId: v2.optional(v2.string()),
  ttsModelId: v2.optional(v2.string()),
  ttsUseAudioTags: v2.optional(v2.boolean()),
  ttsStabilityMode: v2.optional(
    v2.union(
      v2.literal("creative"),
      v2.literal("natural"),
      v2.literal("robust")
    )
  ),
  createdAt: v2.number(),
  updatedAt: v2.number(),
});
var _userSettingsUpdateSchema = v2.object({
  personasEnabled: v2.optional(v2.boolean()),
  defaultModelSelected: v2.optional(v2.boolean()),
  openRouterSorting: v2.optional(openRouterSortingSchema),
  anonymizeForDemo: v2.optional(v2.boolean()),
  autoArchiveEnabled: v2.optional(v2.boolean()),
  autoArchiveDays: v2.optional(v2.number()),
  ttsVoiceId: v2.optional(v2.string()),
  ttsModelId: v2.optional(v2.string()),
  ttsUseAudioTags: v2.optional(v2.boolean()),
  ttsStabilityMode: v2.optional(
    v2.union(
      v2.literal("creative"),
      v2.literal("natural"),
      v2.literal("robust")
    )
  ),
});
var messageStatusSchema = v2.union(
  v2.literal("thinking"),
  v2.literal("searching"),
  v2.literal("reading_pdf"),
  v2.literal("streaming"),
  v2.literal("done"),
  v2.literal("error")
);
var imageGenerationSchema = v2.object({
  replicateId: v2.optional(v2.string()),
  status: v2.optional(v2.string()),
  output: v2.optional(v2.array(v2.string())),
  error: v2.optional(v2.string()),
  metadata: v2.optional(
    v2.object({
      duration: v2.optional(v2.number()),
      model: v2.optional(v2.string()),
      prompt: v2.optional(v2.string()),
      params: v2.optional(
        v2.object({
          aspectRatio: v2.optional(v2.string()),
          steps: v2.optional(v2.number()),
          guidanceScale: v2.optional(v2.number()),
          seed: v2.optional(v2.number()),
          negativePrompt: v2.optional(v2.string()),
          count: v2.optional(v2.number()),
        })
      ),
    })
  ),
});
var messageSchema = v2.object({
  conversationId: v2.id("conversations"),
  role: v2.string(),
  content: v2.string(),
  status: v2.optional(messageStatusSchema),
  statusText: v2.optional(v2.string()),
  reasoning: v2.optional(v2.string()),
  model: v2.optional(v2.string()),
  provider: v2.optional(v2.string()),
  reasoningConfig: v2.optional(reasoningConfigSchema),
  parentId: v2.optional(v2.id("messages")),
  isMainBranch: v2.boolean(),
  branchId: v2.optional(v2.string()),
  sourceConversationId: v2.optional(v2.id("conversations")),
  useWebSearch: v2.optional(v2.boolean()),
  attachments: v2.optional(v2.array(attachmentSchema)),
  citations: v2.optional(v2.array(webCitationSchema)),
  metadata: v2.optional(extendedMessageMetadataSchema),
  imageGeneration: v2.optional(imageGenerationSchema),
  error: v2.optional(v2.string()),
  ttsAudioCache: v2.optional(v2.array(ttsAudioCacheEntrySchema)),
  createdAt: v2.number(),
  completedAt: v2.optional(v2.number()),
});
var messageFavoriteSchema = v2.object({
  userId: v2.id("users"),
  messageId: v2.id("messages"),
  conversationId: v2.id("conversations"),
  createdAt: v2.number(),
});
var backgroundJobManifestSchema = v2.object({
  totalConversations: v2.number(),
  totalMessages: v2.number(),
  totalAttachments: v2.optional(v2.number()),
  attachmentTypes: v2.optional(v2.record(v2.string(), v2.number())),
  totalAttachmentSizeBytes: v2.optional(v2.number()),
  conversationDateRange: v2.object({
    earliest: v2.number(),
    latest: v2.number(),
  }),
  conversationTitles: v2.array(v2.string()),
  includeAttachments: v2.boolean(),
  fileSizeBytes: v2.optional(v2.number()),
  version: v2.string(),
});
var backgroundJobResultSchema = v2.object({
  totalImported: v2.number(),
  totalProcessed: v2.number(),
  errors: v2.array(v2.string()),
  conversationIds: v2.optional(v2.array(v2.string())),
});
var backgroundJobSchema = v2.object({
  jobId: v2.string(),
  userId: v2.id("users"),
  type: backgroundJobTypeSchema,
  category: backgroundJobCategorySchema,
  status: backgroundJobStatusSchema,
  totalItems: v2.number(),
  processedItems: v2.number(),
  priority: backgroundJobPrioritySchema,
  retryCount: v2.number(),
  maxRetries: v2.number(),
  createdAt: v2.number(),
  updatedAt: v2.number(),
  startedAt: v2.optional(v2.number()),
  completedAt: v2.optional(v2.number()),
  title: v2.optional(v2.string()),
  description: v2.optional(v2.string()),
  payload: v2.optional(v2.any()),
  error: v2.optional(v2.string()),
  conversationIds: v2.optional(v2.array(v2.id("conversations"))),
  includeAttachments: v2.optional(v2.boolean()),
  manifest: v2.optional(backgroundJobManifestSchema),
  fileStorageId: v2.optional(v2.id("_storage")),
  result: v2.optional(backgroundJobResultSchema),
});
var _jobResultSchema = v2.union(
  v2.object({ type: v2.literal("export"), data: exportResult }),
  v2.object({ type: v2.literal("import"), data: importResult }),
  v2.object({ type: v2.literal("bulk_archive"), data: bulkOperationResult }),
  v2.object({ type: v2.literal("bulk_delete"), data: bulkOperationResult }),
  v2.object({ type: v2.literal("conversation_summary"), data: summaryResult }),
  v2.object({ type: v2.literal("data_migration"), data: migrationResult }),
  v2.object({ type: v2.literal("model_migration"), data: migrationResult }),
  v2.object({ type: v2.literal("backup"), data: exportResult })
);
var pdfTextCacheSchema = v2.object({
  cacheKey: v2.string(),
  textFileId: v2.id("_storage"),
  extractedAt: v2.number(),
  contentLength: v2.number(),
  wordCount: v2.number(),
  expiresAt: v2.number(),
});

// convex/schema.ts
var schema_default = defineSchema2({
  ...authTables,
  users: defineTable2(userSchema).index("email", ["email"]),
  accounts: defineTable2(accountSchema).index("by_provider_account", [
    "provider",
    "providerAccountId",
  ]),
  sessions: defineTable2(sessionSchema).index("by_session_token", [
    "sessionToken",
  ]),
  conversations: defineTable2(conversationSchema)
    .index("by_user_recent", ["userId", "updatedAt"])
    .index("by_user_pinned", ["userId", "isPinned", "updatedAt"])
    .index("by_user_archived", ["userId", "isArchived", "updatedAt"])
    .index("by_created_at", ["createdAt"])
    .index("by_root_updated", ["rootConversationId", "updatedAt"])
    .index("by_parent", ["parentConversationId", "updatedAt"])
    .index("by_branch", ["branchId", "updatedAt"])
    .searchIndex("search_title", {
      searchField: "title",
      filterFields: ["userId", "isArchived"],
    }),
  sharedConversations: defineTable2(sharedConversationSchema)
    .index("by_share_id", ["shareId"])
    .index("by_original_conversation", ["originalConversationId"])
    .index("by_user", ["userId"])
    .index("by_last_updated", ["lastUpdated"]),
  messages: defineTable2(messageSchema)
    .index("by_conversation", ["conversationId", "createdAt"])
    .index("by_parent", ["parentId"])
    .index("by_conversation_main_branch", [
      "conversationId",
      "isMainBranch",
      "createdAt",
    ])
    .index("by_conversation_role", ["conversationId", "role", "createdAt"])
    .index("by_conversation_streaming", [
      "conversationId",
      "role",
      "metadata.finishReason",
    ])
    .index("by_created_at", ["createdAt"])
    .searchIndex("search_content", {
      searchField: "content",
      filterFields: ["conversationId", "isMainBranch"],
    }),
  userApiKeys: defineTable2(userApiKeySchema).index("by_user_provider", [
    "userId",
    "provider",
  ]),
  userModels: defineTable2(userModelSchema).index("by_user", ["userId"]),
  userImageModels: defineTable2(userImageModelSchema).index("by_user", [
    "userId",
  ]),
  imageModelDefinitions: defineTable2(imageModelDefinitionSchema)
    .index("by_model_id", ["modelId"])
    .index("by_provider", ["provider"])
    .index("by_created_at", ["createdAt"]),
  builtInModels: defineTable2(builtInModelSchema)
    .index("by_provider", ["provider"])
    .index("by_active", ["isActive", "createdAt"]),
  personas: defineTable2(personaSchema)
    .index("by_user_active", ["userId", "isActive"])
    .index("by_built_in", ["isBuiltIn"]),
  userPersonaSettings: defineTable2(userPersonaSettingsSchema).index(
    "by_user_persona",
    ["userId", "personaId"]
  ),
  conversationSummaries: defineTable2({
    conversationId: v2.id("conversations"),
    chunkIndex: v2.number(),
    summary: v2.string(),
    messageCount: v2.number(),
    firstMessageId: v2.id("messages"),
    lastMessageId: v2.id("messages"),
    createdAt: v2.number(),
    updatedAt: v2.number(),
  })
    .index("by_conversation_chunk", ["conversationId", "chunkIndex"])
    .index("by_conversation_updated", ["conversationId", "updatedAt"]),
  userSettings: defineTable2(userSettingsSchema)
    .index("by_user", ["userId"])
    .index("by_auto_archive_enabled", ["autoArchiveEnabled"]),
  backgroundJobs: defineTable2(backgroundJobSchema)
    .index("by_user_and_type", ["userId", "type"])
    .index("by_user_and_status", ["userId", "status"])
    .index("by_user_and_category", ["userId", "category"])
    .index("by_status_and_created", ["status", "createdAt"])
    .index("by_user_updated", ["userId", "updatedAt"])
    .index("by_user_id_and_job_id", ["userId", "jobId"])
    .index("by_user_id", ["userId"])
    .index("by_job_id", ["jobId"]),
  pdfTextCache: defineTable2(pdfTextCacheSchema)
    .index("by_cache_key", ["cacheKey"])
    .index("by_expires_at", ["expiresAt"]),
  messageFavorites: defineTable2(messageFavoriteSchema)
    .index("by_user_created", ["userId", "createdAt"])
    .index("by_user_message", ["userId", "messageId"])
    .index("by_user_conversation", ["userId", "conversationId", "createdAt"]),
});
export { schema_default as default };
