// This adapter preserves String(value || '') for JSON.parse values with ordinary JSON prototypes.
export type JsonValue = null | boolean | number | string | JsonValue[] | {[key:string]:JsonValue};
function jsonText(value:JsonValue):string {
  if(value===null)return 'null';
  if(typeof value!=='object')return String(value);
  if(Array.isArray(value))return value.map(item=>item===null?'':jsonText(item)).join(',');
  // JSON properties cannot be functions: an own toString blocks the inherited
  // conversion and Object.prototype.valueOf cannot yield a primitive.
  if(Object.hasOwn(value,'toString'))throw new TypeError('Cannot convert object to primitive value');
  return '[object Object]';
}
export function legacyJsonLoginText(value:JsonValue|undefined):string {
  return jsonText(value || '');
}

// Direct JSON String conversion; callers retain their original || / ?? fallback.
export function legacyJsonValueText(value:JsonValue):string { return jsonText(value); }
